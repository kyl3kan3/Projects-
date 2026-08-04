/**
 * src/lib/items.ts
 *
 * The catalogue: items, owned counts, serialised units, maintenance holds.
 *
 * `owned_count` is the number availability divides by, so every edit to it is
 * audited — a count that dropped from 200 to 20 by a typo is a week of
 * unexplained "not available" answers, and the audit line is how that gets found.
 */

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  items,
  maintenanceHolds,
  orderLines,
  orders,
  units,
  type Item,
  type MaintenanceHold,
  type Unit,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { BOOKED_STATUSES } from "@/lib/availability-core";
import type { IsoDate } from "@/lib/dates";
import { parseDamageFees } from "@/lib/settings";
import type { DamageFee } from "@/db/schema";

export async function listItems(accountId: string, includeRetired = false): Promise<Item[]> {
  const db = getDb();
  const where = [eq(items.accountId, accountId)];
  if (!includeRetired) where.push(eq(items.status, "active"));
  return db
    .select()
    .from(items)
    .where(and(...where))
    .orderBy(asc(items.category), asc(items.name));
}

export async function getItem(accountId: string, itemId: string): Promise<Item | null> {
  const [item] = await getDb()
    .select()
    .from(items)
    .where(and(eq(items.accountId, accountId), eq(items.id, itemId)));
  return item ?? null;
}

export async function createItem(input: {
  accountId: string;
  name: string;
  category: string | null;
  ownedCount: number;
  dailyRateCents: number;
  weekendRateCents: number | null;
  replacementCents: number | null;
  trackedBy: "quantity" | "serial";
  damageFees: DamageFee[];
  actor: string;
}): Promise<Item> {
  if (!input.name.trim()) throw new Error("Give the item a name — what does the yard call it?");
  if (input.ownedCount < 0) throw new Error("Owned count cannot be negative.");
  const [item] = await getDb()
    .insert(items)
    .values({
      accountId: input.accountId,
      name: input.name.trim(),
      category: input.category?.trim() || null,
      ownedCount: input.ownedCount,
      dailyRateCents: input.dailyRateCents,
      weekendRateCents: input.weekendRateCents,
      replacementCents: input.replacementCents,
      trackedBy: input.trackedBy,
      damageFees: input.damageFees,
    })
    .returning();
  await audit(input.accountId, input.actor, "item.created", item.id, {
    name: item.name,
    ownedCount: item.ownedCount,
  });
  return item;
}

export async function updateItem(input: {
  accountId: string;
  itemId: string;
  name: string;
  category: string | null;
  ownedCount: number;
  dailyRateCents: number;
  weekendRateCents: number | null;
  replacementCents: number | null;
  damageFees: DamageFee[];
  actor: string;
}): Promise<void> {
  const db = getDb();
  const before = await getItem(input.accountId, input.itemId);
  if (!before) throw new Error("That item is not in this catalogue.");
  if (input.ownedCount < 0) throw new Error("Owned count cannot be negative.");

  await db
    .update(items)
    .set({
      name: input.name.trim(),
      category: input.category?.trim() || null,
      ownedCount: input.ownedCount,
      dailyRateCents: input.dailyRateCents,
      weekendRateCents: input.weekendRateCents,
      replacementCents: input.replacementCents,
      damageFees: input.damageFees,
      updatedAt: new Date(),
    })
    .where(eq(items.id, input.itemId));

  if (before.ownedCount !== input.ownedCount) {
    await audit(input.accountId, input.actor, "item.count_changed", input.itemId, {
      name: input.name.trim(),
      from: before.ownedCount,
      to: input.ownedCount,
    });
  } else {
    await audit(input.accountId, input.actor, "item.edited", input.itemId, {
      name: input.name.trim(),
    });
  }
}

/**
 * Retire rather than delete. An item on a closed order from two years ago still
 * has to render its line, and a deleted row makes that order unreadable.
 */
export async function retireItem(
  accountId: string,
  itemId: string,
  actor: string,
): Promise<void> {
  const db = getDb();
  const booked = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .where(
      and(
        eq(orderLines.itemId, itemId),
        eq(orders.accountId, accountId),
        inArray(orders.status, [...BOOKED_STATUSES]),
      ),
    );
  if (Number(booked[0]?.count ?? 0) > 0) {
    throw new Error(
      "This item is on a booked order. Retire it once those orders are back and closed.",
    );
  }
  await db
    .update(items)
    .set({ status: "retired", updatedAt: new Date() })
    .where(and(eq(items.accountId, accountId), eq(items.id, itemId)));
  await audit(accountId, actor, "item.retired", itemId);
}

export async function reactivateItem(accountId: string, itemId: string): Promise<void> {
  await getDb()
    .update(items)
    .set({ status: "active", updatedAt: new Date() })
    .where(and(eq(items.accountId, accountId), eq(items.id, itemId)));
}

export function damageFeesOf(item: Item): DamageFee[] {
  return parseDamageFees(item.damageFees);
}

/* ------------------------------------------------------------------ units --- */

export async function listUnits(itemId: string): Promise<Unit[]> {
  return getDb().select().from(units).where(eq(units.itemId, itemId)).orderBy(asc(units.serial));
}

export async function addUnit(input: {
  accountId: string;
  itemId: string;
  serial: string;
  actor: string;
}): Promise<Unit> {
  if (!input.serial.trim()) throw new Error("A unit needs a serial or asset tag.");
  const item = await getItem(input.accountId, input.itemId);
  if (!item) throw new Error("That item is not in this catalogue.");
  const [unit] = await getDb()
    .insert(units)
    .values({ itemId: input.itemId, serial: input.serial.trim() })
    .returning();
  await audit(input.accountId, input.actor, "unit.added", input.itemId, { serial: unit.serial });
  return unit;
}

export async function setUnitStatus(input: {
  accountId: string;
  unitId: string;
  status: Unit["status"];
}): Promise<void> {
  await getDb()
    .update(units)
    .set({ status: input.status, updatedAt: new Date() })
    .where(eq(units.id, input.unitId));
}

/* ------------------------------------------------------ maintenance holds --- */

export async function listHolds(itemId: string): Promise<MaintenanceHold[]> {
  return getDb()
    .select()
    .from(maintenanceHolds)
    .where(eq(maintenanceHolds.itemId, itemId))
    .orderBy(asc(maintenanceHolds.startsOn));
}

export async function addHold(input: {
  accountId: string;
  itemId: string;
  quantity: number;
  startsOn: IsoDate;
  endsOn: IsoDate;
  reason: string | null;
  actor: string;
}): Promise<MaintenanceHold> {
  if (input.endsOn <= input.startsOn) {
    throw new Error("A maintenance hold has to end after it starts.");
  }
  const item = await getItem(input.accountId, input.itemId);
  if (!item) throw new Error("That item is not in this catalogue.");
  if (input.quantity <= 0) throw new Error("Hold at least one unit.");
  if (input.quantity > item.ownedCount) {
    throw new Error(`You own ${item.ownedCount} of these — you cannot hold ${input.quantity}.`);
  }
  const [hold] = await getDb()
    .insert(maintenanceHolds)
    .values({
      itemId: input.itemId,
      quantity: input.quantity,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      reason: input.reason,
    })
    .returning();
  await audit(input.accountId, input.actor, "hold.added", input.itemId, {
    quantity: hold.quantity,
    startsOn: hold.startsOn,
    endsOn: hold.endsOn,
  });
  return hold;
}

export async function removeHold(accountId: string, holdId: string): Promise<void> {
  const db = getDb();
  const [hold] = await db
    .select({ id: maintenanceHolds.id })
    .from(maintenanceHolds)
    .innerJoin(items, eq(items.id, maintenanceHolds.itemId))
    .where(and(eq(maintenanceHolds.id, holdId), eq(items.accountId, accountId)));
  if (!hold) return;
  await db.delete(maintenanceHolds).where(eq(maintenanceHolds.id, holdId));
}

export { BOOKED_STATUSES };
