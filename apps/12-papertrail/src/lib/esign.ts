/**
 * E-signature: capability tokens, consent, and the audit trail.
 *
 * The client never authenticates. A document's `public_token` *is* the
 * capability, so the checks around it are the whole security model and they are
 * written as pure functions here — no database, no request context — precisely
 * so they can be tested exhaustively.
 *
 * ESIGN/eIDAS shape (ARCHITECTURE.md §3): explicit consent before signing, the
 * consent sentence stored verbatim with the signature, who/when/where/how kept
 * immutably, and no edit path after signature — voiding and reissuing is the
 * only correction.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import type { DocumentRow, DocumentType, Signature } from "@/db/schema";
import { formatAuditTimestamp } from "@/lib/dates";

/**
 * The sentence the client must tick, stored with the signature verbatim. Defined
 * in its own module so the signing form can render the same words without
 * pulling node:crypto into the browser bundle.
 */
export { CONSENT_TEXT } from "@/lib/consent";

/* ------------------------------------------------------------- the token --- */

/** 32 URL-safe characters — 192 bits, unguessable, safe in an email. */
export function newPublicToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Cheap shape check, so junk in the URL never reaches the database. */
export function isWellFormedToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{22,64}$/.test(token);
}

/** Constant-time comparison, for when a token is checked against a known value. */
export function tokensMatch(provided: string, stored: string): boolean {
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(stored));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* ------------------------------------------------------- token/doc states --- */

export type LinkState =
  | "ok"
  | "malformed"
  | "not_found"
  | "not_sent"
  | "expired"
  | "voided";

/** The subset of a document the access rules actually depend on. */
export interface LinkSubject {
  status: DocumentRow["status"];
  expiresAt: Date | null;
  type: DocumentType;
}

/**
 * May this link be *viewed*? A signed or paid document stays readable forever —
 * it is the client's copy of the record — but a voided one says so, and an
 * expired or never-sent one is not shown at all.
 */
export function linkViewState(
  token: unknown,
  doc: LinkSubject | null,
  now: Date,
): LinkState {
  if (!isWellFormedToken(token)) return "malformed";
  if (!doc) return "not_found";
  if (doc.status === "void") return "voided";
  if (doc.status === "draft") return "not_sent";
  // Expiry never hides a document that has already been acted on: the client
  // must be able to re-read what they accepted, signed, or paid.
  const settled =
    doc.status === "accepted" || doc.status === "signed" || doc.status === "paid";
  if (!settled && doc.expiresAt && now.getTime() > doc.expiresAt.getTime()) return "expired";
  return "ok";
}

export type ActionState =
  | "ok"
  | "malformed"
  | "not_found"
  | "not_sent"
  | "expired"
  | "voided"
  | "wrong_type"
  | "already_done";

/**
 * May this link be used to *sign*? Everything `linkViewState` refuses, plus:
 * the document has to be a contract, it has to be out for signature, and it can
 * only be signed once — a second signature on the same contract is a bug that
 * would corrupt the audit trail.
 */
export function signingState(
  token: unknown,
  doc: LinkSubject | null,
  now: Date,
): ActionState {
  const view = linkViewState(token, doc, now);
  if (view !== "ok") return view;
  const d = doc as LinkSubject;
  if (d.type !== "contract") return "wrong_type";
  if (d.status === "signed") return "already_done";
  if (d.status !== "sent" && d.status !== "viewed") return "not_sent";
  return "ok";
}

/** May this link be used to *accept a proposal*? Same shape, proposal rules. */
export function acceptanceState(
  token: unknown,
  doc: LinkSubject | null,
  now: Date,
): ActionState {
  const view = linkViewState(token, doc, now);
  if (view !== "ok") return view;
  const d = doc as LinkSubject;
  if (d.type !== "proposal") return "wrong_type";
  if (d.status === "accepted") return "already_done";
  if (d.status !== "sent" && d.status !== "viewed") return "not_sent";
  return "ok";
}

/** May this link be used to *pay*? Invoices only, and not once settled. */
export function paymentState(
  token: unknown,
  doc: LinkSubject | null,
  now: Date,
  balanceDue: number,
): ActionState {
  const view = linkViewState(token, doc, now);
  if (view !== "ok") return view;
  const d = doc as LinkSubject;
  if (d.type !== "invoice") return "wrong_type";
  if (balanceDue <= 0) return "already_done";
  return "ok";
}

/** Client-facing explanation for a refused link. Never leaks whether it exists. */
export function explainLinkState(state: LinkState | ActionState): string {
  switch (state) {
    case "ok":
      return "";
    case "expired":
      return "This link has expired. Ask for a fresh copy and it will open again.";
    case "voided":
      return "This document was voided and replaced. Ask for the current version.";
    case "not_sent":
      return "This document isn't ready yet.";
    case "already_done":
      return "This has already been completed — nothing further is needed.";
    case "wrong_type":
      return "That action doesn't apply to this document.";
    default:
      return "We couldn't find that document. Check the link in your email.";
  }
}

/* ------------------------------------------------------------- signatures --- */

export interface SignatureInput {
  signerName: string;
  signerEmail: string;
  method: "typed" | "drawn";
  /** Typed: the name as entered. Drawn: SVG path data from the canvas. */
  signatureData: string;
  consented: boolean;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * Validate what the client submitted before anything is written. A typed
 * signature has to be a name (two characters is not a signature); a drawn one
 * has to be an actual stroke, not an accidental tap.
 */
export function validateSignature(input: SignatureInput): ValidationResult {
  if (!input.consented) {
    return { ok: false, error: "Tick the consent box to sign electronically." };
  }
  const name = input.signerName.trim();
  if (name.length < 2) return { ok: false, error: "Enter your full name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.signerEmail.trim())) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (input.method === "typed") {
    if (input.signatureData.trim().length < 2) {
      return { ok: false, error: "Type your name in the signature field." };
    }
    return { ok: true };
  }
  // A drawn signature is SVG path data; require enough points to be a stroke.
  const points = (input.signatureData.match(/[ML]\s*-?\d/g) ?? []).length;
  if (points < 4) return { ok: false, error: "Draw your signature in the box." };
  if (input.signatureData.length > 20_000) {
    return { ok: false, error: "That signature is too complex to store — try again." };
  }
  return { ok: true };
}

/**
 * The audit block printed under a signature and on the record page — who,
 * when, where, how, and what they agreed to.
 */
export function auditLines(signature: {
  signerName: string;
  signerEmail: string;
  method: string;
  ip: string;
  userAgent: string;
  signedAt: Date;
  consentText: string;
}): string[] {
  const lines = [
    `Signed by ${signature.signerName} (${signature.signerEmail})`,
    formatAuditTimestamp(signature.signedAt),
    `Method: ${signature.method === "drawn" ? "drawn signature" : "typed signature"}`,
  ];
  if (signature.ip) lines.push(`IP ${signature.ip}`);
  if (signature.userAgent) lines.push(shortenUserAgent(signature.userAgent));
  lines.push(`Consent: “${signature.consentText}”`);
  return lines;
}

/** A user agent string is unreadable; the audit trail wants device + browser. */
export function shortenUserAgent(ua: string): string {
  const browser =
    /(Firefox|Edg|CriOS|Chrome|Safari)\/[\d.]+/.exec(ua)?.[1]?.replace("Edg", "Edge").replace("CriOS", "Chrome") ??
    "browser";
  const platform = /\(([^;)]+)/.exec(ua)?.[1]?.trim() ?? "unknown device";
  return `${browser} on ${platform}`;
}

/** The signer's IP as the platform reports it, normalised for storage. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 64);
  return (headers.get("x-real-ip") ?? "").trim().slice(0, 64);
}

/** Has this document been signed? Used to lock editing (immutability rule). */
export function isLocked(doc: Pick<DocumentRow, "status">): boolean {
  return (
    doc.status === "signed" ||
    doc.status === "accepted" ||
    doc.status === "paid" ||
    doc.status === "void"
  );
}

/** A one-line description of the signature for lists and timelines. */
export function describeSignature(sig: Pick<Signature, "signerName" | "signedAt">): string {
  return `${sig.signerName} · ${formatAuditTimestamp(sig.signedAt)}`;
}
