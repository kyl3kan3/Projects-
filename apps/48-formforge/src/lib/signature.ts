/**
 * src/lib/signature.ts
 *
 * E-signature capture and evidence: ESIGN/UETA-standard attribution for
 * the consent block. Produces the signature_records row and the evidence
 * summary appended to exported PDFs.
 *
 * TODO:
 * - [ ] captureSignature(intakeId, blockKey, payload): validate kind
 *       (typed|drawn), encrypt payload + signed name, record timestamp,
 *       ip, user agent.
 * - [ ] documentHash(consentText, formVersion): SHA-256 over the exact
 *       rendered consent text + version id -- what was signed, provably.
 * - [ ] Consent-to-sign disclosure: signing is blocked until the
 *       disclosure acknowledgment is checked; store the acknowledgment.
 * - [ ] evidenceSummary(recordId): the human-readable block for PDFs
 *       (signer, method, time UTC, IP, hash) -- DESIGN.md audit-stamp
 *       content, one source of truth.
 * - [ ] Drawn signatures: capture as SVG path data (enables the stroke
 *       replay signature detail), rasterize only at PDF render.
 */

import type { SignatureKind } from "../db/schema";

export interface SignatureEvidence {
  signedName: string;
  kind: SignatureKind;
  signedAtIso: string;
  ip: string;
  documentHash: string;
}

export function documentHash(_consentText: string, _formVersionId: string): string {
  throw new Error("Not implemented");
}
