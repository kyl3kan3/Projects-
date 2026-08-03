/**
 * The monthly close package — the artifact the whole product exists to produce.
 *
 * Three rules shape this file.
 *
 * **The gate.** A close refuses to happen while any document in the period still has
 * an unresolved field. The operator gets "3 items need review before March closes"
 * with a deep link instead of a package. This is deliberate and not a convenience: a
 * package with a guess in it is worse than no package, because the accountant cannot
 * tell which number was guessed. `force: true` is available, and it stamps the
 * unreviewed entries into the summary by name — honesty over tidiness.
 *
 * **Confirmed only.** Every figure comes from `line_items` with `confirmed_at` set.
 * A draft line item is invisible to this file. That is the export gate.
 *
 * **Idempotent.** Re-closing a period rebuilds the package, bumps `version`, and
 * replaces the stored keys. Nothing is appended, nothing is orphaned in the operator's
 * view of the period.
 */

import { and, asc, desc, eq, gte, isNotNull, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  categories,
  closePeriods,
  documents,
  lineItems,
  organizations,
  reviewItems,
  vendors,
  type ClosePeriod,
  type Organization,
  type PeriodSummary,
} from "@/db/schema";
import { audit, SYSTEM } from "@/lib/audit";
import {
  monthName,
  periodEnd,
  periodStart,
  previousPeriod,
  type Period,
} from "@/lib/dates";
import { formatCents } from "@/lib/money";
import {
  EXPORT_FILENAMES,
  renderExport,
  sourcePathFor,
  type ExportRow,
} from "@/lib/exports";
import { createZip, type ZipEntry } from "@/lib/zip";
import {
  closePdfKey,
  closeZipKey,
  extensionFor,
  getObject,
  putObject,
} from "@/lib/storage";
import { renderCoverPdf } from "@/lib/close-pdf";

/* ------------------------------------------------------------------- rows --- */

/**
 * The confirmed entries for a period, in the order an accountant reads them.
 *
 * `confirmed_at is not null` is the gate. It is expressed once, here, and every
 * export and every total in the package comes through this function.
 */
export async function confirmedRows(
  organizationId: string,
  period: Period,
): Promise<ExportRow[]> {
  const rows = await getDb()
    .select({
      docDate: lineItems.docDate,
      amountCents: lineItems.amountCents,
      taxCents: lineItems.taxCents,
      currency: lineItems.currency,
      memo: lineItems.memo,
      vendor: vendors.displayName,
      category: categories.name,
      scheduleCLine: categories.scheduleCLine,
      filename: documents.originalFilename,
      mimeType: documents.mimeType,
      contentHash: documents.contentHash,
    })
    .from(lineItems)
    .innerJoin(documents, eq(documents.id, lineItems.documentId))
    .leftJoin(vendors, eq(vendors.id, lineItems.vendorId))
    .leftJoin(categories, eq(categories.id, lineItems.categoryId))
    .where(
      and(
        eq(lineItems.organizationId, organizationId),
        isNotNull(lineItems.confirmedAt),
        gte(lineItems.docDate, periodStart(period)),
        lte(lineItems.docDate, periodEnd(period)),
        ne(documents.status, "duplicate"),
      ),
    )
    .orderBy(asc(lineItems.docDate), asc(vendors.displayName));

  return rows.map((r) => {
    const vendor = r.vendor ?? "Unknown vendor";
    return {
      docDate: r.docDate,
      vendor,
      category: r.category ?? "Other expenses",
      scheduleCLine: r.scheduleCLine ?? "27a",
      memo: r.memo,
      amountCents: r.amountCents,
      taxCents: r.taxCents,
      currency: r.currency,
      sourceFilename: r.filename,
      sourcePath: sourcePathFor(r.docDate, vendor, r.contentHash, extensionFor(r.mimeType)),
    };
  });
}

/* ---------------------------------------------------------------- the gate --- */

export interface CloseGate {
  clean: boolean;
  /** Documents in the period with at least one unresolved field. */
  blockingDocuments: number;
  blockingIds: string[];
}

/**
 * What still blocks this period.
 *
 * "In the period" means the document's *reading* falls in the period, or — for a
 * document with no readable date at all — it was received in the period. A receipt
 * photographed on the 2nd of April for a March purchase belongs to March, and an
 * unreadable scan received in March cannot be allowed to block April forever.
 */
export async function closeGate(organizationId: string, period: Period): Promise<CloseGate> {
  const rows = await getDb()
    .selectDistinct({ id: documents.id })
    .from(reviewItems)
    .innerJoin(documents, eq(documents.id, reviewItems.documentId))
    .leftJoin(lineItems, eq(lineItems.documentId, documents.id))
    .where(
      and(
        eq(reviewItems.organizationId, organizationId),
        isNull(reviewItems.resolvedAt),
        ne(documents.status, "duplicate"),
        sql`coalesce(${lineItems.docDate}::text, to_char(${documents.receivedAt}, 'YYYY-MM-DD')) between ${periodStart(period)} and ${periodEnd(period)}`,
      ),
    );
  return { clean: rows.length === 0, blockingDocuments: rows.length, blockingIds: rows.map((r) => r.id) };
}

/* ---------------------------------------------------------------- summary --- */

async function periodTotal(organizationId: string, period: Period): Promise<number | null> {
  const rows = await getDb()
    .select({ total: sql<number>`coalesce(sum(${lineItems.amountCents}), 0)::int`, n: sql<number>`count(*)::int` })
    .from(lineItems)
    .innerJoin(documents, eq(documents.id, lineItems.documentId))
    .where(
      and(
        eq(lineItems.organizationId, organizationId),
        isNotNull(lineItems.confirmedAt),
        gte(lineItems.docDate, periodStart(period)),
        lte(lineItems.docDate, periodEnd(period)),
        ne(documents.status, "duplicate"),
      ),
    );
  const row = rows[0];
  if (!row || Number(row.n) === 0) return null;
  return Number(row.total);
}

/**
 * Vendors that show up every month and did not show up this one.
 *
 * A landscaper who buys fuel weekly and has no fuel receipt for March did not stop
 * buying fuel — they lost a receipt. This is the most useful line in the package,
 * because it is the deduction the shoebox eats. The window is the two prior periods,
 * and a vendor must appear in *both* to count as recurring: one appearance is a
 * purchase, two is a habit.
 */
export async function missingReceiptGaps(
  organizationId: string,
  period: Period,
): Promise<PeriodSummary["missingReceipts"]> {
  const prev1 = previousPeriod(period);
  const prev2 = previousPeriod(prev1);
  const db = getDb();

  const priorRows = await db
    .select({
      vendor: vendors.displayName,
      vendorId: lineItems.vendorId,
      period: sql<string>`substring(${lineItems.docDate}::text, 1, 7)`,
      total: sql<number>`sum(${lineItems.amountCents})::int`,
      n: sql<number>`count(*)::int`,
    })
    .from(lineItems)
    .innerJoin(vendors, eq(vendors.id, lineItems.vendorId))
    .where(
      and(
        eq(lineItems.organizationId, organizationId),
        isNotNull(lineItems.confirmedAt),
        gte(lineItems.docDate, periodStart(prev2)),
        lte(lineItems.docDate, periodEnd(prev1)),
      ),
    )
    .groupBy(vendors.displayName, lineItems.vendorId, sql`substring(${lineItems.docDate}::text, 1, 7)`);

  const thisPeriod = await db
    .selectDistinct({ vendorId: lineItems.vendorId })
    .from(lineItems)
    .where(
      and(
        eq(lineItems.organizationId, organizationId),
        gte(lineItems.docDate, periodStart(period)),
        lte(lineItems.docDate, periodEnd(period)),
      ),
    );
  const seenNow = new Set(thisPeriod.map((r) => r.vendorId));

  const byVendor = new Map<
    string,
    { vendor: string; periods: Set<string>; total: number; count: number }
  >();
  for (const row of priorRows) {
    if (!row.vendorId) continue;
    const entry =
      byVendor.get(row.vendorId) ??
      { vendor: row.vendor, periods: new Set<string>(), total: 0, count: 0 };
    entry.periods.add(row.period);
    entry.total += Number(row.total);
    entry.count += Number(row.n);
    byVendor.set(row.vendorId, entry);
  }

  const gaps: PeriodSummary["missingReceipts"] = [];
  for (const [vendorId, entry] of byVendor) {
    if (seenNow.has(vendorId)) continue;
    if (!entry.periods.has(prev1) || !entry.periods.has(prev2)) continue;
    gaps.push({
      vendor: entry.vendor,
      seenInPeriods: [...entry.periods].sort(),
      typicalAmountCents: Math.round(entry.total / Math.max(1, entry.count)),
    });
  }
  return gaps.sort((a, b) => b.typicalAmountCents - a.typicalAmountCents).slice(0, 8);
}

export async function buildPeriodSummary(
  organizationId: string,
  period: Period,
  opts: { version?: number } = {},
): Promise<PeriodSummary> {
  const db = getDb();
  const rows = await confirmedRows(organizationId, period);

  const byCategory = new Map<string, PeriodSummary["totalsByCategory"][number]>();
  let totalCents = 0;
  let taxCents = 0;
  for (const row of rows) {
    totalCents += row.amountCents;
    taxCents += row.taxCents ?? 0;
    const key = `${row.category}|${row.scheduleCLine}`;
    const entry =
      byCategory.get(key) ??
      {
        slug: key,
        name: row.category,
        scheduleCLine: row.scheduleCLine,
        amountCents: 0,
        documentCount: 0,
      };
    entry.amountCents += row.amountCents;
    entry.documentCount += 1;
    byCategory.set(key, entry);
  }

  // Unreviewed and rejected documents that belong to this period.
  const status = await db
    .select({
      status: documents.status,
      id: documents.id,
      vendor: vendors.displayName,
      amountCents: lineItems.amountCents,
      openReviews: sql<number>`(
        select count(*) from review_items ri
        where ri.document_id = ${documents.id} and ri.resolved_at is null
      )::int`,
    })
    .from(documents)
    .leftJoin(lineItems, eq(lineItems.documentId, documents.id))
    .leftJoin(vendors, eq(vendors.id, lineItems.vendorId))
    .where(
      and(
        eq(documents.organizationId, organizationId),
        sql`coalesce(${lineItems.docDate}::text, to_char(${documents.receivedAt}, 'YYYY-MM-DD')) between ${periodStart(period)} and ${periodEnd(period)}`,
      ),
    );

  const flagged: PeriodSummary["flagged"] = [];
  let duplicateCount = 0;
  let rejectedCount = 0;
  for (const row of status) {
    if (row.status === "duplicate") {
      duplicateCount += 1;
      continue;
    }
    if (row.status === "rejected") {
      rejectedCount += 1;
      flagged.push({
        documentId: row.id,
        vendor: row.vendor ?? "Unreadable document",
        amountCents: row.amountCents ?? 0,
        reason: "rejected — not included in these totals",
      });
      continue;
    }
    if (Number(row.openReviews) > 0) {
      flagged.push({
        documentId: row.id,
        vendor: row.vendor ?? "Unread document",
        amountCents: row.amountCents ?? 0,
        reason: "unreviewed — not included in these totals",
      });
    }
  }

  return {
    period,
    version: opts.version ?? 1,
    generatedAt: new Date().toISOString(),
    documentCount: status.filter((r) => r.status !== "duplicate").length,
    confirmedCount: rows.length,
    unreviewedCount: flagged.filter((f) => f.reason.startsWith("unreviewed")).length,
    duplicateCount,
    rejectedCount,
    totalCents,
    taxCents,
    previousTotalCents: await periodTotal(organizationId, previousPeriod(period)),
    totalsByCategory: [...byCategory.values()].sort((a, b) => b.amountCents - a.amountCents),
    flagged,
    missingReceipts: await missingReceiptGaps(organizationId, period),
    currency: rows[0]?.currency ?? "USD",
  };
}

/* -------------------------------------------------------------- assembling --- */

export interface CloseResult {
  status: "closed" | "blocked" | "empty";
  period: Period;
  summary?: PeriodSummary;
  blockingDocuments?: number;
  pdfKey?: string;
  zipKey?: string;
  version?: number;
}

/** Build the ZIP: cover PDF, three CSVs, and every source original. */
export async function assembleZip(
  org: Organization,
  period: Period,
  summary: PeriodSummary,
  rows: ExportRow[],
  pdfBytes: Uint8Array,
): Promise<Uint8Array> {
  const entries: ZipEntry[] = [
    { path: `ledgerlens-${period}-summary.pdf`, data: pdfBytes },
    { path: EXPORT_FILENAMES.generic(period), data: encode(renderExport("generic", rows)) },
    { path: EXPORT_FILENAMES.qbo(period), data: encode(renderExport("qbo", rows)) },
    { path: EXPORT_FILENAMES.xero(period), data: encode(renderExport("xero", rows)) },
    { path: "README.txt", data: encode(readmeFor(org, period, summary)) },
  ];

  const db = getDb();
  const sources = await db
    .select({
      storageKey: documents.storageKey,
      contentHash: documents.contentHash,
      mimeType: documents.mimeType,
      docDate: lineItems.docDate,
      vendor: vendors.displayName,
    })
    .from(lineItems)
    .innerJoin(documents, eq(documents.id, lineItems.documentId))
    .leftJoin(vendors, eq(vendors.id, lineItems.vendorId))
    .where(
      and(
        eq(lineItems.organizationId, org.id),
        isNotNull(lineItems.confirmedAt),
        gte(lineItems.docDate, periodStart(period)),
        lte(lineItems.docDate, periodEnd(period)),
        ne(documents.status, "duplicate"),
      ),
    );

  for (const source of sources) {
    try {
      const bytes = await getObject(source.storageKey);
      entries.push({
        path: sourcePathFor(
          source.docDate,
          source.vendor ?? "vendor",
          source.contentHash,
          extensionFor(source.mimeType),
        ),
        data: bytes,
      });
    } catch {
      // A missing original must not sink the whole package; it is reported instead.
      entries.push({
        path: `sources/MISSING-${source.contentHash.slice(0, 8)}.txt`,
        data: encode(
          `The original for this entry could not be read from storage at ${new Date().toISOString()}.\n`,
        ),
      });
    }
  }

  return createZip(entries);
}

function encode(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, "utf8"));
}

function readmeFor(org: Organization, period: Period, summary: PeriodSummary): string {
  return [
    `${org.name} — ${monthName(period)} ${period.slice(0, 4)} close package`,
    `Prepared with LedgerLens on ${new Date().toISOString().slice(0, 10)}.`,
    "",
    `Confirmed entries: ${summary.confirmedCount}`,
    `Total: ${formatCents(summary.totalCents, summary.currency)}`,
    `Tax included in the total: ${formatCents(summary.taxCents, summary.currency)}`,
    summary.unreviewedCount > 0
      ? `Unreviewed and therefore EXCLUDED from the totals: ${summary.unreviewedCount} (listed in the PDF)`
      : "Every document in this period was reviewed and confirmed.",
    "",
    "Files:",
    `  ledgerlens-${period}-summary.pdf   Category totals, flagged items, missing-receipt gaps`,
    `  ${EXPORT_FILENAMES.generic(period)}   Every field, one row per entry`,
    `  ${EXPORT_FILENAMES.qbo(period)}   QuickBooks Online import (Date, Description, Amount, Category)`,
    `  ${EXPORT_FILENAMES.xero(period)}   Xero precoded statement import`,
    "  sources/                          The original photo or PDF behind every row",
    "",
    "Categories follow IRS Schedule C line numbers. LedgerLens prepares; a professional files.",
    "",
  ].join("\n");
}

/**
 * Close a period. Idempotent — a second call rebuilds and replaces.
 *
 * @param force close with unresolved items, naming them in the summary.
 */
export async function runClose(
  organizationId: string,
  period: Period,
  opts: { force?: boolean; actor?: string } = {},
): Promise<CloseResult> {
  const db = getDb();
  const actor = opts.actor ?? SYSTEM;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  if (!org) return { status: "empty", period };

  const gate = await closeGate(organizationId, period);
  if (!gate.clean && !opts.force) {
    await upsertPeriod(organizationId, period, { status: "open" });
    await audit(organizationId, actor, "close.blocked", period, {
      period,
      blocking: gate.blockingDocuments,
    });
    return { status: "blocked", period, blockingDocuments: gate.blockingDocuments };
  }

  const existing = await getPeriod(organizationId, period);
  const version = (existing?.version ?? 0) + 1;
  const rows = await confirmedRows(organizationId, period);
  const summary = await buildPeriodSummary(organizationId, period, { version });

  if (rows.length === 0 && summary.documentCount === 0) {
    await upsertPeriod(organizationId, period, { status: "open" });
    return { status: "empty", period, summary };
  }

  await upsertPeriod(organizationId, period, { status: "closing" });

  const pdfBytes = await renderCoverPdf(org, summary);
  const pdfKey = closePdfKey(organizationId, period, version);
  await putObject(pdfKey, pdfBytes, "application/pdf");

  const zipBytes = await assembleZip(org, period, summary, rows, pdfBytes);
  const zipKey = closeZipKey(organizationId, period, version);
  await putObject(zipKey, zipBytes, "application/zip");

  await upsertPeriod(organizationId, period, {
    status: "closed",
    summary,
    pdfStorageKey: pdfKey,
    packageStorageKey: zipKey,
    forced: Boolean(opts.force) && !gate.clean,
    version,
    closedAt: sql`now()`,
  });

  await audit(organizationId, actor, "close.created", period, {
    period,
    version,
    confirmed: summary.confirmedCount,
    totalCents: summary.totalCents,
    forced: Boolean(opts.force) && !gate.clean,
  });

  return { status: "closed", period, summary, pdfKey, zipKey, version };
}

type PeriodPatch = Partial<{
  status: ClosePeriod["status"];
  summary: PeriodSummary;
  pdfStorageKey: string;
  packageStorageKey: string;
  forced: boolean;
  version: number;
  closedAt: ReturnType<typeof sql>;
}>;

async function upsertPeriod(
  organizationId: string,
  period: Period,
  patch: PeriodPatch,
): Promise<void> {
  const db = getDb();
  await db
    .insert(closePeriods)
    .values({ organizationId, period, ...patch } as never)
    .onConflictDoUpdate({
      target: [closePeriods.organizationId, closePeriods.period],
      set: { ...patch, updatedAt: sql`now()` } as never,
    });
}

export async function getPeriod(
  organizationId: string,
  period: Period,
): Promise<ClosePeriod | null> {
  const [row] = await getDb()
    .select()
    .from(closePeriods)
    .where(and(eq(closePeriods.organizationId, organizationId), eq(closePeriods.period, period)));
  return row ?? null;
}

export async function listPeriods(organizationId: string, limit = 24): Promise<ClosePeriod[]> {
  return getDb()
    .select()
    .from(closePeriods)
    .where(eq(closePeriods.organizationId, organizationId))
    .orderBy(desc(closePeriods.period))
    .limit(limit);
}

/** Periods with confirmed activity that have no `close_periods` row yet. */
export async function periodsWithActivity(
  organizationId: string,
  limit = 24,
): Promise<Period[]> {
  const rows = await getDb()
    .select({ period: sql<string>`substring(${lineItems.docDate}::text, 1, 7)` })
    .from(lineItems)
    .where(eq(lineItems.organizationId, organizationId))
    .groupBy(sql`substring(${lineItems.docDate}::text, 1, 7)`)
    .orderBy(sql`substring(${lineItems.docDate}::text, 1, 7) desc`)
    .limit(limit);
  return rows.map((r) => r.period);
}

/** Close periods whose prior month is still open — used by the sweep. */
export async function orgsNeedingClose(period: Period): Promise<string[]> {
  const db = getDb();
  const closed = await db
    .select({ organizationId: closePeriods.organizationId })
    .from(closePeriods)
    .where(and(eq(closePeriods.period, period), eq(closePeriods.status, "closed")));
  const closedSet = new Set(closed.map((r) => r.organizationId));

  const active = await db
    .selectDistinct({ organizationId: lineItems.organizationId })
    .from(lineItems)
    .where(
      and(
        gte(lineItems.docDate, periodStart(period)),
        lt(lineItems.docDate, periodStart(nextOf(period))),
      ),
    );
  return active.map((r) => r.organizationId).filter((id) => !closedSet.has(id));
}

function nextOf(period: Period): Period {
  const [y, m] = period.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
