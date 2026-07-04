/**
 * src/lib/inbound-email.ts
 *
 * Inbound email processing for the per-org forwarding addresses
 * (docs+{slug}@in.ledgerlens.app). Called by the inbound webhook route.
 *
 * TODO:
 * - [ ] verifyInboundSignature(request): Resend webhook signature check --
 *       reject anything unsigned before touching the payload.
 * - [ ] resolveOrgFromAddress(to): parse the plus-address slug, look up the
 *       org, return null (and 200-and-drop) for unknown slugs.
 * - [ ] extractArtifacts(payload): attachments first (pdf/images); when no
 *       attachment, render the HTML body to PDF so emailed invoices with
 *       inline totals are still captured.
 * - [ ] Abuse guards: max attachments per message, max size per artifact,
 *       allowed MIME types, per-org hourly ingest rate limit, basic spam
 *       scoring before anything is queued.
 * - [ ] persistAndEnqueue(orgId, artifacts): store to R2 (content hash),
 *       dedupe against existing documents, insert `documents` rows,
 *       enqueue `extract-document` jobs. Idempotent by email_message_id.
 */

export interface InboundArtifact {
  filename: string;
  mimeType: string;
  bytes: number;
}

export function resolveOrgFromAddress(_to: string): string | null {
  throw new Error("Not implemented");
}
