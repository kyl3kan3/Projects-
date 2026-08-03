/**
 * PDF rendering.
 *
 * ARCHITECTURE.md's decision, kept: the PDF is the print-CSS report route rendered by
 * headless Chromium, so the screen artefact and the document a procurement analyst
 * opens are the same file. Nothing is laid out twice.
 *
 * Where it runs is the honest part. Chromium does not run inside a Vercel function, so
 * `renderReportPdf` is available when a Chromium binary is present — a long-lived
 * worker, a container, or a developer's machine — and reports its absence plainly
 * otherwise. The report route itself carries `@page` rules and a print stylesheet, so
 * the browser's own Print → Save as PDF produces the same document with no server at
 * all. That fallback is offered in the UI rather than hidden.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/** A short-lived token letting the renderer open the print route without a session. */
export function signRenderToken(reportId: string, ttlSeconds = 300): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = createHmac("sha256", env.signingSecret).update(`${reportId}:${exp}`).digest("base64url");
  return `${exp}.${sig}`;
}

export function verifyRenderToken(reportId: string, token: string): boolean {
  const [expRaw, sig] = token.split(".");
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now() || !sig) return false;
  const expected = Buffer.from(
    createHmac("sha256", env.signingSecret).update(`${reportId}:${exp}`).digest("base64url"),
  );
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export type PdfOutcome =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; reason: "no_browser" | "error"; message: string };

/**
 * Render the print route to A4 PDF bytes.
 *
 * `waitUntil: "networkidle"` matters: the report's fonts are self-hosted and the page
 * must have them before the paint, or the PDF ships in a fallback face.
 */
export async function renderReportPdf(reportId: string, baseUrl: string): Promise<PdfOutcome> {
  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (err) {
    return {
      ok: false,
      reason: "no_browser",
      message: `Playwright is not installed in this runtime (${err instanceof Error ? err.message : String(err)}).`,
    };
  }

  const token = signRenderToken(reportId);
  const url = `${baseUrl}/report/print/${reportId}?token=${encodeURIComponent(token)}`;

  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    // A container often ships its own Chromium rather than Playwright's download —
    // `CHROMIUM_EXECUTABLE_PATH` points at it. Unset, Playwright resolves its own.
    const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH || undefined;
    browser = await chromium.launch({
      executablePath,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
    if (!response || !response.ok()) {
      return {
        ok: false,
        reason: "error",
        message: `The print route returned ${response?.status() ?? "no response"}.`,
      };
    }
    await page.emulateMedia({ media: "print" });
    const bytes = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" },
      displayHeaderFooter: false,
    });
    return { ok: true, bytes: new Uint8Array(bytes) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/Executable doesn't exist|browserType\.launch/i.test(message)) {
      return { ok: false, reason: "no_browser", message };
    }
    return { ok: false, reason: "error", message };
  } finally {
    await browser?.close();
  }
}
