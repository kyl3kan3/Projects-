/**
 * src/lib/certificates.ts
 *
 * Intake → parse → review, and the review queue's reads.
 *
 * The immutability rule: the **PDF** is evidence and is never overwritten. It is
 * stored content-addressed by sha256, and a replacement certificate is a new row
 * with a new hash. The parsed coverage rows hanging off it are derived data, and a
 * reviewer correcting a misread limit is the intended workflow — every correction
 * is audit-logged with the field that changed.
 */

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  certificates,
  coverages,
  vendors,
  type Certificate,
  type Coverage,
  type CoverageKind,
  type FieldConfidence,
  type Org,
  type User,
  type Vendor,
} from "@/db/schema";
import { appendAudit } from "@/lib/audit";
import { getExtractor, statusFor } from "@/lib/parse";
import { holderMatches, rowConfidence } from "@/lib/acord";
import { certificateKey, getCertificateBytes, putCertificate, sha256 } from "@/lib/storage";
import { env } from "@/lib/env";
import { expectedHolder, persistForVendor } from "@/lib/verdicts";
import { COVERAGE_LABELS } from "@/lib/format";

export const MAX_PDF_BYTES = 12 * 1024 * 1024;

/** A file that is not a PDF is refused at the door, with the reason. */
export function validatePdf(bytes: Uint8Array, filename?: string): string | null {
  if (!bytes.byteLength) return "That file is empty.";
  if (bytes.byteLength > MAX_PDF_BYTES) {
    return `That file is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB. The limit is 12 MB — ask your agent for the certificate on its own rather than the whole policy.`;
  }
  const header = Buffer.from(bytes.subarray(0, 5)).toString("latin1");
  if (header !== "%PDF-") {
    const named = filename ? ` "${filename}" is not a PDF.` : "";
    return `Certificates have to be PDFs.${named} If you have a photo or a scan, ask your agent to email the PDF the carrier issued.`;
  }
  return null;
}

export interface IntakeResult {
  certificateId: string;
  /** True when this exact file was already on file for this vendor. */
  duplicate: boolean;
}

/**
 * Land the PDF and open a certificate row. Nothing here can fail in a way that
 * loses the document: the row and the bytes are written before parsing is even
 * attempted.
 */
export async function intakeCertificate(opts: {
  orgId: string;
  vendorId: string;
  bytes: Uint8Array;
  source: Certificate["source"];
  actor: string;
  filename?: string;
}): Promise<IntakeResult> {
  const db = getDb();
  const hash = sha256(opts.bytes);
  const [existing] = await db
    .select()
    .from(certificates)
    .where(and(eq(certificates.vendorId, opts.vendorId), eq(certificates.sha256, hash)));
  if (existing) return { certificateId: existing.id, duplicate: true };

  const key = certificateKey(opts.orgId, opts.vendorId, hash);
  const [row] = await db
    .insert(certificates)
    .values({
      orgId: opts.orgId,
      vendorId: opts.vendorId,
      r2Key: key,
      sha256: hash,
      source: opts.source,
      parsedStatus: "pending",
    })
    .returning();

  await putCertificate({ key, bytes: opts.bytes, certificateId: row.id });
  await appendAudit({
    orgId: opts.orgId,
    actor: opts.actor,
    action: "certificate.uploaded",
    target: opts.filename ? `${opts.filename} (${hash.slice(0, 12)})` : hash.slice(0, 12),
    metadata: { certificateId: row.id, source: opts.source, bytes: opts.bytes.byteLength },
  });
  return { certificateId: row.id, duplicate: false };
}

/* -------------------------------------------------------------------- parse */

export interface ParseOutcome {
  status: Certificate["parsedStatus"];
  error: string | null;
  lines: number;
  via: "model" | "local" | "none";
}

/**
 * Run extraction and record the result. Safe to call twice: a certificate that has
 * already been reviewed by a human is left alone, and coverage rows are replaced
 * rather than appended.
 */
export async function parseCertificate(certificateId: string): Promise<ParseOutcome> {
  const db = getDb();
  const [cert] = await db.select().from(certificates).where(eq(certificates.id, certificateId));
  if (!cert) return { status: "failed", error: "Certificate not found.", lines: 0, via: "none" };
  if (cert.reviewedAt) {
    // A human has already signed off on this one. Re-parsing would throw away
    // their corrections.
    return { status: cert.parsedStatus, error: null, lines: 0, via: "none" };
  }

  const stored = await getCertificateBytes({ key: cert.r2Key, certificateId: cert.id });
  if (!stored) {
    await db
      .update(certificates)
      .set({
        parsedStatus: "failed",
        parseError: "The stored document could not be read back. Re-upload the certificate.",
        updatedAt: new Date(),
      })
      .where(eq(certificates.id, cert.id));
    return { status: "failed", error: "stored document missing", lines: 0, via: "none" };
  }

  const extractor = getExtractor();
  const outcome = await extractor.extract(stored.bytes);

  if (!outcome.ok) {
    await db
      .update(certificates)
      .set({ parsedStatus: "failed", parseError: outcome.error, updatedAt: new Date() })
      .where(eq(certificates.id, cert.id));
    await appendAudit({
      orgId: cert.orgId,
      actor: `system (${outcome.via} extractor)`,
      action: "certificate.parse_failed",
      target: cert.sha256.slice(0, 12),
      metadata: { certificateId: cert.id, error: outcome.error },
    });
    return { status: "failed", error: outcome.error, lines: 0, via: outcome.via };
  }

  const extracted = outcome.certificate;
  const status = statusFor(extracted, env.reviewThreshold);

  await db.delete(coverages).where(eq(coverages.certificateId, cert.id));
  if (extracted.lines.length) {
    await db.insert(coverages).values(
      extracted.lines.map((line) => ({
        certificateId: cert.id,
        kind: line.kind,
        label: line.label || COVERAGE_LABELS[line.kind],
        limitCents: line.limitCents,
        policyNumber: line.policyNumber,
        effectiveOn: line.effectiveOn,
        expiresOn: line.expiresOn,
        additionalInsured: line.additionalInsured,
        waiverOfSubrogation: line.waiverOfSubrogation,
        confidence: rowConfidence(line),
        fieldConfidence: line.fieldConfidence,
      })),
    );
  }

  await db
    .update(certificates)
    .set({
      parsedStatus: status,
      carrier: extracted.carrier,
      producer: extracted.producer,
      holderName: extracted.holder,
      holderOk: null, // resolved against the org below
      fieldConfidence: extracted.fieldConfidence,
      parseError: null,
      updatedAt: new Date(),
    })
    .where(eq(certificates.id, cert.id));

  // The holder check needs the org's required wording, which the extractor knows
  // nothing about.
  const orgRow = await orgOf(cert.orgId);
  if (orgRow) {
    await db
      .update(certificates)
      .set({ holderOk: holderMatches(extracted.holder, expectedHolder(orgRow)) })
      .where(eq(certificates.id, cert.id));
  }

  await appendAudit({
    orgId: cert.orgId,
    actor: `system (${outcome.via} extractor)`,
    action: "certificate.parsed",
    target: cert.sha256.slice(0, 12),
    metadata: {
      certificateId: cert.id,
      status,
      lines: extracted.lines.length,
      costCents: outcome.usage?.costCents ?? 0,
      repaired: outcome.repaired ?? false,
    },
  });

  // A high-confidence parse enters compliance immediately; anything below the bar
  // waits for a human, and re-evaluating now would be evaluating a form nobody has
  // checked.
  if (status === "parsed" && orgRow) {
    await persistForVendor(orgRow, cert.vendorId);
  }

  return { status, error: null, lines: extracted.lines.length, via: outcome.via };
}

async function orgOf(orgId: string): Promise<Org | null> {
  const db = getDb();
  const { orgs } = await import("@/db/schema");
  const [row] = await db.select().from(orgs).where(eq(orgs.id, orgId));
  return row ?? null;
}

/* ------------------------------------------------------------------- review */

export interface ReviewLineInput {
  /** Existing coverage row id, or null for a line the reviewer is adding. */
  id: string | null;
  kind: CoverageKind;
  label: string;
  limitCents: number | null;
  policyNumber: string | null;
  effectiveOn: string | null;
  expiresOn: string | null;
  additionalInsured: boolean | null;
  waiverOfSubrogation: boolean | null;
}

export interface ReviewInput {
  certificateId: string;
  carrier: string | null;
  producer: string | null;
  holderName: string | null;
  holderOk: boolean;
  lines: ReviewLineInput[];
}

/** Everything a human confirms is confidence 100 — a person read the form. */
const HUMAN: FieldConfidence = {
  limitCents: 100,
  policyNumber: 100,
  effectiveOn: 100,
  expiresOn: 100,
  additionalInsured: 100,
  waiverOfSubrogation: 100,
};

/**
 * Confirm a reviewed certificate. This is the gate: it is the only path that turns
 * `needs_review` or `failed` into `parsed`, and it stamps who did it and when.
 */
export async function confirmReview(
  org: Org,
  user: User,
  input: ReviewInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();
  const [cert] = await db
    .select()
    .from(certificates)
    .where(and(eq(certificates.id, input.certificateId), eq(certificates.orgId, org.id)));
  if (!cert) return { ok: false, error: "That certificate is not in your file." };
  if (!input.lines.length) {
    return {
      ok: false,
      error:
        "A confirmed certificate needs at least one coverage line. If the document is not a certificate, leave it unconfirmed — it stays on file either way.",
    };
  }
  for (const line of input.lines) {
    if (line.limitCents != null && (!Number.isInteger(line.limitCents) || line.limitCents < 0)) {
      return { ok: false, error: `The limit on the ${line.label} line is not a valid amount.` };
    }
    if (line.expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(line.expiresOn)) {
      return { ok: false, error: `The expiry date on the ${line.label} line is not a valid date.` };
    }
    if (line.effectiveOn && !/^\d{4}-\d{2}-\d{2}$/.test(line.effectiveOn)) {
      return { ok: false, error: `The effective date on the ${line.label} line is not a valid date.` };
    }
  }

  const before = await coveragesFor(cert.id);
  const changed = describeCorrections(cert, before, input);

  await db.delete(coverages).where(eq(coverages.certificateId, cert.id));
  await db.insert(coverages).values(
    input.lines.map((line) => ({
      certificateId: cert.id,
      kind: line.kind,
      label: line.label || COVERAGE_LABELS[line.kind],
      limitCents: line.limitCents,
      policyNumber: line.policyNumber,
      effectiveOn: line.effectiveOn,
      expiresOn: line.expiresOn,
      additionalInsured: line.additionalInsured,
      waiverOfSubrogation: line.waiverOfSubrogation,
      confidence: 100,
      fieldConfidence: HUMAN,
    })),
  );

  await db
    .update(certificates)
    .set({
      carrier: input.carrier,
      producer: input.producer,
      holderName: input.holderName,
      holderOk: input.holderOk,
      parsedStatus: "parsed",
      parseError: null,
      fieldConfidence: { carrier: 100, producer: 100, holder: 100 },
      reviewedBy: user.id,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(certificates.id, cert.id));

  await appendAudit({
    orgId: org.id,
    actor: `${user.name} <${user.email}>`,
    action: changed.length ? "certificate.corrected" : "certificate.reviewed",
    target: cert.sha256.slice(0, 12),
    metadata: { certificateId: cert.id, corrections: changed },
  });

  await persistForVendor(org, cert.vendorId);
  return { ok: true };
}

/** Which fields the reviewer actually changed — the audit row's substance. */
function describeCorrections(
  cert: Certificate,
  before: Coverage[],
  input: ReviewInput,
): string[] {
  const out: string[] = [];
  if ((cert.carrier ?? "") !== (input.carrier ?? "")) out.push("carrier");
  if ((cert.producer ?? "") !== (input.producer ?? "")) out.push("producer");
  if ((cert.holderName ?? "") !== (input.holderName ?? "")) out.push("holder");
  if (cert.holderOk !== input.holderOk) out.push("holder match");
  const byId = new Map(before.map((c) => [c.id, c]));
  for (const line of input.lines) {
    const prior = line.id ? byId.get(line.id) : undefined;
    if (!prior) {
      out.push(`added ${line.kind}`);
      continue;
    }
    if (prior.limitCents !== line.limitCents) out.push(`${line.kind} limit`);
    if ((prior.policyNumber ?? "") !== (line.policyNumber ?? "")) out.push(`${line.kind} policy`);
    if ((prior.effectiveOn ?? "") !== (line.effectiveOn ?? "")) out.push(`${line.kind} effective`);
    if ((prior.expiresOn ?? "") !== (line.expiresOn ?? "")) out.push(`${line.kind} expiry`);
    if (prior.additionalInsured !== line.additionalInsured) out.push(`${line.kind} AI`);
    if (prior.waiverOfSubrogation !== line.waiverOfSubrogation) out.push(`${line.kind} WOS`);
  }
  const submitted = new Set(input.lines.map((l) => l.id).filter(Boolean));
  for (const prior of before) {
    if (!submitted.has(prior.id)) out.push(`removed ${prior.kind}`);
  }
  return out;
}

/* -------------------------------------------------------------------- reads */

export async function coveragesFor(certificateId: string): Promise<Coverage[]> {
  const db = getDb();
  return db
    .select()
    .from(coverages)
    .where(eq(coverages.certificateId, certificateId))
    .orderBy(asc(coverages.kind));
}

export async function certificateById(orgId: string, id: string): Promise<Certificate | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(certificates)
    .where(and(eq(certificates.id, id), eq(certificates.orgId, orgId)));
  return row ?? null;
}

export async function certificatesForVendor(vendorId: string): Promise<Certificate[]> {
  const db = getDb();
  return db
    .select()
    .from(certificates)
    .where(eq(certificates.vendorId, vendorId))
    .orderBy(desc(certificates.uploadedAt));
}

export interface ReviewQueueItem {
  certificate: Certificate;
  vendor: Vendor;
  coverages: Coverage[];
}

/** The review queue, oldest first: the longest-waiting certificate is the one
 *  blocking someone's work order. */
export async function reviewQueue(orgId: string, limit = 50): Promise<ReviewQueueItem[]> {
  const db = getDb();
  const rows = await db
    .select({ certificate: certificates, vendor: vendors })
    .from(certificates)
    .innerJoin(vendors, eq(vendors.id, certificates.vendorId))
    .where(
      and(
        eq(certificates.orgId, orgId),
        inArray(certificates.parsedStatus, ["needs_review", "failed", "pending"]),
      ),
    )
    .orderBy(asc(certificates.uploadedAt))
    .limit(limit);
  if (!rows.length) return [];
  const certIds = rows.map((r) => r.certificate.id);
  const allCoverages = await db
    .select()
    .from(coverages)
    .where(inArray(coverages.certificateId, certIds));
  return rows.map((row) => ({
    ...row,
    coverages: allCoverages.filter((c) => c.certificateId === row.certificate.id),
  }));
}

export async function reviewQueueCount(orgId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: certificates.id })
    .from(certificates)
    .where(
      and(
        eq(certificates.orgId, orgId),
        inArray(certificates.parsedStatus, ["needs_review", "failed", "pending"]),
      ),
    );
  return rows.length;
}

/** Which fields on a stored certificate are below the bar — the underlining. */
export function lowConfidence(
  fieldConfidence: FieldConfidence,
  threshold = 80,
): Set<string> {
  const out = new Set<string>();
  for (const [field, value] of Object.entries(fieldConfidence ?? {})) {
    if (value < threshold) out.add(field);
  }
  return out;
}
