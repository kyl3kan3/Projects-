/**
 * Chart geometry. Pure functions, no DOM — so the charts are plain SVG rendered
 * on the server and the only client-side work is the CSS animation.
 *
 * DESIGN.md calls for pure SVG at 60fps on a phone, which rules out a charting
 * library: the signature detail is a `stroke-dashoffset` draw and a clip-path
 * reveal, neither of which a library will give up control of.
 *
 * **Numbers here are display coordinates.** Cents arrive as JS numbers because
 * an SVG coordinate is a float by definition. Nothing in this file feeds back
 * into a stored value — the exact figures come from money.ts and are formatted
 * as text beside the picture.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Series {
  /** Cumulative value at each step, in cents. */
  values: number[];
}

export interface Frame {
  width: number;
  height: number;
  padTop: number;
  padBottom: number;
}

export const CURVE_FRAME: Frame = { width: 340, height: 200, padTop: 16, padBottom: 16 };

/**
 * Project a series into the frame. A flat series (every value equal) is drawn
 * down the middle rather than divided by a zero range.
 */
export function project(
  values: readonly number[],
  frame: Frame,
  domain?: { min: number; max: number },
): Point[] {
  if (values.length === 0) return [];
  const min = domain?.min ?? Math.min(0, ...values);
  const max = domain?.max ?? Math.max(0, ...values);
  const range = max - min;
  const innerHeight = frame.height - frame.padTop - frame.padBottom;
  const stepX = values.length > 1 ? frame.width / (values.length - 1) : 0;

  return values.map((value, index) => ({
    x: values.length > 1 ? index * stepX : frame.width / 2,
    y:
      range === 0
        ? frame.padTop + innerHeight / 2
        : frame.padTop + innerHeight - ((value - min) / range) * innerHeight,
  }));
}

/** Shared vertical domain, so two curves in one frame are comparable. */
export function sharedDomain(...series: readonly number[][]): { min: number; max: number } {
  const all = series.flat();
  return { min: Math.min(0, ...all), max: Math.max(0, ...all) };
}

export function polyline(points: readonly Point[]): string {
  if (!points.length) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${round(p.x)} ${round(p.y)}`).join(" ");
}

/** Closed polygon between two curves — the leak's gap fill. */
export function gapArea(upper: readonly Point[], lower: readonly Point[]): string {
  if (upper.length < 2 || lower.length < 2) return "";
  const forward = upper.map((p, i) => `${i === 0 ? "M" : "L"}${round(p.x)} ${round(p.y)}`).join(" ");
  const back = [...lower]
    .reverse()
    .map((p) => `L${round(p.x)} ${round(p.y)}`)
    .join(" ");
  return `${forward} ${back} Z`;
}

/** Path length, for the stroke-dashoffset draw. */
export function pathLength(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return Math.max(1, Math.round(total));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Zero line's y position, when zero is inside the domain. */
export function zeroY(frame: Frame, domain: { min: number; max: number }): number | null {
  if (domain.min > 0 || domain.max < 0) return null;
  const range = domain.max - domain.min;
  if (range === 0) return frame.padTop + (frame.height - frame.padTop - frame.padBottom) / 2;
  const inner = frame.height - frame.padTop - frame.padBottom;
  return frame.padTop + inner - ((0 - domain.min) / range) * inner;
}

/**
 * Opacity for a calendar cell: 15% at the smallest non-zero day, 80% at the
 * largest, per DESIGN.md. A zero day stays `panel` and gets no fill at all.
 */
export function heatOpacity(magnitude: number, maxMagnitude: number): number {
  if (magnitude === 0 || maxMagnitude === 0) return 0;
  const share = Math.min(1, magnitude / maxMagnitude);
  return Math.round((0.15 + share * 0.65) * 100) / 100;
}
