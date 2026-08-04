/**
 * src/lib/orders.ts
 *
 * The order's whole life: draft quote → sent → accepted (signed) → confirmed →
 * out → returned → closed. One row, one number, one thread.
 *
 * Everything that changes a window or a quantity re-prices and re-totals through
 * `recalcOrder`, so a stored total can never drift from its lines. The one place
 * that must not be trusted to be current is availability — every write that
 * commits inventory re-asks the database, and acceptance re-asks it inside the
 * transaction that does the committing.
 */

import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts,
  checks,
  customers,
  items,
  orderLines,
  orders,
  type Account,
  type Customer,
  type Item,
  type Order,
  type OrderLine,
} from "@/db/schema";
import { assertAvailableForOrder, ConflictError, WindowError } from "@/lib/availability";
import { isValidWindow } from "@/lib/availability-core";
import { audit } from "@/lib/audit";
import { isoDateOf, type IsoDate } from "@/lib/dates";
import { itemSummary } from "@/lib/order-core";
import { quoteTotals, rateForWindow } from "@/lib/pricing";
import { parseSettings } from "@/lib/settings";

export interface LineWithItem extends OrderLine {
  itemName: string;
  itemCategory: string | null;
  dailyRateCents: number;
  weekendRateCents: number | null;
  replacementCents: number | null;
  damageFees: unknown;
  ownedCount: number;
}

export interface FullOrder {
  order: Order;
  customer: Customer;
  lines: LineWithItem[];
}

export async function getOrder(accountId: string, orderId: string): Promise<FullOrder | null> {
  const db = getDb();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.accountId, accountId), eq(orders.id, orderId)));
  if (!order) return null;
  const [customer] = await db.select().from(customers).where(eq(customers.id, order.customerId));
  return { order, customer, lines: await getLines(orderId) };
}

export async function getLines(orderId: string): Promise<LineWithItem[]> {
  const db = getDb();
  const rows = await db
    .select({
      line: orderLines,
      itemName: items.name,
      itemCategory: items.category,
      dailyRateCents: items.dailyRateCents,
      weekendRateCents: items.weekendRateCents,
      replacementCents: items.replacementCents,
      damageFees: items.damageFees,
      ownedCount: items.ownedCount,
    })
    .from(orderLines)
    .innerJoin(items, eq(items.id, orderLines.itemId))
    .where(eq(orderLines.orderId, orderId))
    .orderBy(asc(items.name));
  return rows.map((r) => ({
    ...r.line,
    itemName: r.itemName,
    itemCategory: r.itemCategory,
    dailyRateCents: r.dailyRateCents,
    weekendRateCents: r.weekendRateCents,
    replacementCents: r.replacementCents,
    damageFees: r.damageFees,
    ownedCount: r.ownedCount,
  }));
}

/* --------------------------------------------------------------- creation --- */

/**
 * Create a draft quote and hand it the next order number.
 *
 * The number comes out of a transaction that locks the account row, because two
 * staff drafting quotes at the same moment reading `next_order_number` would both
 * get 1042 and the second insert would fail on the unique index. Locking is
 * cheaper than explaining that to a shop.
 */
export async function createOrder(input: {
  accountId: string;
  customerId: string;
  outOn: IsoDate;
  dueBackOn: IsoDate;
  delivery: boolean;
  address: string | null;
  notes: string | null;
  actor: string;
}): Promise<Order> {
  if (!isValidWindow({ outOn: input.outOn, dueBackOn: input.dueBackOn })) {
    throw new WindowError(
      "The due-back date has to be after the out date — a one-day rental goes out Saturday and comes back Sunday.",
    );
  }
  const db = getDb();
  const created = await db.transaction(async (tx) => {
    const rows = (await tx.execute<{ next_order_number: number }>(sql`
      UPDATE accounts
      SET next_order_number = next_order_number + 1
      WHERE id = ${input.accountId}::uuid
      RETURNING next_order_number - 1 AS next_order_number
    `)) as unknown as Array<{ next_order_number: number }>;
    const number = Number(rows[0]?.next_order_number ?? 1001);

    const [order] = await tx
      .insert(orders)
      .values({
        accountId: input.accountId,
        customerId: input.customerId,
        number,
        status: "draft",
        outOn: input.outOn,
        dueBackOn: input.dueBackOn,
        delivery: input.delivery,
        address: input.address,
        notes: input.notes,
      })
      .returning();
    return order;
  });

  await audit(input.accountId, input.actor, "order.created", created.id, { number: created.number });
  return created;
}

/* ------------------------------------------------------------ line edits --- */

export async function addLine(input: {
  accountId: string;
  orderId: string;
  itemId: string;
  quantity: number;
}): Promise<void> {
  const db = getDb();
  const full = await getOrder(input.accountId, input.orderId);
  if (!full) throw new Error("That order is not in this account.");
  const [item] = await db
    .select()
    .from(items)
    .where(and(eq(items.accountId, input.accountId), eq(items.id, input.itemId)));
  if (!item) throw new Error("That item is not in this catalogue.");
  if (input.quantity <= 0) throw new Error("Quantity has to be at least 1.");

  const existing = full.lines.find((l) => l.itemId === input.itemId);
  const { rateCents } = rateForWindow(item, full.order.outOn, full.order.dueBackOn);

  if (existing) {
    const quantity = existing.quantity + input.quantity;
    await db
      .update(orderLines)
      .set({ quantity, rateCents, lineTotalCents: rateCents * quantity, updatedAt: new Date() })
      .where(eq(orderLines.id, existing.id));
  } else {
    await db.insert(orderLines).values({
      orderId: input.orderId,
      itemId: input.itemId,
      quantity: input.quantity,
      rateCents,
      lineTotalCents: rateCents * input.quantity,
    });
  }
  await recalcOrder(input.accountId, input.orderId);
}

export async function setLineQuantity(input: {
  accountId: string;
  orderId: string;
  lineId: string;
  quantity: number;
}): Promise<void> {
  const db = getDb();
  const full = await getOrder(input.accountId, input.orderId);
  if (!full) throw new Error("That order is not in this account.");
  const line = full.lines.find((l) => l.id === input.lineId);
  if (!line) throw new Error("That line is not on this order.");

  if (input.quantity <= 0) {
    await db.delete(orderLines).where(eq(orderLines.id, line.id));
  } else {
    await db
      .update(orderLines)
      .set({
        quantity: input.quantity,
        lineTotalCents: line.rateCents * input.quantity,
        updatedAt: new Date(),
      })
      .where(eq(orderLines.id, line.id));
  }
  await recalcOrder(input.accountId, input.orderId);
}

export async function removeLine(input: {
  accountId: string;
  orderId: string;
  lineId: string;
}): Promise<void> {
  const db = getDb();
  const full = await getOrder(input.accountId, input.orderId);
  if (!full) throw new Error("That order is not in this account.");
  if (!full.lines.some((l) => l.id === input.lineId)) return;
  await db.delete(orderLines).where(eq(orderLines.id, input.lineId));
  await recalcOrder(input.accountId, input.orderId);
}

/**
 * Change the rental window. Every line re-prices, because a Tuesday-to-Thursday
 * window and a Friday-to-Monday window are different prices for the same chairs
 * and leaving the old rate on the line would quietly undercharge.
 */
export async function setWindow(input: {
  accountId: string;
  orderId: string;
  outOn: IsoDate;
  dueBackOn: IsoDate;
  delivery?: boolean;
  address?: string | null;
}): Promise<void> {
  if (!isValidWindow({ outOn: input.outOn, dueBackOn: input.dueBackOn })) {
    throw new WindowError(
      "The due-back date has to be after the out date — a one-day rental goes out Saturday and comes back Sunday.",
    );
  }
  const db = getDb();
  const full = await getOrder(input.accountId, input.orderId);
  if (!full) throw new Error("That order is not in this account.");

  await db
    .update(orders)
    .set({
      outOn: input.outOn,
      dueBackOn: input.dueBackOn,
      ...(input.delivery === undefined ? {} : { delivery: input.delivery }),
      ...(input.address === undefined ? {} : { address: input.address }),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, input.orderId));

  for (const line of full.lines) {
    const { rateCents } = rateForWindow(
      {
        dailyRateCents: line.dailyRateCents,
        weekendRateCents: line.weekendRateCents,
      },
      input.outOn,
      input.dueBackOn,
    );
    await db
      .update(orderLines)
      .set({ rateCents, lineTotalCents: rateCents * line.quantity, updatedAt: new Date() })
      .where(eq(orderLines.id, line.id));
  }
  await recalcOrder(input.accountId, input.orderId);
}

/**
 * Recompute subtotal, tax, total and deposit from the lines and the account's
 * settings. Called after every edit, so nothing can drift.
 */
export async function recalcOrder(accountId: string, orderId: string): Promise<Order> {
  const db = getDb();
  const full = await getOrder(accountId, orderId);
  if (!full) throw new Error("That order is not in this account.");

  const [account] = await db
    .select({ settings: accounts.settings })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  const settings = parseSettings(account?.settings);
  const totals = quoteTotals(
    full.lines.map((l) => ({ quantity: l.quantity, rateCents: l.rateCents })),
    {
      delivery: full.order.delivery,
      deliveryFeeCents: settings.deliveryFeeCents,
      taxRateBps: settings.taxRateBps,
      taxExempt: full.customer.taxExempt,
      depositPercentBps: settings.depositPercentBps,
      depositMinimumCents: settings.depositMinimumCents,
      // Once a hold exists the deposit is fixed: re-deriving it from a changed
      // subtotal would leave the order claiming a hold amount Stripe never
      // authorised.
      depositOverrideCents: full.order.depositStatus === "none" ? null : full.order.depositCents,
    },
  );

  const [updated] = await db
    .update(orders)
    .set({
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      depositCents: totals.depositCents,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId))
    .returning();
  return updated;
}

/**
 * Override the deposit for one order. Refused once a hold exists: an order
 * claiming a deposit Stripe never authorised is worse than an awkward number.
 */
export async function setDepositAmount(
  accountId: string,
  orderId: string,
  cents: number,
): Promise<void> {
  const db = getDb();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.accountId, accountId), eq(orders.id, orderId)));
  if (!order) throw new Error("That order is not in this account.");
  if (order.depositStatus !== "none") {
    throw new Error(
      "The deposit is already authorised on the customer's card, so its amount is fixed. Release the hold first if it has to change.",
    );
  }
  await db
    .update(orders)
    .set({ depositCents: Math.max(0, Math.trunc(cents)), updatedAt: new Date() })
    .where(eq(orders.id, orderId));
}

/* -------------------------------------------------------------- lifecycle --- */

export async function markSent(
  accountId: string,
  orderId: string,
  signTokenHash: string,
  actor: string,
): Promise<void> {
  await getDb()
    .update(orders)
    .set({ status: "sent", sentAt: new Date(), signTokenHash, updatedAt: new Date() })
    .where(and(eq(orders.accountId, accountId), eq(orders.id, orderId)));
  await audit(accountId, actor, "order.sent", orderId);
}

/**
 * Accept a quote. The whole point of the app is in this transaction.
 *
 * The availability re-check runs *inside* it, against a locked account row, so a
 * quote that sat in an inbox for a week cannot commit inventory that was sold in
 * the meantime. A failed re-check throws `ConflictError` naming the other order
 * and nothing is written — no signature, no status change, no hold.
 */
export async function acceptQuote(input: {
  accountId: string;
  orderId: string;
  signerName: string;
  signerInitials: string;
  signatureKey: string | null;
}): Promise<Order> {
  const db = getDb();
  const accepted = await db.transaction(async (tx) => {
    await assertAvailableForOrder(tx, input.accountId, input.orderId);
    const [order] = await tx
      .update(orders)
      .set({
        status: "accepted",
        signedAt: new Date(),
        signerName: input.signerName,
        signerInitials: input.signerInitials,
        signatureR2Key: input.signatureKey,
        updatedAt: new Date(),
      })
      .where(and(eq(orders.id, input.orderId), eq(orders.accountId, input.accountId)))
      .returning();
    return order;
  });
  await audit(input.accountId, `customer:${input.signerName}`, "order.accepted", input.orderId, {
    number: accepted.number,
  });
  return accepted;
}

export async function attachContract(
  orderId: string,
  contractKey: string,
  docHash: string,
): Promise<void> {
  await getDb()
    .update(orders)
    .set({ contractR2Key: contractKey, docHash, updatedAt: new Date() })
    .where(eq(orders.id, orderId));
}

export async function markOut(accountId: string, orderId: string, actor: string): Promise<void> {
  const full = await getOrder(accountId, orderId);
  if (!full) throw new Error("That order is not in this account.");
  if (full.order.status !== "confirmed" && full.order.status !== "accepted") {
    throw new Error(
      `Order #${full.order.number} is ${full.order.status}. Only a confirmed order goes out.`,
    );
  }
  await getDb()
    .update(orders)
    .set({ status: "out", outAt: new Date(), updatedAt: new Date() })
    .where(eq(orders.id, orderId));
  await audit(accountId, actor, "order.out", orderId, { number: full.order.number });
}

export async function markReturned(
  accountId: string,
  orderId: string,
  actor: string,
): Promise<void> {
  await getDb()
    .update(orders)
    .set({ status: "returned", returnedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(orders.accountId, accountId), eq(orders.id, orderId)));
  await audit(accountId, actor, "order.returned", orderId);
}

export async function closeOrder(accountId: string, orderId: string, actor: string): Promise<void> {
  await getDb()
    .update(orders)
    .set({ status: "closed", closedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(orders.accountId, accountId), eq(orders.id, orderId)));
  await audit(accountId, actor, "order.closed", orderId);
}

export async function cancelOrder(accountId: string, orderId: string, actor: string): Promise<void> {
  const full = await getOrder(accountId, orderId);
  if (!full) throw new Error("That order is not in this account.");
  if (full.order.status === "out") {
    throw new Error(
      `Order #${full.order.number} is out on a truck. Check it back in before cancelling it.`,
    );
  }
  await getDb()
    .update(orders)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(orders.id, orderId));
  await audit(accountId, actor, "order.cancelled", orderId, { number: full.order.number });
}

/* ----------------------------------------------------------------- lists --- */

export interface OrderListRow {
  order: Order;
  customerName: string;
  unitCount: number;
  lineCount: number;
}

export async function listOrders(
  accountId: string,
  opts: { statuses?: Order["status"][]; customerId?: string; limit?: number } = {},
): Promise<OrderListRow[]> {
  const db = getDb();
  const where = [eq(orders.accountId, accountId)];
  if (opts.statuses?.length) where.push(inArray(orders.status, opts.statuses));
  if (opts.customerId) where.push(eq(orders.customerId, opts.customerId));

  const rows = await db
    .select({
      order: orders,
      customerName: customers.name,
      unitCount: sql<number>`COALESCE(SUM(${orderLines.quantity}), 0)`,
      lineCount: sql<number>`COUNT(${orderLines.id})`,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .leftJoin(orderLines, eq(orderLines.orderId, orders.id))
    .where(and(...where))
    .groupBy(orders.id, customers.name)
    .orderBy(desc(orders.outOn), desc(orders.number))
    .limit(opts.limit ?? 100);

  return rows.map((r) => ({
    order: r.order,
    customerName: r.customerName,
    unitCount: Number(r.unitCount),
    lineCount: Number(r.lineCount),
  }));
}

/** Orders due back on or before `date` and still out — the returns queue. */
export async function listDueBack(accountId: string, date: IsoDate): Promise<OrderListRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      order: orders,
      customerName: customers.name,
      unitCount: sql<number>`COALESCE(SUM(${orderLines.quantity}), 0)`,
      lineCount: sql<number>`COUNT(${orderLines.id})`,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .leftJoin(orderLines, eq(orderLines.orderId, orders.id))
    .where(
      and(
        eq(orders.accountId, accountId),
        eq(orders.status, "out"),
        lte(orders.dueBackOn, date),
      ),
    )
    .groupBy(orders.id, customers.name)
    .orderBy(asc(orders.dueBackOn))
    .limit(200);
  return rows.map((r) => ({
    order: r.order,
    customerName: r.customerName,
    unitCount: Number(r.unitCount),
    lineCount: Number(r.lineCount),
  }));
}

/** Orders checked in but not yet settled — the deposit still needs a decision. */
export async function listAwaitingSettlement(accountId: string): Promise<OrderListRow[]> {
  return listOrders(accountId, { statuses: ["returned"] });
}

/** Lines on an order that have no check in the given direction yet. */
export async function linesAwaitingCheck(
  orderId: string,
  direction: "out" | "in",
): Promise<LineWithItem[]> {
  const db = getDb();
  const rows = await db
    .select({ id: orderLines.id })
    .from(orderLines)
    .leftJoin(
      checks,
      and(eq(checks.orderLineId, orderLines.id), eq(checks.direction, direction)),
    )
    .where(and(eq(orderLines.orderId, orderId), isNull(checks.id)));
  const ids = new Set(rows.map((r) => r.id));
  return (await getLines(orderId)).filter((l) => ids.has(l.id));
}

/** One-line email summary of an order's contents. */
export async function summaryFor(orderId: string): Promise<string> {
  const lines = await getLines(orderId);
  return itemSummary(lines.map((l) => ({ quantity: l.quantity, itemName: l.itemName })));
}

export { ConflictError, WindowError };

/** Today, in the account's own timezone — the yard's day, not UTC's. */
export function todayFor(account: Pick<Account, "timezone">): IsoDate {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: account.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return isoDateOf(new Date());
  }
}

/** Items available to add to a quote — the catalogue, active only. */
export async function catalogue(accountId: string): Promise<Item[]> {
  return getDb()
    .select()
    .from(items)
    .where(and(eq(items.accountId, accountId), eq(items.status, "active")))
    .orderBy(asc(items.category), asc(items.name));
}

/** Orders overlapping a window, for the calendar. */
export async function ordersInWindow(
  accountId: string,
  from: IsoDate,
  to: IsoDate,
): Promise<OrderListRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      order: orders,
      customerName: customers.name,
      unitCount: sql<number>`COALESCE(SUM(${orderLines.quantity}), 0)`,
      lineCount: sql<number>`COUNT(${orderLines.id})`,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .leftJoin(orderLines, eq(orderLines.orderId, orders.id))
    .where(
      and(
        eq(orders.accountId, accountId),
        // The same half-open overlap the availability query uses, with the
        // due-back day included so a return shows on the calendar.
        lt(orders.outOn, to),
        gte(orders.dueBackOn, from),
        inArray(orders.status, ["sent", "accepted", "confirmed", "out", "returned", "closed"]),
      ),
    )
    .groupBy(orders.id, customers.name)
    .orderBy(asc(orders.outOn));
  return rows.map((r) => ({
    order: r.order,
    customerName: r.customerName,
    unitCount: Number(r.unitCount),
    lineCount: Number(r.lineCount),
  }));
}
