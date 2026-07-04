/**
 * src/lib/applications.ts
 *
 * Application intake and pipeline: the standard rental application form,
 * document uploads, status transitions, and the FCRA adverse-action flow
 * on decline-after-screening.
 *
 * TODO:
 * - [ ] submitApplication(listingSlug, answers, documentKeys): validate
 *       (zod), create row, notify landlord, stitch a file_event when the
 *       application converts to a tenancy later.
 * - [ ] Pipeline transitions: new -> invited_to_screen -> screened ->
 *       approved | declined; guard invalid jumps.
 * - [ ] Adverse action: declining a screened applicant REQUIRES the
 *       adverse-action letter step (template + provider contact info),
 *       timestamped in the application row and audit log.
 * - [ ] approveApplication(applicationId): seed a tenancy draft from the
 *       application + unit data.
 * - [ ] Income-ratio computation for the pipeline card ("3.4x RENT").
 */

export function submitApplication(
  _listingSlug: string,
  _answers: Record<string, unknown>,
  _documentKeys: string[],
): Promise<void> {
  throw new Error("Not implemented");
}
