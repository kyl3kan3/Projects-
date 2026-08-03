/**
 * Cost ingestion — the two-speed model.
 *
 * **Fast path (Cost Explorer).** Polled hourly. AWS only serves HOURLY
 * granularity for the last 14 days, so the 3-month backfill is split: DAILY for
 * everything older, HOURLY for the recent window the baseline engine needs. Every
 * request costs $0.01, so the poller asks for the widest window it can and only
 * re-reads the trailing few hours (AWS backfills them for up to a day).
 *
 * **Accuracy path (CUR).** When the customer points us at their report bucket,
 * CUR takes ownership of every hour it covers: the Cost Explorer rows in that
 * window are deleted and `cur_covered_through` moves forward, after which the
 * poller refuses to write anything before it. Skipping that step is how a bill
 * gets counted twice.
 *
 * Writes are upserts on the fact grain, so re-running any of this is safe.
 */

import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { awsAccounts, costFacts, tagSets, type AwsAccount } from "@/db/schema";
import { addDays, addHours, floorHour } from "@/lib/dates";
import { providerFor, type CostLine } from "@/lib/aws/provider";
import { parseCur } from "@/lib/aws/cur";

/** Cost Explorer's hard limit on hourly data. */
export const HOURLY_WINDOW_DAYS = 14;
export const BACKFILL_DAYS = 90;
/** How far back the poller re-reads, because AWS revises recent hours. */
const REPOLL_HOURS = 6;

/** Canonical hash for a tag combination; `-` means untagged. */
export function tagHashOf(tags: Record<string, string> | undefined): string {
  if (!tags) return "-";
  const pairs = Object.entries(tags)
    .filter(([k, v]) => k && v)
    .map(([k, v]) => `${k}=${v}`)
    .sort();
  return pairs.length ? pairs.join("|") : "-";
}

/** Register any tag combinations we have not seen for this org. */
async function ensureTagSets(orgId: string, lines: CostLine[]): Promise<void> {
  const db = getDb();
  const seen = new Map<string, Record<string, string>>();
  for (const line of lines) {
    const hash = tagHashOf(line.tags);
    if (hash === "-" || seen.has(hash)) continue;
    seen.set(hash, line.tags ?? {});
  }
  if (seen.size === 0) return;
  await db
    .insert(tagSets)
    .values([...seen.entries()].map(([hash, tags]) => ({ orgId, hash, tags })))
    .onConflictDoNothing();
}

/**
 * Write cost lines at the fact grain. Chunked because postgres.js binds every
 * value as a parameter and Postgres caps a statement at 65 535 of them.
 */
export async function writeFacts(
  account: AwsAccount,
  lines: CostLine[],
  source: "ce" | "cur",
): Promise<number> {
  if (lines.length === 0) return 0;
  const db = getDb();
  await ensureTagSets(account.orgId, lines);

  const rows = lines.map((line) => ({
    orgId: account.orgId,
    accountId: account.id,
    ts: line.ts,
    service: line.service,
    region: line.region,
    usageType: line.usageType,
    tagHash: tagHashOf(line.tags),
    resourceId: line.resourceId ?? "",
    amountMicros: line.amountMicros,
    source,
  }));

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db
      .insert(costFacts)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: [
          costFacts.accountId,
          costFacts.ts,
          costFacts.service,
          costFacts.region,
          costFacts.usageType,
          costFacts.tagHash,
          costFacts.resourceId,
          costFacts.source,
        ],
        set: { amountMicros: sql`excluded.amount_micros` },
      });
  }
  return rows.length;
}

/** Drop lines CUR already owns, so the two sources never double-count. */
function dropCurOwnedHours(account: AwsAccount, lines: CostLine[]): CostLine[] {
  const boundary = account.curCoveredThrough;
  if (!boundary) return lines;
  return lines.filter((line) => line.ts >= boundary);
}

export interface IngestResult {
  facts: number;
  from: Date;
  to: Date;
  granularity: Array<"hour" | "day">;
}

/**
 * The 3-month backfill that runs once, when an account is first verified.
 * `asOf` is injectable so this is reproducible.
 */
export async function backfillAccount(
  account: AwsAccount,
  asOf: Date = new Date(),
): Promise<IngestResult> {
  const provider = await providerFor(account);
  const end = floorHour(asOf);
  const hourlyStart = addDays(end, -HOURLY_WINDOW_DAYS);
  const dailyStart = addDays(end, -BACKFILL_DAYS);

  let facts = 0;
  const granularity: Array<"hour" | "day"> = [];

  // Older than 14 days: DAILY is the only grain Cost Explorer will serve.
  const daily = await provider.fetchCosts(account, {
    start: dailyStart,
    end: hourlyStart,
    granularity: "day",
  });
  facts += await writeFacts(account, dropCurOwnedHours(account, daily), "ce");
  granularity.push("day");

  const hourly = await provider.fetchCosts(account, {
    start: hourlyStart,
    end: end,
    granularity: "hour",
  });
  facts += await writeFacts(account, dropCurOwnedHours(account, hourly), "ce");
  granularity.push("hour");

  const db = getDb();
  await db
    .update(awsAccounts)
    .set({ backfilledAt: asOf, lastIngestAt: asOf, ingestedThrough: end })
    .where(eq(awsAccounts.id, account.id));

  return { facts, from: dailyStart, to: end, granularity };
}

/**
 * The hourly poll. Re-reads the trailing `REPOLL_HOURS` because AWS revises
 * recent hours, and never asks for the still-accruing current hour — a partial
 * hour looks like a dip to the detector and would resolve a live anomaly.
 */
export async function ingestRecent(
  account: AwsAccount,
  asOf: Date = new Date(),
): Promise<IngestResult> {
  const provider = await providerFor(account);
  const end = floorHour(asOf);
  const earliest = addDays(end, -HOURLY_WINDOW_DAYS);
  const resume = account.ingestedThrough
    ? addHours(account.ingestedThrough, -REPOLL_HOURS)
    : earliest;
  const start = resume < earliest ? earliest : resume;

  if (start >= end) return { facts: 0, from: start, to: end, granularity: [] };

  const lines = await provider.fetchCosts(account, { start, end, granularity: "hour" });
  const facts = await writeFacts(account, dropCurOwnedHours(account, lines), "ce");

  const db = getDb();
  await db
    .update(awsAccounts)
    .set({ lastIngestAt: asOf, ingestedThrough: end })
    .where(eq(awsAccounts.id, account.id));

  return { facts, from: start, to: end, granularity: ["hour"] };
}

export interface CurImportResult {
  objects: number;
  facts: number;
  rowsRead: number;
  skipped: number;
  errors: string[];
  coveredThrough: Date | null;
}

/**
 * Import CUR objects. Each object's covered window is cleared of Cost Explorer
 * rows before its own lines are written, and `cur_covered_through` only ever
 * moves forward.
 */
export async function importCur(
  account: AwsAccount,
  asOf: Date = new Date(),
): Promise<CurImportResult> {
  const result: CurImportResult = {
    objects: 0,
    facts: 0,
    rowsRead: 0,
    skipped: 0,
    errors: [],
    coveredThrough: account.curCoveredThrough ?? null,
  };
  if (!account.curBucket) return result;

  const provider = await providerFor(account);
  const db = getDb();
  const objects = await provider.listCurObjects(account);

  // Newest first, and only a handful per run: a month of CUR is a lot of CSV and
  // this runs inside a bounded tick.
  for (const object of objects.slice(0, 3)) {
    try {
      const csv = await provider.fetchCurObject(account, object.key);
      const parsed = parseCur(csv);
      result.objects += 1;
      result.rowsRead += parsed.rowsRead;
      result.skipped += parsed.skipped.length;
      if (!parsed.coverage || parsed.lines.length === 0) continue;

      // Cost Explorer no longer owns these hours.
      await db
        .delete(costFacts)
        .where(
          and(
            eq(costFacts.accountId, account.id),
            eq(costFacts.source, "ce"),
            gte(costFacts.ts, parsed.coverage.start),
            lt(costFacts.ts, parsed.coverage.end),
          ),
        );
      result.facts += await writeFacts(account, parsed.lines, "cur");
      if (!result.coveredThrough || parsed.coverage.end > result.coveredThrough) {
        result.coveredThrough = parsed.coverage.end;
      }
    } catch (err) {
      // A malformed object must not silently zero the month; it is reported and
      // the Cost Explorer figures stay in place.
      result.errors.push(`${object.key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await db
    .update(awsAccounts)
    .set({ curLastImportedAt: asOf, curCoveredThrough: result.coveredThrough })
    .where(eq(awsAccounts.id, account.id));

  return result;
}
