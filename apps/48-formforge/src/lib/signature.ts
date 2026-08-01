/**
 * src/lib/signature.ts
 *
 * E-signature evidence. ESIGN/UETA-shaped attribution for a consent block:
 * intent, a consent-to-sign disclosure, the exact text agreed, a timestamp, an
 * IP, a user agent, and a SHA-256 over the canonical rendering of all of it.
 *
 * The load-bearing property, and the reason this file is separate from the
 * database access in lib/intakes.ts:
 *
 *   **a signature record carries its own copy of what was signed.**
 *
 * `signature_records.signed_text` is the consent text as presented, not a
 * foreign key to a row someone can edit. The hash is recomputed here from that
 * stored copy rather than trusted from `form_versions`, so a tampered version
 * row cannot launder a signature, and `verifySignature` can say — months later,
 * offline, from the record alone — whether the evidence still holds.
 */

import { sha256Hex } from "@/lib/crypto";
import { shortHash } from "@/lib/format";
import type { SignatureKind, SignatureRecord } from "@/db/schema";

export class SignatureError extends Error {}

/**
 * The canonical document a signature attests to. Every component that appears in
 * it changes the hash: the form title, the version number, the consent text, and
 * the disclosure the signer accepted.
 *
 * Deliberately a flat, ordered, human-readable string — a future maintainer must
 * be able to reproduce this hash by hand from a printed PDF.
 */
export function canonicalDocument(input: {
  formTitle: string;
  formVersion: number;
  consentText: string;
  disclosure: string;
}): string {
  return [
    `FORM: ${input.formTitle.trim()}`,
    `VERSION: ${input.formVersion}`,
    "",
    input.consentText.replace(/\r\n/g, "\n").trim(),
    "",
    `DISCLOSURE: ${input.disclosure.replace(/\s+/g, " ").trim()}`,
  ].join("\n");
}

/** SHA-256 over the canonical document. What lands in `document_hash`. */
export function documentHash(input: {
  formTitle: string;
  formVersion: number;
  consentText: string;
  disclosure: string;
}): string {
  return sha256Hex(canonicalDocument(input));
}

/**
 * Does the stored evidence still verify?
 *
 * Recomputes the hash from the copies the record carries. A mismatch has exactly
 * one cause — the stored row was altered after the fact — because nothing in this
 * computation reads the form.
 */
export function verifySignature(record: {
  formTitle: string;
  formVersion: number;
  signedText: string;
  disclosureText: string;
  documentHash: string;
}): { ok: boolean; computed: string } {
  const computed = documentHash({
    formTitle: record.formTitle,
    formVersion: record.formVersion,
    consentText: record.signedText,
    disclosure: record.disclosureText,
  });
  return { ok: computed === record.documentHash, computed };
}

/* --------------------------------------------------------------- validation */

export interface SignatureInput {
  kind: SignatureKind;
  /** Typed: the typed name. Drawn: SVG path data. */
  payload: string;
  /** The name the signer claims, always typed even for a drawn mark. */
  signedName: string;
  disclosureAccepted: boolean;
  allowDrawn: boolean;
}

/**
 * Gate the signature before anything is written. The disclosure check is first
 * because an unacknowledged disclosure makes the rest worthless as evidence.
 */
export function validateSignatureInput(input: SignatureInput): string[] {
  const problems: string[] = [];
  if (!input.disclosureAccepted) {
    problems.push("Tick the box above the signature line to confirm you agree to sign electronically.");
  }
  const name = input.signedName.trim();
  if (name.length < 3) problems.push("Type your full legal name above the signature line.");
  if (!/\S+\s+\S+/.test(name)) problems.push("Type your full name — first and last.");
  if (input.kind === "drawn") {
    if (!input.allowDrawn) problems.push("This consent accepts a typed signature only.");
    // An SVG path with a single moveto is a tap, not a signature.
    if (!/^M[\d.\s]/.test(input.payload.trim()) || input.payload.length < 24) {
      problems.push("Draw your signature in the box.");
    }
  } else if (input.payload.trim().length < 3) {
    problems.push("Type your name in the signature box.");
  }
  return problems;
}

/* ----------------------------------------------------------------- evidence */

export interface EvidenceSummary {
  /** `SIGNED · JUL 4 2026 · 14:02 UTC · SHA-256 9F3C…2AB1` (DESIGN.md). */
  monoLine: string;
  lines: string[];
  verified: boolean;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** The stamp date, always rendered in UTC — evidence is not timezone-relative. */
export function stampDateUtc(at: Date): string {
  return `${MONTHS[at.getUTCMonth()]} ${at.getUTCDate()} ${at.getUTCFullYear()} · ${String(
    at.getUTCHours(),
  ).padStart(2, "0")}:${String(at.getUTCMinutes()).padStart(2, "0")} UTC`;
}

/**
 * The human-readable evidence block. One source of truth: the audit stamp under
 * the signature on the patient's phone, the practice's intake detail screen, and
 * the summary page of the exported PDF all render from here.
 *
 * `signedName` is passed in decrypted by the caller (which is what forces the
 * caller through lib/phi.ts and therefore into the audit log).
 */
export function evidenceSummary(
  record: Pick<
    SignatureRecord,
    | "formTitle"
    | "formVersion"
    | "signedText"
    | "disclosureText"
    | "disclosureAcceptedAt"
    | "documentHash"
    | "kind"
    | "signedAt"
    | "ip"
    | "userAgent"
  >,
  signedName: string,
): EvidenceSummary {
  const { ok } = verifySignature(record);
  return {
    monoLine: `SIGNED · ${stampDateUtc(record.signedAt)} · SHA-256 ${shortHash(record.documentHash)}`,
    verified: ok,
    lines: [
      `Document: ${record.formTitle} (version ${record.formVersion})`,
      `Signed by: ${signedName}`,
      `Method: ${record.kind === "drawn" ? "drawn on device" : "typed name"}`,
      `Signed at: ${record.signedAt.toISOString()}`,
      `IP address: ${record.ip ?? "not recorded"}`,
      `Device: ${record.userAgent ?? "not recorded"}`,
      `Consent to sign: "${record.disclosureText}" accepted ${record.disclosureAcceptedAt.toISOString()}`,
      `Document SHA-256: ${record.documentHash}`,
      `Integrity check: ${
        ok
          ? "the stored text still hashes to the recorded value"
          : "MISMATCH — the stored text no longer matches the recorded hash"
      }`,
    ],
  };
}
