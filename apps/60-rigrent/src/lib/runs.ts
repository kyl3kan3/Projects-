/**
 * src/lib/runs.ts
 *
 * Delivery and pickup runs: which orders are on which truck on which day, in
 * which order, and what has to be loaded onto it.
 *
 * A run's stop sequence lives in `runs.stop_order` as an array of order ids
 * rather than a sort key, because the route is a human decision — the marquee has
 * to be standing before the tables arrive — and no ORDER BY captures that.
 */

import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { getDb } from "@/db";
import {
  customers,
  items,
  orderLines,
  orders,
  runs,
  users,
  type Run,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { loadList, reorderStops, runTotals, stops, type RunLine } from "@/lib/runs-core";
import type { IsoDate } from "@/lib/dates";

export interface RunDetail {
  run: Run;
  driverName: string | null;
  lines: RunLine[];
  stops: ReturnType<typeof stops>;
  loadList: ReturnType<typeof loadList>;
  totals: ReturnType<typeof runTotals>;
}

export async function getRun(accountId: string, runId: string): Promise<RunDetail | null> {
  const db = getDb();
  const [run] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.accountId, accountId), eq(runs.id, runId)));
  if (!run) return null;

  let driverName: string | null = null;
  if (run.driverUserId) {
    const [driver] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, run.driverUserId));
    driverName = driver?.name ?? null;
  }

  const lines = run.stopOrder.length ? await runLines(accountId, run.stopOrder) : [];
  const stopList = stops(lines, run.stopOrder);
  const load = loadList(lines, run.stopOrder);
  return { run, driverName, lines, stops: stopList, loadList: load, totals: runTotals(load) };
}

async function runLines(accountId: string, orderIds: readonly string[]): Promise<RunLine[]> {
  const db = getDb();
  const rows = await db
    .select({
      orderId: orders.id,
      orderNumber: orders.number,
      customerName: customers.name,
      address: orders.address,
      itemId: items.id,
      itemName: items.name,
      category: items.category,
      quantity: orderLines.quantity,
    })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(items, eq(items.id, orderLines.itemId))
    .where(and(eq(orders.accountId, accountId), inArray(orders.id, [...orderIds])))
    .orderBy(asc(items.name));
  return rows;
}

export async function listRuns(
  accountId: string,
  opts: { from?: IsoDate; to?: IsoDate; limit?: number } = {},
): Promise<Array<{ run: Run; stopCount: number; driverName: string | null }>> {
  const db = getDb();
  const where = [eq(runs.accountId, accountId)];
  if (opts.from) where.push(gte(runs.runOn, opts.from));
  if (opts.to) where.push(lt(runs.runOn, opts.to));
  const rows = await db
    .select({ run: runs, driverName: users.name })
    .from(runs)
    .leftJoin(users, eq(users.id, runs.driverUserId))
    .where(and(...where))
    .orderBy(asc(runs.runOn))
    .limit(opts.limit ?? 120);
  return rows.map((r) => ({
    run: r.run,
    stopCount: r.run.stopOrder.length,
    driverName: r.driverName,
  }));
}

export async function createRun(input: {
  accountId: string;
  kind: "delivery" | "pickup";
  runOn: IsoDate;
  truckLabel: string | null;
  driverUserId: string | null;
  actor: string;
}): Promise<Run> {
  const [run] = await getDb()
    .insert(runs)
    .values({
      accountId: input.accountId,
      kind: input.kind,
      runOn: input.runOn,
      truckLabel: input.truckLabel,
      driverUserId: input.driverUserId,
      stopOrder: [],
    })
    .returning();
  await audit(input.accountId, input.actor, "run.created", run.id, {
    kind: run.kind,
    runOn: run.runOn,
  });
  return run;
}

export async function addStop(input: {
  accountId: string;
  runId: string;
  orderId: string;
  actor: string;
}): Promise<void> {
  const db = getDb();
  const [run] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.accountId, input.accountId), eq(runs.id, input.runId)));
  if (!run) throw new Error("That run is not in this account.");
  const [order] = await db
    .select({ id: orders.id, number: orders.number })
    .from(orders)
    .where(and(eq(orders.accountId, input.accountId), eq(orders.id, input.orderId)));
  if (!order) throw new Error("That order is not in this account.");
  if (run.stopOrder.includes(input.orderId)) return;

  await db
    .update(runs)
    .set({ stopOrder: [...run.stopOrder, input.orderId], updatedAt: new Date() })
    .where(eq(runs.id, run.id));
  await audit(input.accountId, input.actor, "run.stop_added", run.id, { orderNumber: order.number });
}

export async function removeStop(input: {
  accountId: string;
  runId: string;
  orderId: string;
}): Promise<void> {
  const db = getDb();
  const [run] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.accountId, input.accountId), eq(runs.id, input.runId)));
  if (!run) throw new Error("That run is not in this account.");
  await db
    .update(runs)
    .set({
      stopOrder: run.stopOrder.filter((id) => id !== input.orderId),
      updatedAt: new Date(),
    })
    .where(eq(runs.id, run.id));
}

export async function moveStop(input: {
  accountId: string;
  runId: string;
  orderId: string;
  direction: "up" | "down";
}): Promise<void> {
  const db = getDb();
  const [run] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.accountId, input.accountId), eq(runs.id, input.runId)));
  if (!run) throw new Error("That run is not in this account.");
  await db
    .update(runs)
    .set({
      stopOrder: reorderStops(run.stopOrder, input.orderId, input.direction),
      updatedAt: new Date(),
    })
    .where(eq(runs.id, run.id));
}

export async function setRunStatus(input: {
  accountId: string;
  runId: string;
  status: Run["status"];
  actor: string;
}): Promise<void> {
  await getDb()
    .update(runs)
    .set({ status: input.status, updatedAt: new Date() })
    .where(and(eq(runs.accountId, input.accountId), eq(runs.id, input.runId)));
  await audit(input.accountId, input.actor, `run.${input.status}`, input.runId);
}

export async function attachRunSheet(runId: string, key: string): Promise<void> {
  await getDb()
    .update(runs)
    .set({ sheetR2Key: key, updatedAt: new Date() })
    .where(eq(runs.id, runId));
}

export async function setRunDriver(input: {
  accountId: string;
  runId: string;
  driverUserId: string | null;
  truckLabel: string | null;
}): Promise<void> {
  await getDb()
    .update(runs)
    .set({
      driverUserId: input.driverUserId,
      truckLabel: input.truckLabel,
      updatedAt: new Date(),
    })
    .where(and(eq(runs.accountId, input.accountId), eq(runs.id, input.runId)));
}

/**
 * Orders that could go on a run for a date but are not on one yet. For a delivery
 * run that is confirmed orders going out that day; for a pickup run it is orders
 * out on the road due back that day.
 */
export async function candidateOrders(
  accountId: string,
  kind: "delivery" | "pickup",
  runOn: IsoDate,
): Promise<Array<{ id: string; number: number; customerName: string; address: string | null }>> {
  const db = getDb();
  const assigned = await db
    .select({ stopOrder: runs.stopOrder })
    .from(runs)
    .where(and(eq(runs.accountId, accountId), eq(runs.runOn, runOn)));
  const taken = new Set(assigned.flatMap((r) => r.stopOrder));

  const rows = await db
    .select({
      id: orders.id,
      number: orders.number,
      customerName: customers.name,
      address: orders.address,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(
      and(
        eq(orders.accountId, accountId),
        kind === "delivery" ? eq(orders.outOn, runOn) : eq(orders.dueBackOn, runOn),
        inArray(orders.status, kind === "delivery" ? ["accepted", "confirmed"] : ["out"]),
      ),
    )
    .orderBy(asc(orders.number));
  return rows.filter((r) => !taken.has(r.id));
}

export { loadList, stops, runTotals };
