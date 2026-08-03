/**
 * src/lib/loads.ts
 *
 * The load's data layer: queries the board and cab render, and the one
 * `advance` call the cab's single button makes.
 *
 * The legality of a transition is decided by `lifecycle.ts` (pure, tested) and
 * applied here. `advance` re-reads the load inside the write, so two taps on a
 * flaky connection cannot double-stamp: the second tap recomputes the next
 * action from the row as it now is, and refuses if the world moved on.
 */

import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accessorialLines,
  brokers,
  documents,
  invoices,
  loads,
  stops,
  trucks,
  type AccessorialLine,
  type Broker,
  type DocumentRow,
  type Invoice,
  type Load,
  type LoadStatus,
  type Stop,
  type Truck,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { settleDetentionForStop, syncAccessorialTotal } from "@/lib/detention";
import { nextAction, sortStops, type NextAction, type ThreadStop } from "@/lib/lifecycle";

export interface LoadWithStops {
  load: Load;
  stops: Stop[];
  broker: Broker | null;
  truck: Truck | null;
}

export interface LoadDetail extends LoadWithStops {
  documents: DocumentRow[];
  lines: AccessorialLine[];
  invoice: Invoice | null;
}

/** The board's rows. Drivers get their own loads only. */
export async function listLoads(opts: {
  carrierId: string;
  statuses?: LoadStatus[];
  driverUserId?: string;
  truckId?: string;
  brokerId?: string;
  limit?: number;
}): Promise<LoadWithStops[]> {
  const db = getDb();
  const conditions = [eq(loads.carrierId, opts.carrierId)];
  if (opts.statuses && opts.statuses.length > 0) conditions.push(inArray(loads.status, opts.statuses));
  if (opts.driverUserId) conditions.push(eq(loads.driverUserId, opts.driverUserId));
  if (opts.truckId) conditions.push(eq(loads.truckId, opts.truckId));
  if (opts.brokerId) conditions.push(eq(loads.brokerId, opts.brokerId));

  const rows = await db
    .select({ load: loads, broker: brokers, truck: trucks })
    .from(loads)
    .leftJoin(brokers, eq(loads.brokerId, brokers.id))
    .leftJoin(trucks, eq(loads.truckId, trucks.id))
    .where(and(...conditions))
    .orderBy(desc(loads.bookedAt))
    .limit(opts.limit ?? 200);

  if (rows.length === 0) return [];
  const stopRows = await db
    .select()
    .from(stops)
    .where(inArray(stops.loadId, rows.map((r) => r.load.id)))
    .orderBy(asc(stops.seq));

  const byLoad = new Map<string, Stop[]>();
  for (const stop of stopRows) {
    const list = byLoad.get(stop.loadId) ?? [];
    list.push(stop);
    byLoad.set(stop.loadId, list);
  }

  return rows.map((r) => ({
    load: r.load,
    broker: r.broker,
    truck: r.truck,
    stops: byLoad.get(r.load.id) ?? [],
  }));
}

/** One load with everything the detail screen shows. Scoped to the carrier. */
export async function getLoadDetail(
  carrierId: string,
  loadId: string,
): Promise<LoadDetail | null> {
  const db = getDb();
  const [row] = await db
    .select({ load: loads, broker: brokers, truck: trucks })
    .from(loads)
    .leftJoin(brokers, eq(loads.brokerId, brokers.id))
    .leftJoin(trucks, eq(loads.truckId, trucks.id))
    .where(and(eq(loads.id, loadId), eq(loads.carrierId, carrierId)));
  if (!row) return null;

  const [stopRows, docRows, lineRows, invoiceRows] = await Promise.all([
    db.select().from(stops).where(eq(stops.loadId, loadId)).orderBy(asc(stops.seq)),
    db.select().from(documents).where(eq(documents.loadId, loadId)).orderBy(asc(documents.createdAt)),
    db.select().from(accessorialLines).where(eq(accessorialLines.loadId, loadId)).orderBy(asc(accessorialLines.createdAt)),
    db.select().from(invoices).where(eq(invoices.loadId, loadId)),
  ]);

  return {
    load: row.load,
    broker: row.broker,
    truck: row.truck,
    stops: stopRows,
    documents: docRows,
    lines: lineRows,
    invoice: invoiceRows[0] ?? null,
  };
}

/**
 * The driver's current load: the one that is under way, or else the next one
 * booked. A driver with a truck assignment but no personal assignment still
 * sees their truck's loads — the common micro-fleet case where the dispatcher
 * assigns to a unit, not a person.
 */
export async function currentCabLoad(opts: {
  carrierId: string;
  userId: string;
  truckId: string | null;
  role: "owner" | "dispatcher" | "driver";
}): Promise<LoadDetail | null> {
  const db = getDb();
  const active: LoadStatus[] = ["dispatched", "at_shipper", "in_transit", "booked"];

  const ownership =
    opts.role === "driver"
      ? opts.truckId
        ? or(eq(loads.driverUserId, opts.userId), eq(loads.truckId, opts.truckId))
        : eq(loads.driverUserId, opts.userId)
      : undefined;

  const conditions = [eq(loads.carrierId, opts.carrierId), inArray(loads.status, active)];
  if (ownership) conditions.push(ownership);

  const rows = await db
    .select({ id: loads.id, status: loads.status })
    .from(loads)
    .where(and(...conditions))
    // A load under way outranks one merely booked, then oldest booking first.
    .orderBy(sql`case when ${loads.status} = 'booked' then 1 else 0 end`, asc(loads.bookedAt))
    .limit(1);

  if (rows.length === 0) return null;
  return getLoadDetail(opts.carrierId, rows[0].id);
}

/** Can this user touch this load from the cab? */
export function driverOwnsLoad(
  load: Load,
  user: { id: string; role: string; truckId: string | null },
): boolean {
  if (user.role !== "driver") return true;
  if (load.driverUserId === user.id) return true;
  return Boolean(user.truckId && load.truckId === user.truckId);
}

export function toThreadStops(rows: Stop[]): ThreadStop[] {
  return sortStops(rows).map((s) => ({
    id: s.id,
    seq: s.seq,
    kind: s.kind,
    facility: s.facility,
    city: s.city,
    state: s.state,
    windowStart: s.windowStart,
    windowEnd: s.windowEnd,
    arrivedAt: s.arrivedAt,
    departedAt: s.departedAt,
  }));
}

export interface AdvanceResult {
  ok: boolean
  status: LoadStatus;
  /** What just got recorded, in the words the stamp shows. */
  message: string;
  /** Set when the tap was refused — the cab shows this sentence. */
  blocked?: string;
}

/**
 * The cab's one button. Computes the next legal transition from the row as it is
 * right now and applies it.
 */
export async function advance(opts: {
  carrierId: string;
  loadId: string;
  actor: string;
  now?: Date;
}): Promise<AdvanceResult> {
  const db = getDb();
  const now = opts.now ?? new Date();

  const [load] = await db
    .select()
    .from(loads)
    .where(and(eq(loads.id, opts.loadId), eq(loads.carrierId, opts.carrierId)));
  if (!load) return { ok: false, status: "booked", message: "", blocked: "That load is not on this account." };

  const stopRows = await db.select().from(stops).where(eq(stops.loadId, load.id)).orderBy(asc(stops.seq));
  const action = nextAction(load, toThreadStops(stopRows));
  if (!action) {
    return {
      ok: false,
      status: load.status,
      message: "",
      blocked: `This load is already ${load.status.replace("_", " ")}. Nothing left to stamp from the cab.`,
    };
  }

  if (action.requiresPod) {
    const pod = await db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.loadId, load.id),
          inArray(documents.kind, ["pod_photo", "bol"]),
        ),
      )
      .limit(1);
    if (pod.length === 0) {
      return {
        ok: false,
        status: load.status,
        message: "",
        blocked:
          "Photograph the signed BOL first — a delivered load without a POD is an invoice the broker bounces.",
      };
    }
  }

  return applyAction(load, action, now, opts.actor);
}

async function applyAction(
  load: Load,
  action: NextAction,
  now: Date,
  actor: string,
): Promise<AdvanceResult> {
  const db = getDb();

  if (action.kind === "dispatch") {
    // Guarded on the status we read, so a duplicate tap updates nothing.
    const updated = await db
      .update(loads)
      .set({ status: "dispatched", updatedAt: now })
      .where(and(eq(loads.id, load.id), eq(loads.status, "booked")))
      .returning({ id: loads.id });
    if (updated.length === 0) return staleResult(load);
    await audit({
      carrierId: load.carrierId,
      actor,
      action: "load.dispatched",
      target: load.id,
      metadata: { at: now.toISOString() },
    });
    return { ok: true, status: "dispatched", message: "Dispatched" };
  }

  if (action.kind === "arrive" && action.stop) {
    const updated = await db
      .update(stops)
      .set({ arrivedAt: now, updatedAt: now })
      .where(and(eq(stops.id, action.stop.id), isNull(stops.arrivedAt)))
      .returning({ id: stops.id });
    if (updated.length === 0) return staleResult(load);
    await db
      .update(loads)
      .set({ status: action.nextStatus, updatedAt: now })
      .where(eq(loads.id, load.id));
    await audit({
      carrierId: load.carrierId,
      actor,
      action: "stop.arrived",
      target: action.stop.id,
      metadata: { loadId: load.id, at: now.toISOString(), facility: action.stop.facility },
    });
    return { ok: true, status: action.nextStatus, message: "Arrival stamped" };
  }

  // depart
  if (action.stop) {
    const updated = await db
      .update(stops)
      .set({ departedAt: now, updatedAt: now })
      .where(and(eq(stops.id, action.stop.id), isNull(stops.departedAt)))
      .returning({ id: stops.id });
    if (updated.length === 0) return staleResult(load);
    // Freeze the detention figure now rather than waiting up to five minutes.
    await settleDetentionForStop(action.stop.id, now);
    await audit({
      carrierId: load.carrierId,
      actor,
      action: "stop.departed",
      target: action.stop.id,
      metadata: { loadId: load.id, at: now.toISOString() },
    });
  }

  const patch: Partial<Load> = { status: action.nextStatus, updatedAt: now };
  if (action.nextStatus === "delivered") patch.deliveredAt = now;
  await db.update(loads).set(patch).where(eq(loads.id, load.id));

  if (action.nextStatus === "delivered") {
    await audit({
      carrierId: load.carrierId,
      actor,
      action: "load.delivered",
      target: load.id,
      metadata: { at: now.toISOString() },
    });
    return { ok: true, status: "delivered", message: "Delivered" };
  }
  return { ok: true, status: action.nextStatus, message: "Departure stamped" };
}

function staleResult(load: Load): AdvanceResult {
  return {
    ok: false,
    status: load.status,
    message: "",
    blocked: "That stamp was already recorded — pull down to refresh the card.",
  };
}

export interface NewLoadInput {
  carrierId: string;
  brokerId: string | null;
  truckId: string | null;
  driverUserId: string | null;
  reference: string | null;
  rateCents: number;
  totalMiles: number | null;
  deadheadMiles: number | null;
  equipment: "van" | "reefer" | "flatbed" | "other";
  notes: string | null;
  stops: Array<{
    kind: "pickup" | "delivery";
    facility: string | null;
    address: string | null;
    city: string;
    state: string;
    windowStart: Date | null;
    windowEnd: Date | null;
    appointmentRef: string | null;
  }>;
}

/** Create a load and its stops in one transaction. */
export async function createLoad(input: NewLoadInput, actor: string): Promise<Load> {
  if (input.stops.length < 2) throw new Error("A load needs at least a pickup and a delivery");
  if (!input.stops.some((s) => s.kind === "pickup")) throw new Error("A load needs a pickup");
  if (!input.stops.some((s) => s.kind === "delivery")) throw new Error("A load needs a delivery");
  if (input.rateCents <= 0) throw new Error("Enter the rate");

  const db = getDb();
  const load = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(loads)
      .values({
        carrierId: input.carrierId,
        brokerId: input.brokerId,
        truckId: input.truckId,
        driverUserId: input.driverUserId,
        reference: input.reference,
        rateCents: input.rateCents,
        totalMiles: input.totalMiles,
        deadheadMiles: input.deadheadMiles,
        equipment: input.equipment,
        notes: input.notes,
        status: "booked",
      })
      .returning();

    await tx.insert(stops).values(
      input.stops.map((stop, index) => ({
        loadId: created.id,
        seq: index + 1,
        kind: stop.kind,
        facility: stop.facility,
        address: stop.address,
        city: stop.city,
        state: stop.state.toUpperCase(),
        windowStart: stop.windowStart,
        windowEnd: stop.windowEnd,
        appointmentRef: stop.appointmentRef,
      })),
    );
    return created;
  });

  await audit({
    carrierId: input.carrierId,
    actor,
    action: "load.created",
    target: load.id,
    metadata: { reference: input.reference, rateCents: input.rateCents },
  });
  return load;
}

/** Assign a truck and driver from the board. */
export async function assignLoad(opts: {
  carrierId: string;
  loadId: string;
  truckId: string | null;
  driverUserId: string | null;
  actor: string;
}): Promise<void> {
  const db = getDb();
  await db
    .update(loads)
    .set({ truckId: opts.truckId, driverUserId: opts.driverUserId, updatedAt: new Date() })
    .where(and(eq(loads.id, opts.loadId), eq(loads.carrierId, opts.carrierId)));
  await audit({
    carrierId: opts.carrierId,
    actor: opts.actor,
    action: "load.assigned",
    target: opts.loadId,
    metadata: { truckId: opts.truckId, driverUserId: opts.driverUserId },
  });
}

export async function cancelLoad(opts: {
  carrierId: string;
  loadId: string;
  actor: string;
}): Promise<void> {
  const db = getDb();
  const updated = await db
    .update(loads)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(loads.id, opts.loadId),
        eq(loads.carrierId, opts.carrierId),
        ne(loads.status, "paid"),
        ne(loads.status, "invoiced"),
      ),
    )
    .returning({ id: loads.id });
  if (updated.length === 0) {
    throw new Error("An invoiced or paid load cannot be cancelled — void the invoice first.");
  }
  await audit({ carrierId: opts.carrierId, actor: opts.actor, action: "load.cancelled", target: opts.loadId });
}

/** Confirm or dismiss a drafted accessorial line. */
export async function decideAccessorial(opts: {
  carrierId: string;
  lineId: string;
  decision: "billed" | "rejected";
  actor: string;
}): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ line: accessorialLines, loadId: loads.id })
    .from(accessorialLines)
    .innerJoin(loads, eq(accessorialLines.loadId, loads.id))
    .where(and(eq(accessorialLines.id, opts.lineId), eq(loads.carrierId, opts.carrierId)));
  if (!row) throw new Error("That accessorial line is not on this account.");
  if (row.line.status !== "draft") throw new Error("That line has already been decided.");

  await db
    .update(accessorialLines)
    .set({ status: opts.decision, updatedAt: new Date() })
    .where(eq(accessorialLines.id, opts.lineId));
  await syncAccessorialTotal(row.loadId);
  await audit({
    carrierId: opts.carrierId,
    actor: opts.actor,
    action: `accessorial.${opts.decision}`,
    target: opts.lineId,
    metadata: { amountCents: row.line.amountCents, kind: row.line.kind },
  });
}

/** Add an accessorial by hand — lumper receipts, TONU, layover. */
export async function addAccessorial(opts: {
  carrierId: string;
  loadId: string;
  kind: "lumper" | "tonu" | "layover" | "other";
  description: string;
  amountCents: number;
  actor: string;
}): Promise<void> {
  const db = getDb();
  const [load] = await db
    .select({ id: loads.id })
    .from(loads)
    .where(and(eq(loads.id, opts.loadId), eq(loads.carrierId, opts.carrierId)));
  if (!load) throw new Error("That load is not on this account.");
  if (opts.amountCents <= 0) throw new Error("Enter an amount");
  if (opts.description.trim().length < 3) throw new Error("Describe the charge — the broker will read it");

  await db.insert(accessorialLines).values({
    loadId: opts.loadId,
    kind: opts.kind,
    description: opts.description.trim(),
    amountCents: opts.amountCents,
    // Added by hand, so it is billable straight away: a human already decided.
    status: "billed",
    evidence: {},
  });
  await syncAccessorialTotal(opts.loadId);
  await audit({
    carrierId: opts.carrierId,
    actor: opts.actor,
    action: "accessorial.added",
    target: opts.loadId,
    metadata: { kind: opts.kind, amountCents: opts.amountCents },
  });
}
