/**
 * The 300×80 trend image in the Slack alert card.
 *
 * DESIGN.md's Slack block spec calls for a server-rendered PNG at 2× — dusk
 * series, dashed baseline ghost, amber flare dot at the peak. Slack will not
 * render an SVG in an image block and will not run our CSS, so the pixels have to
 * exist.
 *
 * Rather than pull in a canvas dependency (a native build, and on the portfolio's
 * refuse-to-install list), this writes the PNG directly: an RGB raster, one
 * zlib-deflated IDAT, and the three chunks a decoder needs. It is about eighty
 * lines and has no dependencies beyond `node:zlib`.
 */

import { deflateSync } from "node:zlib";

export const TREND_WIDTH = 300;
export const TREND_HEIGHT = 80;
export const TREND_SCALE = 2;

type Rgb = [number, number, number];

/** The palette, from DESIGN.md. The image is part of the product, not a chart. */
const PANEL: Rgb = [0x14, 0x1b, 0x2b];
const DUSK: Rgb = [0x4a, 0x5c, 0x85];
const DUSK_FILL: Rgb = [0x25, 0x30, 0x49]; // dusk at 35% over panel, pre-mixed
const GHOST: Rgb = [0x57, 0x62, 0x7a];
const AMBER: Rgb = [0xff, 0xb0, 0x20];

class Raster {
  readonly width: number;
  readonly height: number;
  private readonly px: Uint8Array;

  constructor(width: number, height: number, fill: Rgb) {
    this.width = width;
    this.height = height;
    this.px = new Uint8Array(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      this.px[i * 3] = fill[0];
      this.px[i * 3 + 1] = fill[1];
      this.px[i * 3 + 2] = fill[2];
    }
  }

  set(x: number, y: number, color: Rgb): void {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return;
    const i = (py * this.width + px) * 3;
    this.px[i] = color[0];
    this.px[i + 1] = color[1];
    this.px[i + 2] = color[2];
  }

  get(x: number, y: number): Rgb {
    const i = (y * this.width + x) * 3;
    return [this.px[i], this.px[i + 1], this.px[i + 2]];
  }

  /** Vertical run, used for the area fill under the series. */
  vline(x: number, y0: number, y1: number, color: Rgb): void {
    const from = Math.round(Math.min(y0, y1));
    const to = Math.round(Math.max(y0, y1));
    for (let y = from; y <= to; y++) this.set(x, y, color);
  }

  line(x0: number, y0: number, x1: number, y1: number, color: Rgb, weight = 1): void {
    const steps = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      for (let w = 0; w < weight; w++) this.set(x, y + w, color);
    }
  }

  disc(cx: number, cy: number, r: number, color: Rgb): void {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r * r) this.set(cx + x, cy + y, color);
      }
    }
  }

  /** PNG scanlines with filter byte 0 (None) per row. */
  toRawScanlines(): Buffer {
    const stride = this.width * 3;
    const out = Buffer.alloc((stride + 1) * this.height);
    for (let y = 0; y < this.height; y++) {
      out[y * (stride + 1)] = 0;
      Buffer.from(this.px.subarray(y * stride, (y + 1) * stride)).copy(
        out,
        y * (stride + 1) + 1,
      );
    }
    return out;
  }
}

/* ------------------------------------------------------------------- PNG */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(raster: Raster): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(raster.width, 0);
  ihdr.writeUInt32BE(raster.height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour RGB
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raster.toRawScanlines(), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ----------------------------------------------------------- the drawing */

export interface TrendSeries {
  /** Hourly spend, oldest first, micro-dollars. */
  values: number[];
  /** Baseline for the same hours, micro-dollars. */
  baseline: number[];
  /** Index at which the anomaly began; the flare marks the peak after it. */
  onsetIndex: number;
}

/**
 * Render the trend. Deliberately forgiving about its input — this runs inside an
 * alert path, and a chart that throws would take the alert down with it. Bad
 * input produces a flat panel, never an exception.
 */
export function renderTrendPng(series: TrendSeries): Buffer {
  const w = TREND_WIDTH * TREND_SCALE;
  const h = TREND_HEIGHT * TREND_SCALE;
  const raster = new Raster(w, h, PANEL);

  const values = series.values.filter((v) => Number.isFinite(v));
  if (values.length < 2) return encodePng(raster);

  const padTop = 8 * TREND_SCALE;
  const padBottom = 6 * TREND_SCALE;
  const plotH = h - padTop - padBottom;
  const peak = Math.max(...values, ...series.baseline.filter((v) => Number.isFinite(v)), 1);
  const xOf = (i: number) => (i / (values.length - 1)) * (w - 1);
  const yOf = (v: number) => padTop + plotH - (Math.max(0, v) / peak) * plotH;

  // Area fill under the series, then the stroke over it.
  for (let i = 0; i < values.length - 1; i++) {
    const x0 = xOf(i);
    const x1 = xOf(i + 1);
    for (let x = Math.round(x0); x <= Math.round(x1); x++) {
      const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
      const v = values[i] + (values[i + 1] - values[i]) * t;
      raster.vline(x, yOf(v), h - padBottom, DUSK_FILL);
    }
  }

  // The dashed baseline ghost: 6 on, 5 off.
  if (series.baseline.length === values.length) {
    for (let i = 0; i < values.length - 1; i++) {
      const x0 = Math.round(xOf(i));
      const x1 = Math.round(xOf(i + 1));
      for (let x = x0; x <= x1; x++) {
        if (x % 11 > 5) continue;
        const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
        const v = series.baseline[i] + (series.baseline[i + 1] - series.baseline[i]) * t;
        raster.set(x, yOf(v), GHOST);
      }
    }
  }

  for (let i = 0; i < values.length - 1; i++) {
    raster.line(xOf(i), yOf(values[i]), xOf(i + 1), yOf(values[i + 1]), DUSK, 3);
  }

  // The amber flare at the peak of the anomalous stretch.
  const from = Math.max(0, Math.min(series.onsetIndex, values.length - 1));
  let peakIndex = from;
  for (let i = from; i < values.length; i++) {
    if (values[i] > values[peakIndex]) peakIndex = i;
  }
  raster.disc(Math.round(xOf(peakIndex)), Math.round(yOf(values[peakIndex])), 4 * TREND_SCALE - 2, AMBER);

  return encodePng(raster);
}

/** Exposed for tests: the palette the renderer commits to. */
export const TREND_COLORS = { PANEL, DUSK, DUSK_FILL, GHOST, AMBER };
