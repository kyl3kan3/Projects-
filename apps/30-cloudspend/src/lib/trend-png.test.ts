import assert from "node:assert/strict";
import test from "node:test";
import { inflateSync } from "node:zlib";
import {
  renderTrendPng,
  TREND_COLORS,
  TREND_HEIGHT,
  TREND_SCALE,
  TREND_WIDTH,
} from "./trend-png";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Walk the chunk list the way a decoder would, verifying every CRC. */
function readChunks(png: Buffer): Array<{ type: string; data: Buffer }> {
  assert.deepEqual(png.subarray(0, 8), SIGNATURE, "PNG signature");
  const chunks: Array<{ type: string; data: Buffer }> = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    const stored = png.readUInt32BE(offset + 8 + length);
    // Recompute the CRC over type+data exactly as the spec requires.
    let c = 0xffffffff;
    const body = png.subarray(offset + 4, offset + 8 + length);
    for (let i = 0; i < body.length; i++) {
      c ^= body[i];
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    assert.equal((c ^ 0xffffffff) >>> 0, stored, `CRC for ${type}`);
    chunks.push({ type, data: Buffer.from(data) });
    offset += 12 + length;
  }
  return chunks;
}

function pixels(png: Buffer): { width: number; height: number; at: (x: number, y: number) => number[] } {
  const chunks = readChunks(png);
  const ihdr = chunks.find((c) => c.type === "IHDR");
  assert.ok(ihdr);
  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  assert.equal(ihdr.data[8], 8, "8-bit depth");
  assert.equal(ihdr.data[9], 2, "truecolour RGB");
  const idat = chunks.filter((c) => c.type === "IDAT").map((c) => c.data);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 3 + 1;
  assert.equal(raw.length, stride * height, "scanline count");
  return {
    width,
    height,
    at(x, y) {
      assert.equal(raw[y * stride], 0, "filter byte must be None");
      const i = y * stride + 1 + x * 3;
      return [raw[i], raw[i + 1], raw[i + 2]];
    },
  };
}

const flat = (n: number, v: number) => Array.from({ length: n }, () => v);

test("the PNG is a valid 2x 300x80 truecolour image with correct CRCs", () => {
  const png = renderTrendPng({
    values: flat(48, 2_000_000),
    baseline: flat(48, 2_000_000),
    onsetIndex: 40,
  });
  const img = pixels(png);
  assert.equal(img.width, TREND_WIDTH * TREND_SCALE);
  assert.equal(img.height, TREND_HEIGHT * TREND_SCALE);
  const types = readChunks(png).map((c) => c.type);
  assert.deepEqual(types, ["IHDR", "IDAT", "IEND"]);
});

test("the ground is the panel colour and the fill sits under the series", () => {
  const png = renderTrendPng({
    values: flat(48, 1_000_000),
    baseline: flat(48, 1_000_000),
    onsetIndex: 47,
  });
  const img = pixels(png);
  // Top-left corner is above the series: untouched panel.
  assert.deepEqual(img.at(0, 1), TREND_COLORS.PANEL);
  // Bottom middle is inside the area fill.
  assert.deepEqual(img.at(300, img.height - 14), TREND_COLORS.DUSK_FILL);
});

test("an amber flare is drawn at the peak of the anomalous stretch", () => {
  const values = [...flat(40, 1_000_000), ...flat(7, 4_000_000), 9_000_000];
  const png = renderTrendPng({ values, baseline: flat(48, 1_000_000), onsetIndex: 40 });
  const img = pixels(png);
  let amber = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const [r, g, b] = img.at(x, y);
      if (r === TREND_COLORS.AMBER[0] && g === TREND_COLORS.AMBER[1] && b === TREND_COLORS.AMBER[2]) {
        amber++;
      }
    }
  }
  assert.ok(amber > 20, `expected a flare disc, found ${amber} amber pixels`);
});

test("the flare never marks a peak that happened before the onset", () => {
  // A big early hour, then the real (smaller) anomaly. The flare belongs on the
  // anomaly, not on the historical high.
  const values = [9_000_000, ...flat(40, 1_000_000), ...flat(7, 3_000_000)];
  const png = renderTrendPng({ values, baseline: flat(48, 1_000_000), onsetIndex: 41 });
  const img = pixels(png);
  const isAmber = (x: number, y: number) => {
    const [r, g, b] = img.at(x, y);
    return r === TREND_COLORS.AMBER[0] && g === TREND_COLORS.AMBER[1] && b === TREND_COLORS.AMBER[2];
  };
  let leftAmber = 0;
  let rightAmber = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (!isAmber(x, y)) continue;
      if (x < img.width / 2) leftAmber++;
      else rightAmber++;
    }
  }
  assert.equal(leftAmber, 0);
  assert.ok(rightAmber > 20);
});

test("degenerate input renders a flat panel instead of throwing", () => {
  for (const series of [
    { values: [], baseline: [], onsetIndex: 0 },
    { values: [1_000_000], baseline: [1_000_000], onsetIndex: 0 },
    { values: flat(10, 0), baseline: flat(10, 0), onsetIndex: 0 },
    { values: [Number.NaN, Number.NaN], baseline: [], onsetIndex: 99 },
    { values: flat(10, 1_000_000), baseline: [], onsetIndex: -5 },
  ]) {
    const png = renderTrendPng(series);
    const img = pixels(png);
    assert.equal(img.width, TREND_WIDTH * TREND_SCALE);
  }
});

test("a baseline of a different length is ignored rather than mis-drawn", () => {
  const png = renderTrendPng({
    values: flat(48, 2_000_000),
    baseline: flat(12, 2_000_000),
    onsetIndex: 40,
  });
  const img = pixels(png);
  let ghost = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const [r, g, b] = img.at(x, y);
      if (r === TREND_COLORS.GHOST[0] && g === TREND_COLORS.GHOST[1] && b === TREND_COLORS.GHOST[2]) {
        ghost++;
      }
    }
  }
  assert.equal(ghost, 0);
});
