/**
 * Document ingestion, extraction, review and rejection.
 *
 * The status machine, and the reason for each edge:
 *
 *   uploaded ──▶ extracting ──▶ accepted        every field cleared the threshold and
 *                          │                    no validator blocked
 *                          ├─▶ needs_review     a field was uncertain, or a validator
 *                          │                    blocked, or the reader could not read it
 *                          └─▶ failed           the file itself is unusable
 *   needs_review ─▶ accepted | rejected         by a person, on the review screen
 *
 * There is no path that leaves a document stuck in `extracting`: a failed extraction
 * lands in `needs_review` with an explanation and empty fields to type into, because an
 * operator with a deadline needs a way forward, not an error toast.
 */

import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db";
import {
  activityLines,
  documents,
  reportingPeriods,
  sites,
  type ActivityCategory,
  type Document,
  type DocumentKind,
  type FieldConfidences,
  type Site,
} from "@/db/schema";
import { audit, SYSTEM } from "@/lib/audit";
import { ValidationError } from "@/lib/errors";
import {
  AUTO_ACCEPT_BP,
  getExtractor,
  type ExtractedLine,
} from "@/lib/extraction";
import { enqueue, enqueueRecompute } from "@/lib/jobs";
import {
  getDocumentBytes,
  putDocumentBytes,
  sha256,
  storageKeyFor,
  ALLOWED_DOCUMENT_MIME,
  MAX_DOCUMENT_BYTES,
} from "@/lib/storage";
import { convertToCanonical, CATEGORY_LABEL, formatQuantityMilli } from "@/lib/units";
import { blocking, route, validateLine, type ValidationIssue } from "@/lib/validators";

/* ------------------------------------------------------------------ ingest --- */

export interface IngestInput {
  organizationId: string;
  periodId: string;
  siteId: string | null;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  kind: DocumentKind;
  actor: string;
  actorLabel: string;
}

export interface IngestResult {
  documentId: string;
  duplicateOf?: string;
}

export async function ingestDocument(input: IngestInput): Promise<IngestResult> {
  if (input.bytes.length === 0) throw new ValidationError("That file is empty.");
  if (input.bytes.length > MAX_DOCUMENT_BYTES) {
    throw new ValidationError(
      `That file is ${(input.bytes.length / 1024 / 1024).toFixed(1)} MB. The limit is ${
        MAX_DOCUMENT_BYTES / 1024 / 1024
      } MB.`,
    );
  }
  if (!ALLOWED_DOCUMENT_MIME.has(input.mimeType)) {
    throw new ValidationError(
      `${input.mimeType || "That file type"} cannot be read. Upload a PDF, a photo, or a CSV.`,
    );
  }

  const db = getDb();
  const contentHash = sha256(input.bytes);

  // Byte-identical re-upload: the same bill forwarded twice. Recognised, refused, and
  // recorded — never a second row that would double-count the month.
  const [existing] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.organizationId, input.organizationId),
        eq(documents.contentHash, contentHash),
      ),
    );
  if (existing) {
    await audit({
      organizationId: input.organizationId,
      actor: input.actor,
      actorLabel: input.actorLabel,
      action: "document.duplicate",
      target: input.filename,
      metadata: { existingDocumentId: existing.id, existingFilename: existing.filename },
    });
    return { documentId: existing.id, duplicateOf: existing.filename };
  }

  const [doc] = await db
    .insert(documents)
    .values({
      organizationId: input.organizationId,
      periodId: input.periodId,
      siteId: input.siteId,
      storageKey: "",
      filename: input.filename,
      mimeType: input.mimeType,
      byteSize: input.bytes.length,
      contentHash,
      kind: input.kind,
      status: "uploaded",
    })
    .returning();

  const key = storageKeyFor(input.organizationId, doc.id, input.mimeType);
  await putDocumentBytes(doc.id, key, input.bytes, input.mimeType);
  await db.update(documents).set({ storageKey: key }).where(eq(documents.id, doc.id));

  await audit({
    organizationId: input.organizationId,
    actor: input.actor,
    actorLabel: input.actorLabel,
    action: "document.uploaded",
    target: input.filename,
    metadata: { kind: input.kind, bytes: input.bytes.length, storage: key },
  });

  // A spend CSV is not queued here: its columns have to be mapped by a person first,
  // and guessing a mapping in the background would import a thousand wrong rows.
  if (input.kind !== "spend_csv") {
    await enqueue({
      organizationId: input.organizationId,
      kind: "extract_document",
      payload: { documentId: doc.id },
    });
  }

  return { documentId: doc.id };
}

/* -------------------------------------------------------------- extraction --- */

async function validationContextFor(doc: Document, site: Site, year: number) {
  const db = getDb();
  const rows = await db
    .select({
      documentId: activityLines.documentId,
      siteId: activityLines.siteId,
      category: activityLines.category,
      serviceStart: activityLines.serviceStart,
      serviceEnd: activityLines.serviceEnd,
      provider: activityLines.provider,
      status: documents.status,
    })
    .from(activityLines)
    .innerJoin(documents, eq(activityLines.documentId, documents.id))
    .where(
      and(
        eq(activityLines.periodId, doc.periodId),
        ne(activityLines.documentId, doc.id),
        inArray(documents.status, ["accepted", "needs_review"]),
      ),
    );
  return {
    siteId: site.id,
    year,
    floorAreaSqm: site.floorAreaSqm,
    documentId: doc.id,
    existing: rows.map((r) => ({
      documentId: r.documentId,
      siteId: r.siteId,
      category: r.category,
      serviceStart: r.serviceStart,
      serviceEnd: r.serviceEnd,
      provider: r.provider,
    })),
  };
}

/**
 * Run extraction for one document. Called by the queue; safe to re-run.
 */
export async function runExtraction(documentId: string): Promise<void> {
  const db = getDb();
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!doc) return;
  if (doc.status === "accepted" || doc.status === "rejected") return;

  await db
    .update(documents)
    .set({ status: "extracting", error: null, updatedAt: new Date() })
    .where(eq(documents.id, doc.id));

  const orgSites = await db.select().from(sites).where(eq(sites.organizationId, doc.organizationId));
  const site = doc.siteId ? orgSites.find((s) => s.id === doc.siteId) : orgSites[0];
  const [period] = await db
    .select()
    .from(reportingPeriods)
    .where(eq(reportingPeriods.id, doc.periodId));

  if (!site || !period) {
    await db
      .update(documents)
      .set({
        status: "needs_review",
        error: "This document is not assigned to a site yet. Choose one below.",
        updatedAt: new Date(),
      })
      .where(eq(documents.id, doc.id));
    return;
  }

  const bytes = await getDocumentBytes(doc.id, doc.storageKey);
  const extractor = getExtractor();
  const outcome = await extractor.extract({
    bytes,
    mimeType: doc.mimeType,
    filename: doc.filename,
    contentHash: doc.contentHash,
  });

  // Whatever happens next, the previous reading for this document is gone: a re-run
  // replaces it rather than adding to it.
  await db.delete(activityLines).where(eq(activityLines.documentId, doc.id));

  if (!outcome.ok) {
    await db
      .update(documents)
      .set({
        status: "needs_review",
        error: outcome.message,
        confidenceBp: 0,
        extractor: outcome.extractor,
        extractorModel: outcome.model,
        costMicrocents: doc.costMicrocents + outcome.costMicrocents,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, doc.id));
    await audit({
      organizationId: doc.organizationId,
      actor: SYSTEM,
      action: "extraction.failed",
      target: doc.filename,
      metadata: { reason: outcome.failure, message: outcome.message, extractor: outcome.extractor },
    });
    return;
  }

  const ctx = await validationContextFor(doc, site, period.year);
  const issues: ValidationIssue[] = [];
  for (const line of outcome.reading.lines) {
    issues.push(
      ...validateLine(
        {
          category: line.category,
          quantityMilli: line.quantityMilli,
          serviceStart: line.serviceStart,
          serviceEnd: line.serviceEnd,
          provider: line.provider,
        },
        ctx,
      ),
    );
  }

  await db.insert(activityLines).values(
    outcome.reading.lines.map((line) => ({
      organizationId: doc.organizationId,
      documentId: doc.id,
      siteId: site.id,
      periodId: doc.periodId,
      category: line.category,
      quantityMilli: line.quantityMilli,
      unit: line.unit,
      sourceQuantity: line.sourceQuantity,
      sourceUnit: line.sourceUnit,
      serviceStart: line.serviceStart,
      serviceEnd: line.serviceEnd,
      provider: line.provider,
      fieldConfidences: line.fieldConfidences,
      evidence: line.evidence,
    })),
  );

  const status = route(outcome.reading.confidenceBp, issues, AUTO_ACCEPT_BP);
  const blockers = issues.filter((i) => i.severity === "block");

  await db
    .update(documents)
    .set({
      status,
      siteId: site.id,
      confidenceBp: outcome.reading.confidenceBp,
      provider: outcome.reading.provider ?? "",
      extractor: outcome.extractor,
      extractorModel: outcome.model,
      costMicrocents: doc.costMicrocents + outcome.costMicrocents,
      error: blockers.length > 0 ? blockers.map((b) => b.detail).join(" ") : null,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, doc.id));

  await audit({
    organizationId: doc.organizationId,
    actor: SYSTEM,
    action: "extraction.completed",
    target: describeLines(outcome.reading.lines),
    metadata: {
      confidence: `${Math.floor(outcome.reading.confidenceBp / 100)}%`,
      extractor: outcome.extractor,
      model: outcome.model,
      status,
      blockers: blockers.map((b) => b.kind),
      durationMs: outcome.durationMs,
      costMicrocents: outcome.costMicrocents,
    },
  });

  if (status === "accepted") {
    await enqueueRecompute(doc.organizationId, doc.periodId);
  }
}

function describeLines(lines: ExtractedLine[]): string {
  if (lines.length === 0) return "no readings";
  return lines
    .map((l) => `${formatQuantityMilli(l.quantityMilli)} ${l.unit} ${CATEGORY_LABEL[l.category].toLowerCase()}`)
    .join(", ");
}

/* ------------------------------------------------------------------ review --- */

export interface LineEdit {
  activityLineId: string;
  category: ActivityCategory;
  /** As typed by the operator, in `unit`. */
  quantity: string;
  unit: string;
  serviceStart: string;
  serviceEnd: string;
  provider: string;
}

export interface ReviewInput {
  documentId: string;
  organizationId: string;
  siteId: string;
  userId: string;
  userLabel: string;
  edits: LineEdit[];
}

/**
 * Accept a document from the review screen.
 *
 * Corrections re-run the same validators the automatic path used. If a blocker
 * survives, acceptance is refused with the reason — a review screen that let an
 * operator wave through a duplicate would make the whole check decorative.
 */
export async function acceptDocument(input: ReviewInput): Promise<void> {
  const db = getDb();
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, input.documentId), eq(documents.organizationId, input.organizationId)));
  if (!doc) throw new ValidationError("That document no longer exists.");
  const [period] = await db
    .select()
    .from(reportingPeriods)
    .where(eq(reportingPeriods.id, doc.periodId));
  if (period?.lockedAt) {
    throw new ValidationError(
      `Reporting year ${period.year} is locked. Unlock it before changing its figures.`,
    );
  }
  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, input.siteId), eq(sites.organizationId, input.organizationId)));
  if (!site) throw new ValidationError("Choose a site for this document.");
  if (input.edits.length === 0) {
    throw new ValidationError(
      "There is nothing to accept — add at least one reading, or reject the document.",
    );
  }

  const existingLines = await db
    .select()
    .from(activityLines)
    .where(eq(activityLines.documentId, doc.id));
  const byId = new Map(existingLines.map((l) => [l.id, l]));

  const ctx = await validationContextFor(doc, site, period.year);
  const prepared: {
    id: string;
    category: ActivityCategory;
    quantityMilli: number;
    unit: "kWh" | "L";
    sourceQuantity: string;
    sourceUnit: string;
    serviceStart: string;
    serviceEnd: string;
    provider: string;
    corrected: boolean;
  }[] = [];
  const problems: string[] = [];

  for (const edit of input.edits) {
    const prior = byId.get(edit.activityLineId);
    const qty = Number(edit.quantity.replace(/,/g, "").trim());
    if (!Number.isFinite(qty) || qty <= 0) {
      problems.push(`"${edit.quantity}" is not a quantity.`);
      continue;
    }
    const conv = convertToCanonical(edit.category, qty, edit.unit);
    if (!conv) {
      problems.push(
        `${edit.unit || "(no unit)"} is not a unit of ${CATEGORY_LABEL[edit.category].toLowerCase()}.`,
      );
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(edit.serviceStart) || !/^\d{4}-\d{2}-\d{2}$/.test(edit.serviceEnd)) {
      problems.push("Both service dates are required, as YYYY-MM-DD.");
      continue;
    }
    const candidate = {
      category: edit.category,
      quantityMilli: conv.quantityMilli,
      serviceStart: edit.serviceStart,
      serviceEnd: edit.serviceEnd,
      provider: edit.provider,
    };
    const issues = validateLine(candidate, { ...ctx, siteId: site.id });
    if (blocking(issues)) {
      problems.push(...issues.filter((i) => i.severity === "block").map((i) => i.detail));
      continue;
    }
    prepared.push({
      id: edit.activityLineId,
      ...candidate,
      unit: conv.canonicalUnit,
      sourceQuantity: edit.quantity.trim(),
      sourceUnit: conv.sourceUnitDisplay,
      corrected:
        !prior ||
        prior.quantityMilli !== conv.quantityMilli ||
        prior.category !== edit.category ||
        prior.serviceStart !== edit.serviceStart ||
        prior.serviceEnd !== edit.serviceEnd ||
        prior.provider !== edit.provider,
    });
  }

  if (problems.length > 0) throw new ValidationError(problems.join(" "));

  const corrected = prepared.some((p) => p.corrected);
  const now = new Date();

  await db.transaction(async (tx) => {
    for (const p of prepared) {
      const prior = byId.get(p.id);
      const values = {
        organizationId: doc.organizationId,
        documentId: doc.id,
        siteId: site.id,
        periodId: doc.periodId,
        category: p.category,
        quantityMilli: p.quantityMilli,
        unit: p.unit,
        sourceQuantity: p.sourceQuantity,
        sourceUnit: p.sourceUnit,
        serviceStart: p.serviceStart,
        serviceEnd: p.serviceEnd,
        provider: p.provider,
        // A human signed this off, so every field is now certain by definition.
        fieldConfidences: (p.corrected
          ? { quantity: 10_000, period: 10_000, provider: 10_000, category: 10_000 }
          : (prior?.fieldConfidences ?? {})) as FieldConfidences,
        evidence: prior?.evidence ?? {},
        reviewedBy: input.userId,
        reviewedAt: now,
      };
      if (prior) {
        await tx.update(activityLines).set(values).where(eq(activityLines.id, p.id));
      } else {
        await tx.insert(activityLines).values(values);
      }
    }
    // Any line the operator removed from the form is deleted.
    const kept = new Set(prepared.map((p) => p.id));
    for (const l of existingLines) {
      if (!kept.has(l.id)) await tx.delete(activityLines).where(eq(activityLines.id, l.id));
    }
    await tx
      .update(documents)
      .set({ status: "accepted", siteId: site.id, error: null, updatedAt: now })
      .where(eq(documents.id, doc.id));
  });

  await audit({
    organizationId: doc.organizationId,
    actor: input.userId,
    actorLabel: input.userLabel,
    action: "document.accepted",
    target: `${doc.filename} — ${prepared
      .map((p) => `${formatQuantityMilli(p.quantityMilli)} ${p.unit}`)
      .join(", ")}`,
    metadata: {
      corrected,
      site: site.name,
      lines: prepared.length,
      readings: prepared.map((p) => ({
        category: p.category,
        quantityMilli: p.quantityMilli,
        unit: p.unit,
        serviceStart: p.serviceStart,
        serviceEnd: p.serviceEnd,
      })),
    },
  });

  await enqueueRecompute(doc.organizationId, doc.periodId);
}

export async function rejectDocument(
  documentId: string,
  organizationId: string,
  userId: string,
  userLabel: string,
  reason: string,
): Promise<void> {
  const db = getDb();
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.organizationId, organizationId)));
  if (!doc) throw new ValidationError("That document no longer exists.");
  const [period] = await db
    .select()
    .from(reportingPeriods)
    .where(eq(reportingPeriods.id, doc.periodId));
  if (period?.lockedAt) {
    throw new ValidationError(`Reporting year ${period.year} is locked.`);
  }

  await db.transaction(async (tx) => {
    await tx.delete(activityLines).where(eq(activityLines.documentId, doc.id));
    await tx
      .update(documents)
      .set({ status: "rejected", error: reason || null, updatedAt: new Date() })
      .where(eq(documents.id, doc.id));
  });

  await audit({
    organizationId,
    actor: userId,
    actorLabel: userLabel,
    action: "document.rejected",
    target: doc.filename,
    metadata: { reason },
  });

  // A rejection can remove figures that were already in the total, so recompute.
  await enqueueRecompute(organizationId, doc.periodId);
}

/* ------------------------------------------------------------------- reads --- */

export interface DocumentRow {
  doc: Document;
  siteName: string;
  lines: {
    id: string;
    category: ActivityCategory;
    quantityMilli: number;
    unit: string;
    sourceQuantity: string;
    sourceUnit: string;
    serviceStart: string;
    serviceEnd: string;
    provider: string;
    fieldConfidences: FieldConfidences;
    reviewedBy: string | null;
  }[];
}

export async function listDocuments(periodId: string): Promise<DocumentRow[]> {
  const db = getDb();
  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.periodId, periodId))
    .orderBy(desc(documents.createdAt));
  if (docs.length === 0) return [];
  const lines = await db
    .select()
    .from(activityLines)
    .where(
      inArray(
        activityLines.documentId,
        docs.map((d) => d.id),
      ),
    );
  const siteRows = await db.select().from(sites).where(eq(sites.organizationId, docs[0].organizationId));
  const siteName = new Map(siteRows.map((s) => [s.id, s.name]));

  return docs.map((doc) => ({
    doc,
    siteName: doc.siteId ? (siteName.get(doc.siteId) ?? "—") : "—",
    lines: lines
      .filter((l) => l.documentId === doc.id)
      .sort((a, b) => a.serviceStart.localeCompare(b.serviceStart))
      .map((l) => ({
        id: l.id,
        category: l.category,
        quantityMilli: l.quantityMilli,
        unit: l.unit,
        sourceQuantity: l.sourceQuantity,
        sourceUnit: l.sourceUnit,
        serviceStart: l.serviceStart,
        serviceEnd: l.serviceEnd,
        provider: l.provider,
        fieldConfidences: l.fieldConfidences,
        reviewedBy: l.reviewedBy,
      })),
  }));
}

/** The review queue: needs-review first, then extracting, then the rest. */
export function sortForQueue(rows: DocumentRow[]): DocumentRow[] {
  const rank = (s: Document["status"]) =>
    s === "needs_review" ? 0 : s === "extracting" || s === "uploaded" ? 1 : s === "rejected" || s === "failed" ? 3 : 2;
  return [...rows].sort(
    (a, b) =>
      rank(a.doc.status) - rank(b.doc.status) ||
      b.doc.createdAt.getTime() - a.doc.createdAt.getTime(),
  );
}

/** Group document rows by the month their first reading covers. */
export function groupByMonth(rows: DocumentRow[]): { key: string; label: string; rows: DocumentRow[] }[] {
  const groups = new Map<string, DocumentRow[]>();
  for (const row of rows) {
    const key = row.lines[0]?.serviceStart.slice(0, 7) ?? "unknown";
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] === "unknown" ? -1 : b[0] === "unknown" ? 1 : b[0].localeCompare(a[0])))
    .map(([key, list]) => ({ key, label: monthLabel(key), rows: list }));
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthLabel(key: string): string {
  if (key === "unknown") return "No service period read yet";
  const [y, m] = key.split("-");
  const idx = Number(m) - 1;
  return `${MONTH_NAMES[idx] ?? m} ${y}`;
}

export function shortMonth(index: number): string {
  return (MONTH_NAMES[index] ?? "").slice(0, 3).toUpperCase();
}
