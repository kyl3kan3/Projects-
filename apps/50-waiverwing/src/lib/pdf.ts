/**
 * src/lib/pdf.ts
 *
 * Signed-waiver PDF rendering (pdf-lib) -- the "here it is, counsel"
 * artifact. Rendered on demand in a route handler, cached to S3.
 *
 * TODO:
 * - [ ] renderSignedWaiverPdf(signatureId): waiver version text, answers,
 *       per-clause initials, signature image (rasterized from SVG
 *       strokes), evidence summary from lib/signatures; embed self-
 *       hosted Barlow + JetBrains Mono subsets (DESIGN.md type roles).
 * - [ ] Cache key: signatureId + version (immutable inputs -> render
 *       once, serve from S3 signed URLs thereafter).
 * - [ ] bulkExport(accountId, scope): date/location range -> merged PDF
 *       (cap 500 -- ROADMAP criterion) + CSV manifest; record in exports.
 * - [ ] incidentFilePdf(incidentId): description + linked participants +
 *       their exact signed waivers in one document.
 * - [ ] Deterministic layout fixture test (same signature -> same page
 *       count/placement) so records requests are stable.
 */

export interface RenderResult {
  s3Key: string;
  pageCount: number;
  byteSize: number;
}

export function renderSignedWaiverPdf(_signatureId: string): Promise<RenderResult> {
  throw new Error("Not implemented");
}
