/**
 * src/lib/line.ts — the Line's geometry (pure; Skia draws it).
 *
 * Input: close points + the provisional point; output: path segments
 * (closed solid, provisional 40%/1px), close-dot positions, baseline
 * ticks, and the y-domain with headroom so the line never kisses the
 * edges.
 *
 * TODO: buildLinePath(points, range, size); nice-domain math (no
 * zero-baseline distortion — domain from data, stated honestly);
 * count-up interpolator for the Number.
 */

export interface LineGeometry {
  solidPath: string;
  provisionalPath: string | null;
  dots: Array<{ x: number; y: number }>;
  ticks: Array<{ x: number; label: string }>;
}

export function buildLinePath(
  points: Array<{ month: string; netWorthCents: number; provisional: boolean }>,
  range: "1y" | "3y" | "all",
  size: { width: number; height: number },
): LineGeometry {
  throw new Error("Not implemented");
}
