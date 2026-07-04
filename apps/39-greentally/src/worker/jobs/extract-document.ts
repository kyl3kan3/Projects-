/**
 * src/worker/jobs/extract-document.ts
 *
 * Job: fetch a document from R2, run src/lib/extraction, route to
 * accepted | needs_review, write activity_lines, enqueue recompute.
 *
 * TODO:
 * - [ ] PDF -> page images (bounded page count); image docs pass through.
 * - [ ] extractBill + validators; persist field_confidences.
 * - [ ] Status transitions with audit_log rows.
 * - [ ] On acceptance: incremental compute-footprint enqueue + coverage
 *       update.
 * - [ ] Failure path: document.error set, needs_review with empty fields
 *       rather than a stuck "extracting".
 */

export async function extractDocumentJob(_documentId: string): Promise<void> {
  throw new Error("Not implemented");
}
