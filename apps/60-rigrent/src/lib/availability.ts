/**
 * src/lib/availability.ts
 *
 * THE product. `available(item, window) = owned − booked − maintenance`, as one
 * SQL aggregation with a half-open date overlap, computed live on every quote
 * line render and re-checked inside the acceptance transaction. A failed
 * re-check blocks acceptance and names the conflicting order. There is no code
 * path in this app that writes a booking without passing through here.
 *
 * Three implementation notes that are load-bearing:
 *
 *  1. **No `Date` ever enters these queries.** Windows are `YYYY-MM-DD` strings
 *     cast with `::date`. Interpolating a JS `Date` into a raw `sql` fragment
 *     bypasses Drizzle's column encoder and throws inside postgres.js at
 *     runtime, which no build step catches.
 *  2. **Every column inside the raw fragments is table-qualified.** An
 *     unqualified column in a select list binds to the nearest subquery alias
 *     and silently returns zeros for ever — the worst possible failure for a
 *     query whose whole job is to say "no".
 *  3. **The acceptance re-check holds a row lock on the account** before it
 *     counts. Two customers clicking Accept in the same second would otherwise
 *     both read "40 available" and both be told yes.
 */

import { and, eq, gt, inArray, lt, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { items, maintenanceHolds, orderLines, orders } from "@/db/schema";
import {
  BOOKED_STATUSES,
  gauge,
  isValidWindow,
  type AvailabilityFacts,
  type Conflict,
  type Gauge,
} from "@/lib/availability-core";
import type { IsoDate } from "@/lib/dates";

type Db = ReturnType<typeof getDb>;
/** Anything that can run a query: the pool, or a transaction inside it. */
export type Executor = Pick<Db, "execute">;

export class ConflictError extends Error {
  constructor(
    readonly itemName: string,
    readonly conflict: Conflict | null,
    readonly detail: string,
  ) {
    super(detail);
    this.name = "ConflictError";
  }
}

export class WindowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WindowError";
  }
}

const BOOKED_LIST = sql.raw(BOOKED_STATUSES.map((s) => `'${s}'`).join(", "));

interface FactsRow extends Record<string, unknown> {
  item_id: string;
  item_name: string;
  owned_count: number | string;
  booked: number | string;
  held: number | string;
}

/**
 * Availability for every active item in the account over one window.
 *
 * One query, one round trip, whatever the quote's length — the builder re-runs
 * this on every window change and every quantity change, so it cannot be N+1.
 *
 * `excludeOrderId` leaves an order out of its own count. Editing a confirmed
 * order for the same window must not see itself as the competition.
 */
export async function availabilityForWindow(
  accountId: string,
  from: IsoDate,
  to: IsoDate,
  opts: { excludeOrderId?: string | null; executor?: Executor } = {},
): Promise<AvailabilityFacts[]> {
  if (!isValidWindow({ outOn: from, dueBackOn: to })) {
    throw new WindowError("The due-back date has to be after the out date.");
  }
  const executor = opts.executor ?? getDb();
  const exclude: SQL = opts.excludeOrderId
    ? sql`AND o.id <> ${opts.excludeOrderId}::uuid`
    : sql``;

  const rows = (await executor.execute<FactsRow>(sql`
    SELECT
      i.id                   AS item_id,
      i.name                 AS item_name,
      i.owned_count          AS owned_count,
      COALESCE(b.qty, 0)     AS booked,
      COALESCE(h.qty, 0)     AS held
    FROM items i
    LEFT JOIN (
      SELECT ol.item_id AS item_id, SUM(ol.quantity) AS qty
      FROM order_lines ol
      JOIN orders o ON o.id = ol.order_id
      WHERE o.account_id = ${accountId}::uuid
        AND o.status IN (${BOOKED_LIST})
        AND o.out_on      < ${to}::date
        AND o.due_back_on > ${from}::date
        ${exclude}
      GROUP BY ol.item_id
    ) b ON b.item_id = i.id
    LEFT JOIN (
      SELECT mh.item_id AS item_id, SUM(mh.quantity) AS qty
      FROM maintenance_holds mh
      WHERE mh.starts_on < ${to}::date
        AND mh.ends_on   > ${from}::date
      GROUP BY mh.item_id
    ) h ON h.item_id = i.id
    WHERE i.account_id = ${accountId}::uuid
      AND i.status = 'active'
    ORDER BY i.name ASC
  `)) as unknown as FactsRow[];

  return rows.map((row) => ({
    itemId: row.item_id,
    itemName: row.item_name,
    ownedCount: Number(row.owned_count),
    bookedCount: Number(row.booked),
    heldCount: Number(row.held),
  }));
}

export async function availabilityMap(
  accountId: string,
  from: IsoDate,
  to: IsoDate,
  opts: { excludeOrderId?: string | null; executor?: Executor } = {},
): Promise<Map<string, AvailabilityFacts>> {
  const facts = await availabilityForWindow(accountId, from, to, opts);
  return new Map(facts.map((f) => [f.itemId, f]));
}

/** One item's availability. Same query, filtered — used by the item detail screen. */
export async function availableCount(
  accountId: string,
  itemId: string,
  from: IsoDate,
  to: IsoDate,
  opts: { excludeOrderId?: string | null } = {},
): Promise<number> {
  const map = await availabilityMap(accountId, from, to, opts);
  const facts = map.get(itemId);
  return facts ? facts.ownedCount - facts.bookedCount - facts.heldCount : 0;
}

interface ConflictRow extends Record<string, unknown> {
  order_id: string;
  order_number: number | string;
  customer_name: string;
  quantity: number | string;
  out_on: string;
  due_back_on: string;
}

/**
 * The booked orders competing for one item over a window, oldest first. The
 * first one is the order the overbooked block names — oldest wins, because the
 * customer who booked first is the one who was promised.
 */
export async function conflictsForItem(
  accountId: string,
  itemId: string,
  from: IsoDate,
  to: IsoDate,
  opts: { excludeOrderId?: string | null; executor?: Executor; limit?: number } = {},
): Promise<Conflict[]> {
  const executor = opts.executor ?? getDb();
  const exclude: SQL = opts.excludeOrderId
    ? sql`AND o.id <> ${opts.excludeOrderId}::uuid`
    : sql``;
  const limit = opts.limit ?? 5;

  const rows = (await executor.execute<ConflictRow>(sql`
    SELECT
      o.id            AS order_id,
      o.number        AS order_number,
      c.name          AS customer_name,
      SUM(ol.quantity) AS quantity,
      o.out_on        AS out_on,
      o.due_back_on   AS due_back_on
    FROM orders o
    JOIN order_lines ol ON ol.order_id = o.id
    JOIN customers c ON c.id = o.customer_id
    WHERE o.account_id = ${accountId}::uuid
      AND ol.item_id = ${itemId}::uuid
      AND o.status IN (${BOOKED_LIST})
      AND o.out_on      < ${to}::date
      AND o.due_back_on > ${from}::date
      ${exclude}
    GROUP BY o.id, o.number, c.name, o.out_on, o.due_back_on
    ORDER BY o.created_at ASC
    LIMIT ${limit}
  `)) as unknown as ConflictRow[];

  return rows.map((row) => ({
    orderId: row.order_id,
    orderNumber: Number(row.order_number),
    customerName: row.customer_name,
    quantity: Number(row.quantity),
    outOn: row.out_on,
    dueBackOn: row.due_back_on,
  }));
}

export interface LineRequest {
  itemId: string;
  quantity: number;
}

export interface GaugedLine {
  gauge: Gauge;
  conflict: Conflict | null;
}

/**
 * Gauges for a set of requested lines over one window, with the conflicting
 * order resolved for any line that does not fit. One availability query plus one
 * conflict query per overbooked line — and there are usually none.
 */
export async function gaugeLines(
  accountId: string,
  from: IsoDate,
  to: IsoDate,
  requests: readonly LineRequest[],
  opts: { excludeOrderId?: string | null; executor?: Executor } = {},
): Promise<Map<string, GaugedLine>> {
  const facts = await availabilityMap(accountId, from, to, opts);
  const out = new Map<string, GaugedLine>();

  for (const request of requests) {
    const itemFacts = facts.get(request.itemId);
    if (!itemFacts) continue;
    const g = gauge(itemFacts, request.quantity);
    let conflict: Conflict | null = null;
    if (g.overbooked && g.bookedCount > 0) {
      const conflicts = await conflictsForItem(accountId, request.itemId, from, to, {
        excludeOrderId: opts.excludeOrderId,
        executor: opts.executor,
        limit: 1,
      });
      conflict = conflicts[0] ?? null;
    }
    out.set(request.itemId, { gauge: g, conflict });
  }
  return out;
}

interface LineRow extends Record<string, unknown> {
  item_id: string;
  item_name: string;
  quantity: number | string;
  out_on: string;
  due_back_on: string;
}

/**
 * The re-check, run inside the acceptance transaction.
 *
 * `SELECT … FOR UPDATE` on the account row first: it serialises acceptances
 * within one tenant so two simultaneous signatures cannot both read the same
 * spare capacity. It is a coarse lock on purpose — a rental yard accepts a
 * handful of orders a day, and correctness here is worth more than concurrency.
 *
 * Throws `ConflictError` naming the item and the conflicting order. The caller
 * turns that into the sentence the customer sees, and nothing is written.
 */
export async function assertAvailableForOrder(
  executor: Executor,
  accountId: string,
  orderId: string,
): Promise<void> {
  await executor.execute(
    sql`SELECT id FROM accounts WHERE id = ${accountId}::uuid FOR UPDATE`,
  );

  const lines = (await executor.execute<LineRow>(sql`
    SELECT ol.item_id AS item_id, i.name AS item_name, ol.quantity AS quantity,
           o.out_on AS out_on, o.due_back_on AS due_back_on
    FROM order_lines ol
    JOIN orders o ON o.id = ol.order_id
    JOIN items i ON i.id = ol.item_id
    WHERE ol.order_id = ${orderId}::uuid
    ORDER BY i.name ASC
  `)) as unknown as LineRow[];

  if (lines.length === 0) return;
  const from = lines[0].out_on;
  const to = lines[0].due_back_on;

  const facts = await availabilityMap(accountId, from, to, {
    excludeOrderId: orderId,
    executor,
  });

  for (const line of lines) {
    const itemFacts = facts.get(line.item_id) ?? {
      itemId: line.item_id,
      itemName: line.item_name,
      ownedCount: 0,
      bookedCount: 0,
      heldCount: 0,
    };
    const g = gauge(itemFacts, Number(line.quantity));
    if (!g.overbooked) continue;

    const conflicts = await conflictsForItem(accountId, line.item_id, from, to, {
      excludeOrderId: orderId,
      executor,
      limit: 1,
    });
    const conflict = conflicts[0] ?? null;
    throw new ConflictError(
      line.item_name,
      conflict,
      conflict
        ? `${line.item_name} is no longer available for these dates — order #${conflict.orderNumber} took ${conflict.quantity} of ${g.ownedCount} while this quote was out. Short by ${g.overrunCount}.`
        : `${line.item_name} is no longer available for these dates — short by ${g.overrunCount} of ${g.ownedCount}.`,
    );
  }
}

export interface Booking {
  itemId: string;
  outOn: string;
  dueBackOn: string;
  quantity: number;
}

/**
 * Every booking window overlapping a range, for every item in the account —
 * one query, flattened into day strips in JavaScript. The inventory list needs a
 * 30-day strip per row; doing that as a query per item is 40 round trips for a
 * screen nobody waits for.
 *
 * Maintenance holds are folded in as bookings, because on the strip they mean the
 * same thing: that unit is not going out.
 */
export async function bookingsInRange(
  accountId: string,
  from: IsoDate,
  to: IsoDate,
): Promise<Booking[]> {
  const db = getDb();
  const booked = await db
    .select({
      itemId: orderLines.itemId,
      outOn: orders.outOn,
      dueBackOn: orders.dueBackOn,
      quantity: orderLines.quantity,
    })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .where(
      and(
        eq(orders.accountId, accountId),
        inArray(orders.status, [...BOOKED_STATUSES]),
        // Typed operators, never a raw fragment: `date` columns in Drizzle carry
        // string values, and `lt`/`gt` run them through the column's encoder.
        lt(orders.outOn, to),
        gt(orders.dueBackOn, from),
      ),
    );

  const held = await db
    .select({
      itemId: maintenanceHolds.itemId,
      outOn: maintenanceHolds.startsOn,
      dueBackOn: maintenanceHolds.endsOn,
      quantity: maintenanceHolds.quantity,
    })
    .from(maintenanceHolds)
    .innerJoin(items, eq(items.id, maintenanceHolds.itemId))
    .where(
      and(
        eq(items.accountId, accountId),
        lt(maintenanceHolds.startsOn, to),
        gt(maintenanceHolds.endsOn, from),
      ),
    );

  return [...booked, ...held];
}
