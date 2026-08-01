/**
 * The widget build's own measurements, read from public/widget/manifest.json.
 *
 * DESIGN.md requires the speed receipts to come "always from live measurements,
 * never rounded flattering". So the number on Home is the gzipped size of the
 * file the build produced, and when the manifest is missing the receipts line is
 * not rendered at all rather than showing a marketing figure.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

export interface WidgetBuildInfo {
  bytes: number;
  gzipBytes: number;
  budgetBytes: number;
  builtAt: string;
}

let cached: WidgetBuildInfo | null | undefined;

export async function widgetBuildInfo(): Promise<WidgetBuildInfo | null> {
  if (cached !== undefined) return cached;
  try {
    const file = path.join(process.cwd(), "public", "widget", "manifest.json");
    const parsed = JSON.parse(await readFile(file, "utf8")) as Partial<WidgetBuildInfo>;
    cached =
      typeof parsed.gzipBytes === "number" && parsed.gzipBytes > 0
        ? {
            bytes: parsed.bytes ?? 0,
            gzipBytes: parsed.gzipBytes,
            budgetBytes: parsed.budgetBytes ?? 15 * 1024,
            builtAt: parsed.builtAt ?? "",
          }
        : null;
  } catch {
    // Not built yet (`npm run build:widget`): show nothing rather than a guess.
    cached = null;
  }
  return cached;
}
