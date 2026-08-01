/**
 * The widget build's own measurements.
 *
 * DESIGN.md requires the speed receipts to come "always from live measurements,
 * never rounded flattering", so the number on Home and on the landing page is the
 * gzipped size of the file this deployment actually serves.
 *
 * It arrives as an imported JSON module written by `src/widget/build.ts`, not as
 * a file read at request time: `public/` is not on a serverless function's
 * filesystem, so reading it there would work locally and return nothing in
 * production — the failure mode where a marketed number silently vanishes. If the
 * measurement is ever missing or zero, the receipts line is not rendered at all
 * rather than falling back to a figure nobody measured.
 */

import buildInfo from "@/widget/build-info.json";

export interface WidgetBuildInfo {
  bytes: number;
  gzipBytes: number;
  budgetBytes: number;
  builtAt: string;
}

export function widgetBuildInfo(): WidgetBuildInfo | null {
  const info = buildInfo as Partial<WidgetBuildInfo>;
  if (typeof info.gzipBytes !== "number" || info.gzipBytes <= 0) return null;
  return {
    bytes: info.bytes ?? 0,
    gzipBytes: info.gzipBytes,
    budgetBytes: info.budgetBytes ?? 15 * 1024,
    builtAt: info.builtAt ?? "",
  };
}
