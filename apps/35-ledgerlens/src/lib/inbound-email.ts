/**
 * Inbound email: the per-org forwarding address.
 *
 * `docs+{slug}@in.ledgerlens.app` is an open door on the public internet, so the
 * guards are the interesting part of this file, not the parsing:
 *
 *  - **Signature first.** Nothing is parsed, stored or enqueued before the webhook
 *    signature verifies. `RESEND_WEBHOOK_SECRET` unset means *reject*, not "allow" —
 *    an unauthenticated ingest endpoint is a way to fill someone else's books.
 *  - **Unknown slug → 200 and drop.** A 404 on an unknown address turns the endpoint
 *    into an oracle for enumerating valid customer addresses.
 *  - **Size, count and type caps** before anything is written.
 *  - **Sender check.** Anything the org has not sent from before is still accepted —
 *    forwarding from a phone often rewrites the From — but it is recorded, and a
 *    message with no readable financial content at all is dropped rather than paid to
 *    extract.
 *  - **Idempotent by message id + content hash**, because a provider that does not
 *    get a 200 fast enough will send it again.
 *
 * The body itself is captured too: plenty of invoices are an HTML email with the total
 * in the body and no attachment at all, and dropping those would silently lose the
 * receipts of every SaaS an operator buys.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, organizations, type Organization } from "@/db/schema";
import { env } from "@/lib/env";
import { extractAddress, slugFromAddress } from "@/lib/org";
import { ALLOWED_DOCUMENT_MIME, MAX_DOCUMENT_BYTES } from "@/lib/storage";
import { ingestDocument, type IngestResult } from "@/lib/documents";

export const MAX_ATTACHMENTS_PER_MESSAGE = 10;
/** Per-org ceiling on messages accepted in an hour. Abuse guard, not a plan cap. */
export const MAX_MESSAGES_PER_HOUR = 120;

export interface InboundAttachment {
  filename: string;
  contentType: string;
  /** base64, as every inbound-email provider delivers it. */
  content: string;
}

export interface InboundPayload {
  to?: string | string[];
  from?: string;
  subject?: string;
  messageId?: string;
  text?: string;
  html?: string;
  attachments?: InboundAttachment[];
  /** Provider spam score, when present. Higher is worse. */
  spamScore?: number;
}

export interface InboundArtifact {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  /** Text that came with this artifact — the extractor's cheap path. */
  text: string | null;
}

/* -------------------------------------------------------------- signature --- */

/**
 * Verify the provider's signature over the raw body.
 *
 * Resend signs with an Svix-style scheme: `v1,<base64 hmac>` over
 * `{id}.{timestamp}.{body}`, keyed by the secret's base64 payload. Both the
 * `svix-*` and `webhook-*` header spellings are accepted because providers have
 * shipped both.
 */
export function verifyInboundSignature(
  headers: Headers,
  rawBody: string,
): { ok: true } | { ok: false; reason: string } {
  const secret = env.resendWebhookSecret;
  if (!secret) return { ok: false, reason: "webhook_secret_unset" };

  const id = headers.get("svix-id") ?? headers.get("webhook-id");
  const timestamp = headers.get("svix-timestamp") ?? headers.get("webhook-timestamp");
  const signatureHeader = headers.get("svix-signature") ?? headers.get("webhook-signature");
  if (!id || !timestamp || !signatureHeader) return { ok: false, reason: "missing_headers" };

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return { ok: false, reason: "stale_timestamp" };

  const keyMaterial = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let key: Buffer;
  try {
    key = Buffer.from(keyMaterial, "base64");
    if (key.byteLength === 0) key = Buffer.from(keyMaterial, "utf8");
  } catch {
    key = Buffer.from(keyMaterial, "utf8");
  }

  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");

  for (const candidate of signatureHeader.split(" ")) {
    const value = candidate.startsWith("v1,") ? candidate.slice(3) : candidate;
    const a = Buffer.from(value);
    const b = Buffer.from(expected);
    if (a.byteLength === b.byteLength && timingSafeEqual(a, b)) return { ok: true };
  }
  return { ok: false, reason: "signature_mismatch" };
}

/* ------------------------------------------------------------ org lookup --- */

export function recipientAddresses(payload: InboundPayload): string[] {
  const raw = payload.to;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.flatMap((entry) => entry.split(",").map((s) => s.trim())).filter(Boolean);
}

/** The slug from whichever recipient is ours. Null when none is. */
export function resolveOrgSlug(payload: InboundPayload): string | null {
  for (const address of recipientAddresses(payload)) {
    const slug = slugFromAddress(address);
    if (slug) return slug;
  }
  return null;
}

export async function orgForSlug(slug: string): Promise<Organization | null> {
  const [org] = await getDb()
    .select()
    .from(organizations)
    .where(eq(organizations.forwardingSlug, slug));
  return org ?? null;
}

/* -------------------------------------------------------------- artifacts --- */

const HTML_BLOCK = /<\/(?:p|div|tr|li|h[1-6]|table|br)>/gi;

/** HTML email body to readable text, preserving line structure. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(HTML_BLOCK, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

/** True when a body plausibly contains a financial document. */
export function looksFinancial(text: string): boolean {
  if (!text) return false;
  const hasAmount = /[$€£]\s*\d|(?:\b\d+\.\d{2}\b)/.test(text);
  const hasKeyword =
    /\b(?:invoice|receipt|total|amount due|subtotal|order|paid|payment|statement|tax)\b/i.test(text);
  return hasAmount && hasKeyword;
}

export interface ExtractArtifactsResult {
  artifacts: InboundArtifact[];
  /** Attachments refused, with the reason — surfaced in the audit log. */
  skipped: { filename: string; reason: string }[];
}

/**
 * Pick out what is worth storing.
 *
 * Attachments first. When there is no usable attachment, the body itself becomes the
 * document: a text artifact carrying the readable body, which the extractor can read
 * directly. That is deliberately *not* a PDF render — a headless browser in the ingest
 * path is a large dependency and a large attack surface, and the text is what the
 * extractor actually reads either way. The original body text is kept forever, so a
 * rendered copy can be produced later without re-ingesting anything.
 */
export function extractArtifacts(payload: InboundPayload): ExtractArtifactsResult {
  const artifacts: InboundArtifact[] = [];
  const skipped: { filename: string; reason: string }[] = [];
  const bodyText =
    (payload.text?.trim() || "") ||
    (payload.html ? htmlToText(payload.html) : "");

  const attachments = (payload.attachments ?? []).slice(0, MAX_ATTACHMENTS_PER_MESSAGE);
  for (const attachment of payload.attachments?.slice(MAX_ATTACHMENTS_PER_MESSAGE) ?? []) {
    skipped.push({ filename: attachment.filename, reason: "too_many_attachments" });
  }

  for (const attachment of attachments) {
    const mimeType = normalizeMime(attachment.contentType, attachment.filename);
    if (!ALLOWED_DOCUMENT_MIME.has(mimeType)) {
      skipped.push({ filename: attachment.filename, reason: `unsupported_type:${mimeType}` });
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(Buffer.from(attachment.content, "base64"));
    } catch {
      skipped.push({ filename: attachment.filename, reason: "undecodable" });
      continue;
    }
    if (bytes.byteLength === 0) {
      skipped.push({ filename: attachment.filename, reason: "empty" });
      continue;
    }
    if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
      skipped.push({ filename: attachment.filename, reason: "too_large" });
      continue;
    }
    artifacts.push({
      filename: attachment.filename || "attachment",
      mimeType,
      bytes,
      // The covering email often carries the total for a scanned attachment; giving
      // the extractor both is free and strictly better than giving it one.
      text: bodyText || null,
    });
  }

  if (artifacts.length === 0 && looksFinancial(bodyText)) {
    const subject = (payload.subject ?? "Forwarded document").trim();
    const header = [
      subject ? `Subject: ${subject}` : "",
      payload.from ? `From: ${payload.from}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const document = `${header}\n\n${bodyText}`.trim();
    artifacts.push({
      filename: `${slugForFilename(subject)}.txt`,
      mimeType: "text/plain",
      bytes: new Uint8Array(Buffer.from(document, "utf8")),
      text: document,
    });
  }

  return { artifacts, skipped };
}

function normalizeMime(contentType: string, filename: string): string {
  const base = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (base && base !== "application/octet-stream") {
    return base === "image/jpg" ? "image/jpeg" : base;
  }
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "pdf":
      return "application/pdf";
    case "txt":
      return "text/plain";
    default:
      return base || "application/octet-stream";
  }
}

function slugForFilename(subject: string): string {
  return (
    subject
      .toLowerCase()
      .replace(/^(?:re|fw|fwd)\s*:\s*/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "forwarded-document"
  );
}

/* ---------------------------------------------------------------- guards --- */

export async function overHourlyLimit(organizationId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(documents)
    .where(
      and(
        eq(documents.organizationId, organizationId),
        eq(documents.source, "email"),
        sql`${documents.receivedAt} > now() - interval '1 hour'`,
      ),
    );
  return Number(rows[0]?.n ?? 0) >= MAX_MESSAGES_PER_HOUR;
}

/* ------------------------------------------------------------- persistence --- */

export interface PersistResult {
  ingested: IngestResult[];
  duplicates: number;
  skipped: { filename: string; reason: string }[];
}

export async function persistAndEnqueue(
  org: Organization,
  payload: InboundPayload,
): Promise<PersistResult> {
  const { artifacts, skipped } = extractArtifacts(payload);
  const ingested: IngestResult[] = [];
  let duplicates = 0;

  for (const artifact of artifacts) {
    const result = await ingestDocument({
      organizationId: org.id,
      source: "email",
      bytes: artifact.bytes,
      mimeType: artifact.mimeType,
      filename: artifact.filename,
      sourceText: artifact.text,
      emailMessageId: payload.messageId ?? null,
    });
    if (result.duplicateOfId) duplicates += 1;
    ingested.push(result);
  }

  return { ingested, duplicates, skipped };
}

export { extractAddress };
