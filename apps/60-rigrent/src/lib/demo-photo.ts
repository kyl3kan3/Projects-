/**
 * src/lib/demo-photo.ts
 *
 * A dependency-free PNG encoder, used only by the seed script.
 *
 * The seeded yard needs condition photos, and DESIGN_LANGUAGE rule 8 forbids grey
 * placeholder rectangles standing in for content. Since no camera exists in a seed
 * script, this art-directs a stand-in instead: a duotone canvas-and-kraft texture,
 * deterministic per item so the same chair always looks like the same chair, with
 * the load-out and check-in frames differing the way two photographs of the same
 * pallet differ.
 *
 * It writes a real PNG — a real image file, not an SVG pretending to be one, which
 * matters because the app serves stored objects inline with a locked-down CSP and
 * refuses SVG uploads for exactly that reason.
 *
 * Every screen that shows one of these labels the account as demo data.
 */

import { deflateSync } from "node:zlib";

type Rgb = readonly [number, number, number];

const PALETTE: Record<string, Rgb> = {
  kraft: [0xf4, 0xf1, 0xe9],
  sheet: [0xfc, 0xfb, 0xf7],
  line: [0xdd, 0xd8, 0xca],
  ink: [0x23, 0x24, 0x1f],
  dim: [0x6e, 0x6d, 0x62],
  canvas: [0x7a, 0x82, 0x48],
  rust: [0xb0, 0x60, 0x3f],
};

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A deterministic 32-bit hash, so one item always renders the same texture. */
function hash(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10_000) / 10_000;
  };
}

export interface DemoPhotoOptions {
  seed: string;
  direction: "out" | "in";
  /** Draws a rust mark where a damage claim points. */
  damaged?: boolean;
  width?: number;
  height?: number;
}

/**
 * A duotone still: kraft ground, canvas-olive weave, ink shadow along one edge,
 * and — on a damaged in-photo — a rust scuff where the claim says it is.
 */
export function demoPhotoPng(opts: DemoPhotoOptions): Buffer {
  const width = opts.width ?? 480;
  const height = opts.height ?? 360;
  const rand = hash(`${opts.seed}:${opts.direction}`);
  const warmth = opts.direction === "out" ? 1 : 0.94; // the return shot is flatter light
  const rows: Buffer[] = [];

  // Pre-roll the noise so the texture is stable per row rather than per pixel call.
  const weave = Array.from({ length: 24 }, () => rand());

  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const w = weave[(x + y) % weave.length];
      // Canvas weave: two interleaved frequencies, like tarp under raking light.
      const weft = Math.sin(x / 6 + w * 3) * Math.sin(y / 9 + w * 2);
      const mix = 0.28 + weft * 0.16 + w * 0.08;

      let base: Rgb = PALETTE.kraft;
      let accent: Rgb = PALETTE.canvas;

      // A darker band along the bottom third: the shadow under a stack.
      if (y > height * 0.68) {
        base = PALETTE.line;
        accent = PALETTE.dim;
      }
      // A hard ink edge down the left: the crate the gear is strapped to.
      if (x < width * 0.06) {
        base = PALETTE.ink;
        accent = PALETTE.ink;
      }

      let r = Math.round((base[0] * (1 - mix) + accent[0] * mix) * warmth);
      let g = Math.round((base[1] * (1 - mix) + accent[1] * mix) * warmth);
      let b = Math.round((base[2] * (1 - mix) + accent[2] * mix) * warmth);

      // The damage: a rust scuff, bottom-right, only on a return frame.
      if (opts.damaged && opts.direction === "in") {
        const dx = x - width * 0.66;
        const dy = y - height * 0.6;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 46) {
          const t = Math.max(0, 1 - d / 46) * 0.85;
          r = Math.round(r * (1 - t) + PALETTE.rust[0] * t);
          g = Math.round(g * (1 - t) + PALETTE.rust[1] * t);
          b = Math.round(b * (1 - t) + PALETTE.rust[2] * t);
        }
      }

      row[1 + x * 3] = Math.min(255, Math.max(0, r));
      row[2 + x * 3] = Math.min(255, Math.max(0, g));
      row[3 + x * 3] = Math.min(255, Math.max(0, b));
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
