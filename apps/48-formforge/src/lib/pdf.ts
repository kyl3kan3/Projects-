/**
 * src/lib/pdf.ts
 *
 * Archival PDF rendering (pdf-lib) of completed packets: every answer,
 * uploaded-file references, the signature image, and the evidence
 * summary. Runs in the worker; output stored encrypted in S3.
 *
 * TODO:
 * - [ ] renderPacketPdf(intakeId, auditCtx): decrypt via lib/crypto
 *       (audited), lay out per block kind, embed self-hosted Public Sans
 *       + IBM Plex Mono subsets (DESIGN.md type roles).
 * - [ ] Signature page: rasterized signature + evidenceSummary block
 *       from lib/signature.
 * - [ ] Screener pages: items, answers, mono score line, severity band.
 * - [ ] Store to S3 (SSE-KMS) under exports/, insert exports row,
 *       return a short-lived signed URL.
 * - [ ] Deterministic layout fixture test (same intake -> same page
 *       count and field placement) so records requests are stable.
 * - [ ] EHR-lite CSV lives here too: stable columns from
 *       lib/blocks csvColumns, one row per intake.
 */

export interface RenderResult {
  s3Key: string;
  pageCount: number;
  byteSize: number;
}

export function renderPacketPdf(_intakeId: string): Promise<RenderResult> {
  throw new Error("Not implemented");
}
