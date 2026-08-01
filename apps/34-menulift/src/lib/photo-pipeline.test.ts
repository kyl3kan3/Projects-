import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MIN_SOURCE_WIDTH,
  TARGET_HEIGHT,
  TARGET_WIDTH,
  THUMB_SIZE,
  firstUrl,
  getEnhancer,
  inspectSource,
} from "./photo-pipeline";

/**
 * A plausible dish snap, generated rather than committed: a warm plate on a dark
 * table, deliberately under-exposed so the relight has something to do.
 */
async function dishSnap(opts: { width?: number; height?: number; luma?: number } = {}) {
  const sharp = (await import("sharp")).default;
  const width = opts.width ?? 1600;
  const height = opts.height ?? 1200;
  const base = opts.luma ?? 60;
  const channels = 3;
  const data = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      // Radial "plate" in the middle, wood-toned surround, plus a texture ripple.
      const dx = (x - width / 2) / (width / 2);
      const dy = (y - height / 2) / (height / 2);
      const r = Math.sqrt(dx * dx + dy * dy);
      const plate = r < 0.55 ? 1.5 : 0.7;
      const ripple = 12 * Math.sin(x / 7) * Math.cos(y / 11);
      data[i] = clamp(base * plate * 1.25 + ripple);
      data[i + 1] = clamp(base * plate * 0.95 + ripple * 0.6);
      data[i + 2] = clamp(base * plate * 0.6 + ripple * 0.3);
    }
  }
  return sharp(data, { raw: { width, height, channels } }).jpeg({ quality: 90 }).toBuffer();
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

async function flatBlack(width = 1600, height = 1200) {
  const sharp = (await import("sharp")).default;
  return sharp({
    create: { width, height, channels: 3, background: { r: 4, g: 3, b: 3 } },
  })
    .jpeg()
    .toBuffer();
}

test("with no model credential the local provider is selected", () => {
  const enhancer = getEnhancer();
  assert.equal(enhancer.name, "local-sharp");
  assert.equal(enhancer.usesModel, false);
});

test("a real dish snap is enhanced to the menu crop with a thumbnail", async () => {
  const sharp = (await import("sharp")).default;
  const result = await getEnhancer().enhance({
    bytes: await dishSnap(),
    contentType: "image/jpeg",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const meta = await sharp(result.enhanced).metadata();
  assert.equal(meta.width, TARGET_WIDTH);
  assert.equal(meta.height, TARGET_HEIGHT);
  assert.equal(meta.format, "jpeg");

  const thumbMeta = await sharp(result.thumb).metadata();
  assert.equal(thumbMeta.width, THUMB_SIZE);
  assert.equal(thumbMeta.height, THUMB_SIZE);
  assert.equal(thumbMeta.format, "webp");

  assert.match(result.note, /relit \+\d+%/);
  assert.match(result.note, /1280×960/);
});

test("the enhanced candidate is actually brighter than the original", async () => {
  const sharp = (await import("sharp")).default;
  const original = await dishSnap({ luma: 55 });
  const before = await sharp(original).stats();
  const result = await getEnhancer().enhance({ bytes: original, contentType: "image/jpeg" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const after = await sharp(result.enhanced).stats();
  const luma = (s: Awaited<ReturnType<ReturnType<typeof sharp>["stats"]>>) =>
    s.channels.slice(0, 3).reduce((sum, c) => sum + c.mean, 0) / 3;
  assert.ok(luma(after) > luma(before) + 10, "a dim snap comes back visibly relit");
});

test("enhancement is deterministic for the same input", async () => {
  const bytes = await dishSnap();
  const a = await getEnhancer().enhance({ bytes, contentType: "image/jpeg" });
  const b = await getEnhancer().enhance({ bytes, contentType: "image/jpeg" });
  assert.equal(a.ok && b.ok, true);
  if (!a.ok || !b.ok) return;
  assert.ok(a.enhanced.equals(b.enhanced), "same photo in, same candidate out");
});

test("a photo too dark to relight is refused with retake guidance", async () => {
  const result = await getEnhancer().enhance({ bytes: await flatBlack(), contentType: "image/jpeg" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /Too dark to relight/);
  assert.match(result.reason, /window/);
});

test("a screenshot-sized image is refused, naming its dimensions", async () => {
  const sharp = (await import("sharp")).default;
  const small = await sharp({
    create: { width: 320, height: 240, channels: 3, background: { r: 140, g: 110, b: 80 } },
  })
    .jpeg()
    .toBuffer();
  const check = await inspectSource(small);
  assert.equal(check.ok, false);
  assert.match(check.reason!, /320×240/);
  assert.match(check.reason!, new RegExp(`${MIN_SOURCE_WIDTH}px`));
});

test("a file that is not an image is refused, not crashed on", async () => {
  const check = await inspectSource(Buffer.from("this is a CSV, not a photo", "utf8"));
  assert.equal(check.ok, false);
  assert.match(check.reason!, /could not read that file as an image/);

  const result = await getEnhancer().enhance({
    bytes: Buffer.from("%PDF-1.4 not a photo either"),
    contentType: "image/jpeg",
  });
  assert.equal(result.ok, false);
});

test("a featureless frame is refused for having no detail", async () => {
  const sharp = (await import("sharp")).default;
  const flat = await sharp({
    create: { width: 1200, height: 900, channels: 3, background: { r: 150, g: 150, b: 150 } },
  })
    .jpeg()
    .toBuffer();
  const check = await inspectSource(flat);
  assert.equal(check.ok, false);
  assert.match(check.reason!, /no detail/);
});

/* The shape-parsing of a third party's response is where the real bugs live. */

test("firstUrl reads every response shape Replicate returns", () => {
  assert.equal(firstUrl("https://replicate.delivery/out.png"), "https://replicate.delivery/out.png");
  assert.equal(firstUrl(["https://replicate.delivery/a.png"]), "https://replicate.delivery/a.png");
  assert.equal(
    firstUrl({ output: ["https://replicate.delivery/b.png"] }),
    "https://replicate.delivery/b.png",
  );
  assert.equal(
    firstUrl({ url: () => new URL("https://replicate.delivery/c.png") }),
    "https://replicate.delivery/c.png",
  );
  assert.equal(firstUrl({ images: [{ url: "https://replicate.delivery/d.png" }] }), "https://replicate.delivery/d.png");
});

test("firstUrl refuses nonsense rather than inventing a URL", () => {
  assert.equal(firstUrl(null), null);
  assert.equal(firstUrl(undefined), null);
  assert.equal(firstUrl(42), null);
  assert.equal(firstUrl("NSFW content detected"), null);
  assert.equal(firstUrl({ error: "model failed" }), null);
  assert.equal(firstUrl([{ nope: true }]), null);
  assert.equal(
    firstUrl({ url: () => { throw new Error("boom"); } }),
    null,
    "a throwing accessor is a failure, not a crash",
  );
});
