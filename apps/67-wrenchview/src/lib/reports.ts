/**
 * src/lib/reports.ts
 *
 * Report delivery: mint the link, send the SMS (Twilio, consent
 * gated, DRY_RUN prints the link), track delivery, render the DVI
 * PDF.
 *
 * TODO:
 * - [ ] sendReport(inspectionId): mint token -> report_links row ->
 *       SMS; inspection -> sent.
 * - [ ] markViewed(inspectionId): first_viewed_at once.
 * - [ ] renderPdf(inspectionId): pdf-lib report (findings + photos +
 *       decisions) to R2 for the RO jacket.
 */

export async function sendReport(inspectionId: string): Promise<{ linkUrl: string }> {
  throw new Error("Not implemented");
}

export async function renderPdf(inspectionId: string): Promise<{ r2Key: string }> {
  throw new Error("Not implemented");
}
