/**
 * src/lib/files.ts
 *
 * The File: the per-tenancy, append-only event timeline assembled from
 * every other module, and its court-ready PDF export. This is the
 * product's spine and its differentiation.
 *
 * TODO:
 * - [ ] stitch(tenancyId, kind, refId, occurredAt, summary): the single
 *       append path every module calls; append-only, never updated.
 * - [ ] getTimeline(tenancyId, filter?): ordered events with resolved
 *       refs for the timeline UI (newest first on mobile).
 * - [ ] exportPdf(tenancyId): @react-pdf/renderer document — cover
 *       (property, unit, tenancy, term), then the ordered timeline with
 *       amounts/dates in mono, embedded photo thumbnails, lease + report
 *       references; store in R2, presigned download.
 * - [ ] Export completeness check: every charge and payment in the ledger
 *       must appear in the export (test fixture proves it).
 */

import type { FileEventKind } from "../db/schema";

export function stitch(
  _tenancyId: string,
  _kind: FileEventKind,
  _refId: string,
  _occurredAt: Date,
  _summary: string,
): Promise<void> {
  throw new Error("Not implemented");
}

export function exportPdf(_tenancyId: string): Promise<string> {
  throw new Error("Not implemented");
}
