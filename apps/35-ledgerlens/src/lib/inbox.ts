/**
 * Everything the inbox screen renders, in one query pass.
 *
 * The month total is the **confirmed** total. That is a deliberate choice about what
 * the biggest number on the screen means: it is the figure an accountant would accept,
 * not a running guess that shifts every time extraction lands. Unconfirmed documents
 * are counted beside it ("3 need review") rather than folded into it.
 *
 * A document's period is the date on the document, falling back to the date it
 * arrived when nothing could be read off it — otherwise an unreadable scan would have
 * no month at all and would never appear anywhere.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  categories,
  documents,
  lineItems,
  vendors,
  type DocumentRow,
  type Organization,
} from "@/db/schema";
import { alias } from "drizzle-orm/pg-core";
import { periodLabel, type Period } from "@/lib/dates";
import { effectiveDateBetween, effectivePeriodExpr } from "@/lib/periods";
import { displayStatus, openReviewCounts, type DisplayStatus } from "@/lib/documents";
import { currentPeriod, usageFor } from "@/lib/org";
import { documentCapacity, type DocumentCapacity } from "@/lib/plans";

export type InboxFilter = "all" | "needs_review" | "confirmed";

export interface InboxRow {
  document: DocumentRow;
  vendorName: string | null;
  categoryName: string | null;
  amountCents: number | null;
  currency: string;
  docDate: string | null;
  confirmed: boolean;
  openReviewCount: number;
  status: DisplayStatus;
  hasDuplicateCandidate: boolean;
}

export interface InboxView {
  period: Period;
  monthLabel: string;
  /** Confirmed total for the period. */
  totalCents: number;
  currency: string;
  documentCount: number;
  needsReviewCount: number;
  confirmedCount: number;
  parkedCount: number;
  extractingCount: number;
  rows: InboxRow[];
  capacity: DocumentCapacity;
  /** True when the org has nothing at all yet — the first-run screen. */
  firstRun: boolean;
}

export async function loadInbox(
  org: Organization,
  opts: { filter?: InboxFilter; period?: Period } = {},
): Promise<InboxView> {
  const db = getDb();
  const period = opts.period ?? currentPeriod(org);
  const filter = opts.filter ?? "all";

  // The same effective-date rule the close package uses, so the inbox's document count
  // and the package's can never disagree.
  const originalLine = alias(lineItems, "original_line");
  const rawRows = await db
    .select({
      document: documents,
      vendorName: vendors.displayName,
      categoryName: categories.name,
      amountCents: lineItems.amountCents,
      currency: lineItems.currency,
      docDate: lineItems.docDate,
      confirmedAt: lineItems.confirmedAt,
      hasLineItem: sql<boolean>`${lineItems.id} is not null`,
    })
    .from(documents)
    .leftJoin(lineItems, eq(lineItems.documentId, documents.id))
    .leftJoin(originalLine, eq(originalLine.documentId, documents.duplicateOfId))
    .leftJoin(vendors, eq(vendors.id, lineItems.vendorId))
    .leftJoin(categories, eq(categories.id, lineItems.categoryId))
    .where(
      and(
        eq(documents.organizationId, org.id),
        effectiveDateBetween(lineItems.docDate, originalLine.docDate, period),
      ),
    )
    .orderBy(desc(documents.receivedAt))
    .limit(300);

  const usage = await usageFor(org.id, currentPeriod(org));
  const capacity = documentCapacity(org.plan, usage.documentsExtracted);

  const reviewCounts = await openReviewCounts(rawRows.map((r) => r.document.id));

  const rows: InboxRow[] = rawRows.map((r) => {
    const openReviewCount = reviewCounts.get(r.document.id) ?? 0;
    return {
      document: r.document,
      vendorName: r.vendorName ?? null,
      categoryName: r.categoryName ?? null,
      amountCents: r.amountCents ?? null,
      currency: r.currency ?? "USD",
      docDate: r.docDate ?? null,
      confirmed: Boolean(r.confirmedAt),
      openReviewCount,
      status: displayStatus({
        status: r.document.status,
        duplicateOfId: r.document.duplicateOfId,
        extractingSince: r.document.extractingSince,
        openReviewCount,
        hasLineItem: Boolean(r.hasLineItem),
        lineItemConfirmed: Boolean(r.confirmedAt),
        atCap: capacity.atCap,
      }),
      hasDuplicateCandidate: Boolean(r.document.duplicateCandidateOfId),
    };
  });

  const totalCents = rows
    .filter((r) => r.confirmed && r.status === "confirmed")
    .reduce((sum, r) => sum + (r.amountCents ?? 0), 0);

  const counts = {
    needsReview: rows.filter((r) => r.status === "needs_review").length,
    confirmed: rows.filter((r) => r.status === "confirmed").length,
    parked: rows.filter((r) => r.status === "parked").length,
    extracting: rows.filter((r) => r.status === "extracting" || r.status === "queued").length,
  };

  const visible =
    filter === "needs_review"
      ? rows.filter((r) => r.status === "needs_review")
      : filter === "confirmed"
        ? rows.filter((r) => r.status === "confirmed")
        : rows;

  const anyRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(documents)
    .where(eq(documents.organizationId, org.id));

  return {
    period,
    monthLabel: periodLabel(period, currentPeriod(org)),
    totalCents,
    currency: rows.find((r) => r.currency)?.currency ?? "USD",
    documentCount: rows.filter((r) => r.status !== "duplicate").length,
    needsReviewCount: counts.needsReview,
    confirmedCount: counts.confirmed,
    parkedCount: counts.parked,
    extractingCount: counts.extracting,
    rows: visible,
    capacity,
    firstRun: Number(anyRows[0]?.n ?? 0) === 0,
  };
}

/** Periods that have any document at all — the period list on the close screen. */
export async function documentPeriods(organizationId: string): Promise<Period[]> {
  const originalLine = alias(lineItems, "original_line");
  const periodExpr = effectivePeriodExpr(lineItems.docDate, originalLine.docDate);
  const rows = await getDb()
    .select({ period: periodExpr })
    .from(documents)
    .leftJoin(lineItems, eq(lineItems.documentId, documents.id))
    .leftJoin(originalLine, eq(originalLine.documentId, documents.duplicateOfId))
    .where(eq(documents.organizationId, organizationId))
    .groupBy(periodExpr)
    .orderBy(sql`1 desc`);
  return rows.map((r) => r.period);
}
