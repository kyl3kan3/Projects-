/**
 * Trade queries and the trade rebuild. Everything here is server-side.
 *
 * The rebuild is the important function: it re-derives every trade in an account
 * from every execution in it, upserting on `(account_id, match_key)` so that the
 * derived columns are replaced while the authored ones — setup, stop, notes,
 * emotion tags, reviewed — are left exactly as the trader left them.
 */

import { and, asc, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts,
  executions,
  setups,
  tradeExecutions,
  trades,
  type Account,
  type Setup,
  type Trade,
} from "@/db/schema";
import { buildTrades, rMultipleFor, type ExecutionSource, type TradeRecord } from "@/lib/pipeline";
import { displaySymbol } from "@/lib/instruments";
import type { ClosedTrade } from "@/lib/analytics";

/* ------------------------------------------------------------------ reads --- */

export async function listAccounts(userId: string): Promise<Account[]> {
  return getDb()
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .orderBy(asc(accounts.createdAt));
}

export async function getAccount(userId: string, accountId: string): Promise<Account | null> {
  const [row] = await getDb()
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)));
  return row ?? null;
}

export async function listSetups(userId: string): Promise<Setup[]> {
  return getDb()
    .select()
    .from(setups)
    .where(eq(setups.userId, userId))
    .orderBy(asc(setups.name));
}

export interface TradeWithSetup extends Trade {
  setupName: string | null;
  setupColor: string | null;
}

/** Every trade for a user, newest first, with its setup name resolved. */
export async function listTrades(
  userId: string,
  opts: { limit?: number; status?: "open" | "closed"; accountId?: string } = {},
): Promise<TradeWithSetup[]> {
  const db = getDb();
  const filters = [eq(trades.userId, userId)];
  if (opts.status) filters.push(eq(trades.status, opts.status));
  if (opts.accountId) filters.push(eq(trades.accountId, opts.accountId));

  const rows = await db
    .select({ trade: trades, setupName: setups.name, setupColor: setups.color })
    .from(trades)
    .leftJoin(setups, eq(setups.id, trades.setupId))
    .where(and(...filters))
    .orderBy(desc(trades.openedAt))
    .limit(opts.limit ?? 500);

  return rows.map((r) => ({ ...r.trade, setupName: r.setupName, setupColor: r.setupColor }));
}

export async function getTrade(userId: string, tradeId: string): Promise<TradeWithSetup | null> {
  const [row] = await getDb()
    .select({ trade: trades, setupName: setups.name, setupColor: setups.color })
    .from(trades)
    .leftJoin(setups, eq(setups.id, trades.setupId))
    .where(and(eq(trades.id, tradeId), eq(trades.userId, userId)));
  return row ? { ...row.trade, setupName: row.setupName, setupColor: row.setupColor } : null;
}

/** The execution audit trail for one trade, in time order. */
export async function tradeLegs(tradeId: string) {
  return getDb()
    .select({
      leg: tradeExecutions,
      execution: executions,
    })
    .from(tradeExecutions)
    .innerJoin(executions, eq(executions.id, tradeExecutions.executionId))
    .where(eq(tradeExecutions.tradeId, tradeId))
    .orderBy(asc(tradeExecutions.executedAt), asc(tradeExecutions.seq));
}

/**
 * The projection every statistic is computed from: closed trades only, with the
 * setup name resolved so segment labels do not need another query.
 */
export async function closedTradesFor(
  userId: string,
  opts: { since?: Date; until?: Date; accountId?: string } = {},
): Promise<ClosedTrade[]> {
  const filters = [eq(trades.userId, userId), eq(trades.status, "closed"), isNotNull(trades.closedAt)];
  if (opts.since) filters.push(gte(trades.closedAt, opts.since));
  if (opts.until) filters.push(lte(trades.closedAt, opts.until));
  if (opts.accountId) filters.push(eq(trades.accountId, opts.accountId));

  const rows = await getDb()
    .select({ trade: trades, setupName: setups.name })
    .from(trades)
    .leftJoin(setups, eq(setups.id, trades.setupId))
    .where(and(...filters))
    .orderBy(asc(trades.closedAt));

  return rows.map(({ trade, setupName }) => ({
    id: trade.id,
    symbol: trade.symbol,
    displaySymbol: displaySymbol(trade.assetClass, trade.symbol),
    assetClass: trade.assetClass,
    direction: trade.direction,
    openedAt: trade.openedAt,
    closedAt: trade.closedAt!,
    netPnlCents: trade.netPnlCents,
    feesCents: trade.feesCents,
    rMultiple: trade.rMultiple ?? null,
    holdSeconds: trade.holdSeconds ?? 0,
    positionCostCents: trade.positionCostCents,
    setupId: trade.setupId,
    setupName: setupName ?? null,
  }));
}

/** Trades created in the current calendar month — the Free-plan meter. */
export async function tradesThisMonth(userId: string, now = new Date()): Promise<number> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(trades)
    .where(and(eq(trades.userId, userId), gte(trades.createdAt, monthStart)));
  return row?.count ?? 0;
}

/* --------------------------------------------------------------- rebuild --- */

async function executionSourcesFor(accountId: string): Promise<ExecutionSource[]> {
  const rows = await getDb()
    .select()
    .from(executions)
    .where(eq(executions.accountId, accountId))
    // The matcher's tie-break for fills sharing a timestamp is this order, so it
    // must be deterministic: file row order, then insertion order.
    .orderBy(asc(executions.executedAt), asc(executions.sourceRow), asc(executions.createdAt));

  return rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    assetClass: r.assetClass,
    side: r.side,
    qty: r.qty,
    price: r.price,
    fees: r.fees,
    executedAt: r.executedAt,
    multiplierMilli: r.multiplierMilli,
  }));
}

export interface RebuildResult {
  matched: number;
  closed: number;
  open: number;
  newTrades: number;
  removed: number;
  unmatchedExecutions: number;
}

/**
 * Preview the rebuild without writing anything — used by the import to count how
 * many *new* trades a file would create before the plan gate decides.
 */
export async function previewRebuild(
  accountId: string,
  extra: readonly ExecutionSource[] = [],
): Promise<{ records: TradeRecord[]; newKeys: string[]; unmatched: number }> {
  const existing = await executionSourcesFor(accountId);
  const { trades: records, unmatchedExecutionIds } = buildTrades([...existing, ...extra]);
  const knownKeys = new Set(
    (
      await getDb()
        .select({ matchKey: trades.matchKey })
        .from(trades)
        .where(eq(trades.accountId, accountId))
    ).map((r) => r.matchKey),
  );
  return {
    records,
    newKeys: records.map((r) => r.matchKey).filter((k) => !knownKeys.has(k)),
    unmatched: unmatchedExecutionIds.length,
  };
}

/**
 * Re-derive every trade in the account. Idempotent: running it twice over the
 * same executions produces the same rows, including the same trade ids.
 */
export async function rebuildTrades(account: Account): Promise<RebuildResult> {
  const db = getDb();
  const sources = await executionSourcesFor(account.id);
  const { trades: records, unmatchedExecutionIds } = buildTrades(sources);

  const before = await db
    .select({ id: trades.id, matchKey: trades.matchKey })
    .from(trades)
    .where(eq(trades.accountId, account.id));
  const knownKeys = new Set(before.map((r) => r.matchKey));

  const idByKey = new Map<string, string>();

  for (const record of records) {
    // Only derived columns are set on conflict; the authored ones are untouched.
    const [row] = await db
      .insert(trades)
      .values({
        accountId: account.id,
        userId: account.userId,
        matchKey: record.matchKey,
        symbol: record.symbol,
        displaySymbol: displaySymbol(record.assetClass, record.symbol),
        assetClass: record.assetClass,
        direction: record.direction,
        multiplierMilli: record.multiplierMilli,
        openedAt: record.openedAt,
        closedAt: record.closedAt,
        status: record.status,
        holdSeconds: record.holdSeconds,
        qtyOpened: record.qtyOpened,
        qtyMax: record.qtyMax,
        qtyOpen: record.qtyOpen,
        avgEntry: record.avgEntry,
        avgExit: record.avgExit,
        grossPnlCents: record.grossPnlCents,
        feesCents: record.feesCents,
        netPnlCents: record.netPnlCents,
        positionCostCents: record.positionCostCents,
        markPrice: record.markPrice,
        unrealizedPnlCents: record.unrealizedPnlCents,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [trades.accountId, trades.matchKey],
        set: {
          symbol: record.symbol,
          displaySymbol: displaySymbol(record.assetClass, record.symbol),
          assetClass: record.assetClass,
          direction: record.direction,
          multiplierMilli: record.multiplierMilli,
          closedAt: record.closedAt,
          status: record.status,
          holdSeconds: record.holdSeconds,
          qtyOpened: record.qtyOpened,
          qtyMax: record.qtyMax,
          qtyOpen: record.qtyOpen,
          avgEntry: record.avgEntry,
          avgExit: record.avgExit,
          grossPnlCents: record.grossPnlCents,
          feesCents: record.feesCents,
          netPnlCents: record.netPnlCents,
          positionCostCents: record.positionCostCents,
          markPrice: record.markPrice,
          unrealizedPnlCents: record.unrealizedPnlCents,
          updatedAt: new Date(),
        },
      })
      .returning({ id: trades.id, stopPrice: trades.stopPrice });

    idByKey.set(record.matchKey, row.id);

    // The R-multiple depends on both the (authored) stop and the (derived) P&L,
    // so it is recomputed here rather than carried over.
    const r = rMultipleFor(
      {
        avgEntry: record.avgEntry,
        qtyMax: record.qtyMax,
        multiplierMilli: record.multiplierMilli,
        netPnlCents: record.netPnlCents,
      },
      row.stopPrice ?? null,
    );
    await db.update(trades).set({ rMultiple: r }).where(eq(trades.id, row.id));

    await db.delete(tradeExecutions).where(eq(tradeExecutions.tradeId, row.id));
    if (record.legs.length) {
      await db.insert(tradeExecutions).values(
        record.legs.map((leg) => ({
          tradeId: row.id,
          executionId: leg.executionId,
          role: leg.role,
          qty: leg.qty,
          price: leg.price,
          feesCents: leg.feesCents,
          executedAt: leg.executedAt,
          seq: leg.seq,
        })),
      );
    }
  }

  // Trades whose match key no longer exists: an earlier fill arrived and changed
  // where a round trip begins. Their derived rows go; nothing authored elsewhere
  // is touched.
  const liveKeys = new Set(records.map((r) => r.matchKey));
  const stale = before.filter((r) => !liveKeys.has(r.matchKey));
  if (stale.length) {
    await db.delete(trades).where(
      inArray(
        trades.id,
        stale.map((r) => r.id),
      ),
    );
  }

  return {
    matched: records.length,
    closed: records.filter((r) => r.status === "closed").length,
    open: records.filter((r) => r.status === "open").length,
    newTrades: records.filter((r) => !knownKeys.has(r.matchKey)).length,
    removed: stale.length,
    unmatchedExecutions: unmatchedExecutionIds.length,
  };
}
