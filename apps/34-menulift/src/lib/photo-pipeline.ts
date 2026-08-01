/**
 * Dish-photo enhancement.
 *
 * The vendor call is behind one narrow interface, {@link PhotoEnhancer}, with two
 * implementations:
 *
 *  - **replicate** — the production path (ARCHITECTURE.md): a hosted relight /
 *    background-cleanup model, then `sharp` for the consistent crop and the web
 *    derivatives. Requires `REPLICATE_API_TOKEN` and a pinned model version.
 *  - **local** — a deterministic `sharp`-only pass: EXIF-correct rotation,
 *    measured relight toward a target exposure, contrast, a touch of saturation,
 *    unsharp mask, and the same 4:3 crop. Selected automatically when no token is
 *    present, which is what makes the *whole* pipeline — upload, candidate,
 *    review, approve, publish — testable without a credential.
 *
 * The local pass does not claim to remove backgrounds. Its `note` states exactly
 * what it did, and that string is what the review card shows the owner. Nothing
 * here ever overwrites the original, and nothing reaches a guest page without an
 * explicit approval (see src/lib/photos.ts).
 */

import { env } from "@/lib/env";

/** Menu photos are cropped to one shape so a section reads as a set. */
export const TARGET_WIDTH = 1280;
export const TARGET_HEIGHT = 960;
export const THUMB_SIZE = 192;

/** Below this, a phone snap is a screenshot or a thumbnail, not a dish photo. */
export const MIN_SOURCE_WIDTH = 480;
/** Mean luma below this cannot be relit into something appetising. */
export const MIN_MEAN_LUMA = 14;
/** Shannon entropy below this means there is almost nothing in the frame. */
export const MIN_ENTROPY = 1.6;

export interface EnhanceRequest {
  bytes: Buffer;
  contentType: string;
}

export interface EnhanceSuccess {
  ok: true;
  provider: string;
  providerRef: string | null;
  /** The candidate, cropped and encoded. Never the original. */
  enhanced: Buffer;
  enhancedContentType: "image/jpeg";
  /** Small square derivative for the guest row's 64px slot. */
  thumb: Buffer;
  thumbContentType: "image/webp";
  /** Plain words for the review card: what actually happened to the photo. */
  note: string;
  durationMs: number;
}

export interface EnhanceFailure {
  ok: false;
  provider: string;
  /** Honest, actionable, shown verbatim to the owner. */
  reason: string;
  durationMs: number;
}

export type EnhanceResult = EnhanceSuccess | EnhanceFailure;

export interface PhotoEnhancer {
  readonly name: string;
  /** True when this provider actually calls a model. */
  readonly usesModel: boolean;
  enhance(request: EnhanceRequest): Promise<EnhanceResult>;
}

/* -------------------------------------------------------------- sharp helpers */

type Sharp = typeof import("sharp");
let _sharp: Sharp | null = null;

async function sharp(): Promise<Sharp> {
  if (!_sharp) _sharp = (await import("sharp")).default;
  return _sharp;
}

export interface SourceCheck {
  ok: boolean;
  reason?: string;
  width?: number;
  height?: number;
  meanLuma?: number;
  entropy?: number;
}

/**
 * Is this photo worth spending a model run on?
 *
 * Refusing early is a feature: "too dark to relight — retake near a window" is
 * worth more to an owner than a grey, muddy candidate they have to reject.
 */
export async function inspectSource(bytes: Buffer): Promise<SourceCheck> {
  const s = await sharp();
  try {
    const image = s(bytes, { failOn: "error" });
    const meta = await image.metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) {
      return { ok: false, reason: "We could not read that file as an image. JPEG, PNG or WebP." };
    }
    if (Math.min(width, height) < MIN_SOURCE_WIDTH) {
      return {
        ok: false,
        width,
        height,
        reason: `That photo is ${width}×${height}. Menu photos need at least ${MIN_SOURCE_WIDTH}px on the short edge — shoot it again at full resolution rather than from a screenshot.`,
      };
    }
    const stats = await s(bytes).stats();
    const channels = stats.channels.slice(0, 3);
    const meanLuma = channels.length
      ? channels.reduce((sum, c) => sum + c.mean, 0) / channels.length
      : 0;
    if (meanLuma < MIN_MEAN_LUMA) {
      return {
        ok: false,
        width,
        height,
        meanLuma,
        reason: "Too dark to relight — retake it near a window or under the pass light.",
      };
    }
    if (stats.entropy < MIN_ENTROPY) {
      return {
        ok: false,
        width,
        height,
        meanLuma,
        entropy: stats.entropy,
        reason: "Almost no detail in that frame. Get closer to the plate and retake.",
      };
    }
    return { ok: true, width, height, meanLuma, entropy: stats.entropy };
  } catch {
    return { ok: false, reason: "We could not read that file as an image. JPEG, PNG or WebP." };
  }
}

/** Target mean luma for a plated dish. Warm, not blown out. */
const TARGET_LUMA = 132;

interface FinishResult {
  enhanced: Buffer;
  thumb: Buffer;
  note: string;
}

/**
 * The `sharp` half of both providers: EXIF rotation, measured relight, contrast,
 * the consistent 4:3 crop, and the derivatives.
 */
async function finish(bytes: Buffer, meanLuma: number, prefix: string): Promise<FinishResult> {
  const s = await sharp();
  // Relight is measured, not guessed: nudge the mean toward TARGET_LUMA, but
  // never by more than 1.6x, which is where JPEG noise starts to show.
  const brightness = Math.min(1.6, Math.max(0.85, meanLuma > 0 ? TARGET_LUMA / meanLuma : 1));
  const pct = Math.round((brightness - 1) * 100);

  const base = s(bytes, { failOn: "error" })
    .rotate()
    .resize(TARGET_WIDTH, TARGET_HEIGHT, { fit: "cover", position: "centre" })
    .modulate({ brightness, saturation: 1.08 })
    .linear(1.06, -8)
    .sharpen({ sigma: 0.8 });

  const enhanced = await base.clone().jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  const thumb = await base
    .clone()
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover", position: "centre" })
    .webp({ quality: 78 })
    .toBuffer();

  const relight =
    pct === 0 ? "exposure held" : pct > 0 ? `relit +${pct}%` : `pulled back ${Math.abs(pct)}%`;
  const note = `${prefix}${relight}, cropped to ${TARGET_WIDTH}×${TARGET_HEIGHT}, contrast and edge pass.`;
  return { enhanced, thumb, note };
}

/* ---------------------------------------------------------- local provider */

class LocalEnhancer implements PhotoEnhancer {
  readonly name = "local-sharp";
  readonly usesModel = false;

  async enhance(request: EnhanceRequest): Promise<EnhanceResult> {
    const startedAt = Date.now();
    const check = await inspectSource(request.bytes);
    if (!check.ok) {
      return { ok: false, provider: this.name, reason: check.reason!, durationMs: Date.now() - startedAt };
    }
    try {
      const { enhanced, thumb, note } = await finish(request.bytes, check.meanLuma ?? TARGET_LUMA, "");
      return {
        ok: true,
        provider: this.name,
        providerRef: null,
        enhanced,
        enhancedContentType: "image/jpeg",
        thumb,
        thumbContentType: "image/webp",
        note,
        durationMs: Date.now() - startedAt,
      };
    } catch (err) {
      return {
        ok: false,
        provider: this.name,
        reason: `The enhancement pass failed on that file (${
          err instanceof Error ? err.message : "unknown error"
        }). The original is untouched — try a different shot.`,
        durationMs: Date.now() - startedAt,
      };
    }
  }
}

/* ------------------------------------------------------ replicate provider */

/**
 * The production provider. Unexercised in this environment: there is no
 * `REPLICATE_API_TOKEN` here, so the selector never returns it and the network
 * call has never run. Everything around it — validation, cropping, derivative
 * generation, the failure copy, the approval gate — is the local provider's code
 * path and is covered.
 */
class ReplicateEnhancer implements PhotoEnhancer {
  readonly name = "replicate";
  readonly usesModel = true;

  constructor(
    private readonly token: string,
    private readonly model: string,
  ) {}

  async enhance(request: EnhanceRequest): Promise<EnhanceResult> {
    const startedAt = Date.now();
    const check = await inspectSource(request.bytes);
    if (!check.ok) {
      return { ok: false, provider: this.name, reason: check.reason!, durationMs: Date.now() - startedAt };
    }

    try {
      const { default: Replicate } = await import("replicate");
      const client = new Replicate({ auth: this.token });
      const dataUri = `data:${request.contentType};base64,${request.bytes.toString("base64")}`;

      const output = (await client.run(this.model as `${string}/${string}`, {
        input: { image: dataUri, prompt: "professional food photography, soft window light, clean background" },
      })) as unknown;

      const url = firstUrl(output);
      if (!url) {
        // A model that returns something we don't understand must never become a
        // confident result. Say so and keep the original.
        return {
          ok: false,
          provider: this.name,
          reason: "The enhancement service returned something we could not read. Nothing was changed — try again in a minute.",
          durationMs: Date.now() - startedAt,
        };
      }

      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) {
        return {
          ok: false,
          provider: this.name,
          reason: `The enhancement service produced a file we could not download (HTTP ${response.status}). Nothing was changed.`,
          durationMs: Date.now() - startedAt,
        };
      }
      const relit = Buffer.from(await response.arrayBuffer());
      const relitCheck = await inspectSource(relit);
      if (!relitCheck.ok) {
        return {
          ok: false,
          provider: this.name,
          reason: "The enhanced result came back unusable, so we kept your original. Retake near a window and try again.",
          durationMs: Date.now() - startedAt,
        };
      }

      const { enhanced, thumb, note } = await finish(
        relit,
        relitCheck.meanLuma ?? TARGET_LUMA,
        "Relit and background-cleaned by model; ",
      );
      return {
        ok: true,
        provider: this.name,
        providerRef: this.model,
        enhanced,
        enhancedContentType: "image/jpeg",
        thumb,
        thumbContentType: "image/webp",
        note,
        durationMs: Date.now() - startedAt,
      };
    } catch (err) {
      return {
        ok: false,
        provider: this.name,
        reason: `The enhancement service did not answer (${
          err instanceof Error ? err.message : "unknown error"
        }). Your original is safe — try again.`,
        durationMs: Date.now() - startedAt,
      };
    }
  }
}

/**
 * Pull the first http(s) URL out of whatever a Replicate model returned — a
 * string, an array, an object with `output`, or a `FileOutput` with `.url()`.
 * Exported because parsing a third party's loose response shape is exactly the
 * kind of code that should be tested.
 */
export function firstUrl(output: unknown, depth = 0): string | null {
  if (depth > 4) return null;
  if (typeof output === "string") {
    return /^https?:\/\//.test(output) ? output : null;
  }
  if (Array.isArray(output)) {
    for (const entry of output) {
      const found = firstUrl(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (output && typeof output === "object") {
    const record = output as Record<string, unknown>;
    if (typeof record.url === "function") {
      try {
        const value = (record.url as () => unknown)();
        return firstUrl(value instanceof URL ? value.toString() : value, depth + 1);
      } catch {
        return null;
      }
    }
    if (record.url instanceof URL) return record.url.toString();
    for (const key of ["url", "output", "image", "images"]) {
      if (key in record) {
        const found = firstUrl(record[key], depth + 1);
        if (found) return found;
      }
    }
  }
  return null;
}

/**
 * Which provider is in play. `DRY_RUN=1` forces the local pass even when a token
 * is present, so staging never spends money.
 */
export function getEnhancer(): PhotoEnhancer {
  const token = env.replicateApiToken;
  const model = env.replicateModel;
  if (token && model && !env.dryRun) return new ReplicateEnhancer(token, model);
  return new LocalEnhancer();
}

/** For the settings screen, so the owner knows what is doing the work. */
export function enhancerDescription(): string {
  const enhancer = getEnhancer();
  return enhancer.usesModel
    ? "AI relight and background cleanup, then a consistent 4:3 crop."
    : "Local relight, contrast and consistent 4:3 crop. No model configured, so no background cleanup.";
}
