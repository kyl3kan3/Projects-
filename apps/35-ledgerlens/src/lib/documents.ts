/**
 * Ingesting a document, and deciding what to *call* one.
 *
 * Two things live here that are easy to get wrong.
 *
 * **Dedupe.** A forwarded email arrives twice more often than you would think — the
 * operator forwards it, then forwards the whole thread. Byte-identical content
 * produces a second `documents` row deliberately, marked `duplicate` and pointed at
 * the original, so the operator can see the forward was received without a second
 * entry appearing in their books. The partial unique index on
 * `(organization_id, content_hash) where duplicate_of_id is null` is what guarantees
 * "one entry, one visible duplicate record, never two entries".
 *
 * **Status.** `documents.status` is a stored column that background work maintains,
 * which means it can be stale — the classic version of this bug is an invoice still
 * rendering "Due" 212 days after it was paid. So the UI never renders the column: it
 * renders `displayStatus()`, derived at read time from the facts (is there an
 * unresolved review item? is the line item confirmed? is the org over its cap right
 * now?).
 */

import { and, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  documents,
  lineItems,
  reviewItems,
  type DocumentRow,
  type DocumentSource,
} from "@/db/schema";
import { addDays, type IsoDate } from "@/lib/dates";
import { audit, SYSTEM } from "@/lib/audit";
import { bumpUsage } from "@/lib/org";
import { periodOf, toIsoDate } from "@/lib/dates";
import { putDocument, ALLOWED_DOCUMENT_MIME, MAX_DOCUMENT_BYTES, sha256 } from "@/lib/storage";
import { ValidationError } from "@/lib/errors";

/** A document stuck in `extracting` for longer than this is treated as queued again. */
export const STALE_EXTRACTING_MS = 5 * 60 * 1000;

/** The window in which two documents with the same vendor and total are suspicious. */
export const DUPLICATE_WINDOW_DAYS = 3;

export type DisplayStatus =
  | "queued"
  | "parked"
  | "extracting"
  | "needs_review"
  | "confirmed"
  | "rejected"
  | "duplicate";

export interface DisplayStatusInput {
  status: DocumentRow["status"];
  duplicateOfId: string | null;
  extractingSince: Date | null;
  openReviewCount: number;
  hasLineItem: boolean;
  lineItemConfirmed: boolean;
  /** True when the org has already used its plan's extraction cap this period. */
  atCap: boolean;
  now?: number;
}

/**
 * What this document actually is, right now. Derived, never read off the column.
 */
export function displayStatus(input: DisplayStatusInput): DisplayStatus {
  if (input.duplicateOfId) return "duplicate";
  if (input.status === "duplicate") return "duplicate";
  if (input.status === "rejected") return "rejected";
  if (input.openReviewCount > 0) return "needs_review";
  if (input.lineItemConfirmed) return "confirmed";
  if (input.status === "extracting") {
    const since = input.extractingSince?.getTime() ?? 0;
    const now = input.now ?? Date.now();
    return now - since > STALE_EXTRACTING_MS ? "queued" : "extracting";
  }
  if (input.status === "queued") return input.atCap ? "parked" : "queued";
  // Extraction landed, nothing is flagged, but the line item was never vouched for.
  // That is a review, not a confirmation.
  return input.hasLineItem ? "needs_review" : "queued";
}

export const STATUS_COPY: Record<DisplayStatus, string> = {
  queued: "QUEUED",
  parked: "OVER CAP",
  extracting: "EXTRACTING",
  needs_review: "NEEDS REVIEW",
  confirmed: "CONFIRMED",
  rejected: "REJECTED",
  duplicate: "DUPLICATE",
};

/* ----------------------------------------------------------------- ingest --- */

export interface IngestInput {
  organizationId: string;
  source: DocumentSource;
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
  sourceText?: string | null;
  emailMessageId?: string | null;
  receivedAt?: Date;
}

export interface IngestResult {
  documentId: string;
  contentHash: string;
  /** Set when this was byte-identical to something already ingested. */
  duplicateOfId: string | null;
  /** True when an `extract-document` run should be kicked off for this row. */
  needsExtraction: boolean;
}

/**
 * Store the bytes, insert the row, and report whether it needs extraction.
 *
 * Deliberately does *not* extract: ingestion has to return in well under a second
 * (a webhook provider will retry otherwise), and extraction takes seconds.
 */
export async function ingestDocument(input: IngestInput): Promise<IngestResult> {
  if (!ALLOWED_DOCUMENT_MIME.has(input.mimeType)) {
    throw new ValidationError(`We cannot read ${input.mimeType} files yet.`);
  }
  if (input.bytes.byteLength === 0) throw new ValidationError("That file was empty.");
  if (input.bytes.byteLength > MAX_DOCUMENT_BYTES) {
    throw new ValidationError("That file is larger than 12 MB.");
  }

  const db = getDb();
  const contentHash = sha256(input.bytes);
  const receivedAt = input.receivedAt ?? new Date();

  // An email provider that retries the same message must not produce a second row
  // even if the attachment bytes differ (a re-render of the same HTML body will).
  if (input.emailMessageId) {
    const [seen] = await db
      .select({ id: documents.id, contentHash: documents.contentHash })
      .from(documents)
      .where(
        and(
          eq(documents.organizationId, input.organizationId),
          eq(documents.emailMessageId, input.emailMessageId),
          eq(documents.contentHash, contentHash),
        ),
      );
    if (seen) {
      return { documentId: seen.id, contentHash, duplicateOfId: null, needsExtraction: false };
    }
  }

  const [original] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.organizationId, input.organizationId),
        eq(documents.contentHash, contentHash),
        isNull(documents.duplicateOfId),
      ),
    );

  const stored = await putDocument(input.organizationId, input.bytes, input.mimeType);

  const [row] = await db
    .insert(documents)
    .values({
      organizationId: input.organizationId,
      source: input.source,
      storageKey: stored.key,
      mimeType: input.mimeType,
      contentHash,
      originalFilename: input.filename.slice(0, 200),
      byteSize: stored.bytes,
      emailMessageId: input.emailMessageId ?? null,
      sourceText: input.sourceText?.slice(0, 20_000) ?? null,
      status: original ? "duplicate" : "queued",
      duplicateOfId: original?.id ?? null,
      receivedAt,
    })
    .returning();

  await bumpUsage(input.organizationId, periodOf(toIsoDate(receivedAt, "UTC")), { ingested: 1 });

  if (original) {
    await audit(input.organizationId, SYSTEM, "document.duplicate", row.id, {
      duplicateOf: original.id,
      source: input.source,
    });
  } else {
    await audit(input.organizationId, SYSTEM, "document.ingested", row.id, {
      source: input.source,
      filename: input.filename,
    });
  }

  return {
    documentId: row.id,
    contentHash,
    duplicateOfId: original?.id ?? null,
    needsExtraction: !original,
  };
}

/* ------------------------------------------------------- duplicate window --- */

export interface DuplicateWindowCandidate {
  documentId: string;
  docDate: IsoDate;
  amountCents: number;
}

/**
 * Same vendor, same total, within three days: probably the same purchase captured
 * twice (photographed at the counter, then the emailed copy forwarded that evening).
 * Not the same bytes, so the hash cannot see it.
 *
 * This only ever *flags* a candidate. Merging is a human decision — two $48.12 fills
 * at the same Shell station on consecutive days is a completely ordinary week for a
 * landscaper, and auto-merging would quietly delete a real deduction.
 */
export async function findDuplicateCandidate(
  organizationId: string,
  documentId: string,
  vendorId: string | null,
  docDate: IsoDate,
  amountCents: number,
): Promise<DuplicateWindowCandidate | null> {
  if (!vendorId) return null;
  const db = getDb();
  const rows = await db
    .select({
      documentId: lineItems.documentId,
      docDate: lineItems.docDate,
      amountCents: lineItems.amountCents,
    })
    .from(lineItems)
    .innerJoin(documents, eq(documents.id, lineItems.documentId))
    .where(
      and(
        eq(lineItems.organizationId, organizationId),
        eq(lineItems.vendorId, vendorId),
        eq(lineItems.amountCents, amountCents),
        ne(lineItems.documentId, documentId),
        // Typed operators, not a raw `sql` fragment with a Date in it: a Date inside
        // a raw fragment skips Drizzle's encoder and throws at runtime.
        gte(lineItems.docDate, addDays(docDate, -DUPLICATE_WINDOW_DAYS)),
        lte(lineItems.docDate, addDays(docDate, DUPLICATE_WINDOW_DAYS)),
        ne(documents.status, "duplicate"),
      ),
    )
    .orderBy(lineItems.docDate)
    .limit(1);
  return rows[0] ?? null;
}

/* ------------------------------------------------------------- open review --- */

/** Unresolved review-item counts for a set of documents, keyed by document id. */
export async function openReviewCounts(
  documentIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (documentIds.length === 0) return out;
  const rows = await getDb()
    .select({ documentId: reviewItems.documentId, n: sql<number>`count(*)::int` })
    .from(reviewItems)
    .where(and(inArray(reviewItems.documentId, documentIds), isNull(reviewItems.resolvedAt)))
    .groupBy(reviewItems.documentId);
  for (const row of rows) out.set(row.documentId, Number(row.n));
  return out;
}

/** How many documents in the whole org still have an unresolved field. */
export async function openReviewDocumentCount(organizationId: string): Promise<number> {
  const rows = await getDb()
    .select({ n: sql<number>`count(distinct ${reviewItems.documentId})::int` })
    .from(reviewItems)
    .where(and(eq(reviewItems.organizationId, organizationId), isNull(reviewItems.resolvedAt)));
  return Number(rows[0]?.n ?? 0);
}

/** Source line for a row: "forwarded · Mar 12" / "photo · Mar 12". */
export function sourceLabel(source: DocumentSource): string {
  switch (source) {
    case "email":
      return "forwarded";
    case "photo":
      return "photo";
    default:
      return "uploaded";
  }
}
