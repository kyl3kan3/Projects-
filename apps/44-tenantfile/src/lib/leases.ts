/**
 * src/lib/leases.ts
 *
 * Lease e-sign behind a provider adapter (Dropbox Sign-class embedded
 * signing). Upload-your-own lease PDF or start from a state template
 * shell; both parties sign on their phones; the sealed PDF joins the File.
 *
 * TODO:
 * - [ ] EsignProvider interface: createEnvelope(lease), embeddedSignUrl
 *       (signer), voidEnvelope(ref), parseWebhook(payload).
 * - [ ] draftLease(tenancyId, source): map tenancy fields (names, rent,
 *       dates, deposit) into the document's fields.
 * - [ ] Status lifecycle: draft -> sent -> partially_signed -> signed;
 *       webhook-driven, idempotent.
 * - [ ] onSigned(leaseId): pull sealed PDF + audit certificate into R2,
 *       activate the tenancy, generate first charges (prorated first
 *       month + deposit), schedule reminders, stitch the file_event.
 * - [ ] State template shells: metadata only (state, version, updated_at)
 *       — legal-content review process documented, framed as information
 *       not advice.
 */

export type LeaseStatus =
  | "draft"
  | "sent"
  | "partially_signed"
  | "signed"
  | "voided";

export function draftLease(
  _tenancyId: string,
  _source: "upload" | "state_template",
): Promise<void> {
  throw new Error("Not implemented");
}
