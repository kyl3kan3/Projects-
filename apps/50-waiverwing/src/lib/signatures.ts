/**
 * src/lib/signatures.ts
 *
 * Signature capture + evidence: the record that has to hold up eighteen
 * months later. Timestamp, IP, user agent, channel, initials per clause,
 * and a hash of the exact text signed.
 *
 * TODO:
 * - [ ] captureSignature(input): validate kind (typed|drawn), store
 *       drawn strokes as SVG path data to S3, compute expires_at from
 *       the waiver's expiry rule, write the signatures row.
 * - [ ] textHash(versionId): SHA-256 over lib/waivers renderVersionText
 *       -- the same canonical rendering the signer saw.
 * - [ ] Consent-to-sign disclosure acknowledgment gate before capture.
 * - [ ] Kiosk offline path: accept a client-generated offline_key and
 *       upsert-on-conflict so replayed syncs are exactly-once (ROADMAP
 *       criterion: replay 5x -> one row).
 * - [ ] evidenceSummary(signatureId): the human-readable block for PDFs
 *       and the participant detail (DESIGN.md mono evidence line).
 * - [ ] Receipt email trigger (Resend; DRY_RUN=1 logs instead).
 */

import type { SignatureKind, SigningChannel } from "../db/schema";

export interface SignatureInput {
  participantId: string;
  waiverVersionId: string;
  locationId: string;
  kind: SignatureKind;
  channel: SigningChannel;
  initials: Record<string, string>;
  offlineKey?: string;
}

export function captureSignature(_input: SignatureInput): Promise<string> {
  throw new Error("Not implemented");
}
