/**
 * One-tap 86ing — the service-truth path.
 *
 * This deliberately bypasses the draft/publish cycle. A price change is an edit
 * and waits for a publish; running out of half chickens at 7:40pm is not an
 * edit, it is tonight. So a flip writes the item, writes an event row with an
 * actor and a timestamp, and purges the guest page immediately.
 *
 * The acceptance criterion the whole product rests on: a guest scanning the QR
 * after a tap sees the item struck through, within seconds.
 *
 * Nightly auto-restore is expressed as "any open auto-restore 86 from *before*
 * the current service day comes back". That phrasing is what stops the two
 * classic scheduler bugs: it is idempotent (a restored event has `restored_at`
 * set and is never selected again), and it is pinned to a fixed boundary rather
 * than to "is it still 86'd?", which would be true forever.
 */

import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { eightySixEvents, locations, menuItems, type EightySixEvent } from "@/db/schema";
import { revalidatePublicMenu } from "@/lib/menu-data";
import { log } from "@/lib/menus";
import { serviceDayStart } from "@/lib/time";
import type { Actor } from "@/lib/auth";

export type RestoreMode = "manual" | "nightly_auto";

export interface EightySixResult {
  itemId: string;
  itemName: string;
  eightySixedAt: Date;
  /** Guest paths purged by this flip. */
  revalidatedPaths: string[];
  /** How many items are 86'd at this location right now. */
  openCount: number;
}

async function locationSlug(locationId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ slug: locations.slug })
    .from(locations)
    .where(eq(locations.id, locationId));
  return row?.slug ?? null;
}

/** Mark an item out of stock. Idempotent: a second tap is not a second event. */
export async function eightySix(
  itemId: string,
  actor: Actor,
  note?: string | null,
): Promise<EightySixResult> {
  const db = getDb();
  const [item] = await db.select().from(menuItems).where(eq(menuItems.id, itemId));
  if (!item) throw new Error("That dish no longer exists");

  const cleanNote = note?.trim().slice(0, 80) || null;
  const eightySixedAt = new Date();

  if (!item.isEightySixed) {
    await db
      .update(menuItems)
      .set({ isEightySixed: true, eightySixNote: cleanNote, updatedAt: eightySixedAt })
      .where(eq(menuItems.id, itemId));
    await db.insert(eightySixEvents).values({
      menuItemId: itemId,
      locationId: item.locationId,
      actorUserId: actor.userId,
      actorLabel: actor.label,
      note: cleanNote,
      eightySixedAt,
    });
    await log(item.locationId, itemId, item.name, actor, "86'd", "on menu", cleanNote ?? "86'd");
  } else if (cleanNote !== item.eightySixNote) {
    // Already 86'd: only the note moved. Update it, don't open a second event.
    await db
      .update(menuItems)
      .set({ eightySixNote: cleanNote, updatedAt: eightySixedAt })
      .where(eq(menuItems.id, itemId));
    const open = await openEventFor(itemId);
    if (open) {
      await db.update(eightySixEvents).set({ note: cleanNote }).where(eq(eightySixEvents.id, open.id));
    }
  }

  const slug = await locationSlug(item.locationId);
  if (slug) revalidatePublicMenu(slug);

  return {
    itemId,
    itemName: item.name,
    eightySixedAt: item.isEightySixed ? (await openEventFor(itemId))?.eightySixedAt ?? eightySixedAt : eightySixedAt,
    revalidatedPaths: slug ? [`/m/${slug}`] : [],
    openCount: await openCount(item.locationId),
  };
}

/** Put an item back on the menu. */
export async function restore(
  itemId: string,
  actor: Actor,
  mode: RestoreMode = "manual",
): Promise<EightySixResult> {
  const db = getDb();
  const [item] = await db.select().from(menuItems).where(eq(menuItems.id, itemId));
  if (!item) throw new Error("That dish no longer exists");

  const restoredAt = new Date();
  if (item.isEightySixed) {
    await db
      .update(menuItems)
      .set({ isEightySixed: false, eightySixNote: null, updatedAt: restoredAt })
      .where(eq(menuItems.id, itemId));
    await db
      .update(eightySixEvents)
      .set({ restoredAt, restoreMode: mode })
      .where(and(eq(eightySixEvents.menuItemId, itemId), isNull(eightySixEvents.restoredAt)));
    await log(
      item.locationId,
      itemId,
      item.name,
      actor,
      "back on menu",
      "86'd",
      mode === "nightly_auto" ? "restored automatically" : "restored",
    );
  }

  const slug = await locationSlug(item.locationId);
  if (slug) revalidatePublicMenu(slug);

  return {
    itemId,
    itemName: item.name,
    eightySixedAt: restoredAt,
    revalidatedPaths: slug ? [`/m/${slug}`] : [],
    openCount: await openCount(item.locationId),
  };
}

/** Toggle — what the board's one tap actually calls. */
export async function toggleEightySix(
  itemId: string,
  actor: Actor,
  note?: string | null,
): Promise<{ result: EightySixResult; nowEightySixed: boolean }> {
  const db = getDb();
  const [item] = await db.select().from(menuItems).where(eq(menuItems.id, itemId));
  if (!item) throw new Error("That dish no longer exists");
  if (item.isEightySixed) {
    return { result: await restore(itemId, actor, "manual"), nowEightySixed: false };
  }
  return { result: await eightySix(itemId, actor, note), nowEightySixed: true };
}

async function openEventFor(itemId: string): Promise<EightySixEvent | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(eightySixEvents)
    .where(and(eq(eightySixEvents.menuItemId, itemId), isNull(eightySixEvents.restoredAt)))
    .orderBy(desc(eightySixEvents.eightySixedAt))
    .limit(1);
  return row ?? null;
}

/** How many items are 86'd at this location right now. */
export async function openCount(locationId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(menuItems)
    .where(and(eq(menuItems.locationId, locationId), eq(menuItems.isEightySixed, true)));
  return Number(row?.n ?? 0);
}

/**
 * The board's header counter: "3 items 86'd tonight".
 *
 * "Tonight" is the current service day in the location's timezone, so the
 * closing crew at 1am still sees the night they worked — and an item that was
 * 86'd and restored during service still counts, because it happened tonight.
 */
export async function tonightCount(locationId: string, now = new Date()): Promise<number> {
  const db = getDb();
  const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
  if (!location) return 0;
  const since = serviceDayStart(now, location.timezone, location.serviceRolloverHour);
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${eightySixEvents.menuItemId})` })
    .from(eightySixEvents)
    .where(
      and(
        eq(eightySixEvents.locationId, locationId),
        // Typed operator, not a raw fragment: a Date interpolated into sql`` skips
        // Drizzle's encoder and postgres.js throws on it at runtime.
        gte(eightySixEvents.eightySixedAt, since),
      ),
    );
  return Number(row?.n ?? 0);
}

/** Tonight's service log, newest first — "Crispy Half Chicken · 86'd 7:42pm by Dana". */
export async function tonightLog(locationId: string, now = new Date()) {
  const db = getDb();
  const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
  if (!location) return [];
  const since = serviceDayStart(now, location.timezone, location.serviceRolloverHour);
  return db
    .select({
      id: eightySixEvents.id,
      itemName: menuItems.name,
      actorLabel: eightySixEvents.actorLabel,
      note: eightySixEvents.note,
      eightySixedAt: eightySixEvents.eightySixedAt,
      restoredAt: eightySixEvents.restoredAt,
      restoreMode: eightySixEvents.restoreMode,
    })
    .from(eightySixEvents)
    .innerJoin(menuItems, eq(menuItems.id, eightySixEvents.menuItemId))
    .where(and(eq(eightySixEvents.locationId, locationId), gte(eightySixEvents.eightySixedAt, since)))
    .orderBy(desc(eightySixEvents.eightySixedAt))
    .limit(40);
}

export interface AutoRestoreReport {
  locationId: string;
  locationName: string;
  restored: { itemId: string; itemName: string }[];
  serviceDayStart: string;
}

/**
 * Nightly auto-restore for one location.
 *
 * Restores every open 86 that was opened *before* the current service day began
 * and whose item has `auto_restore` on. Items the owner marked "off the menu
 * until further notice" (auto-restore off) stay 86'd.
 *
 * Safe to run repeatedly: the second run finds nothing, because the first
 * stamped `restored_at`.
 */
export async function autoRestoreLocation(
  locationId: string,
  now = new Date(),
): Promise<AutoRestoreReport> {
  const db = getDb();
  const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
  if (!location) {
    return { locationId, locationName: "", restored: [], serviceDayStart: now.toISOString() };
  }
  const boundary = serviceDayStart(now, location.timezone, location.serviceRolloverHour);

  const due = await db
    .select({
      eventId: eightySixEvents.id,
      itemId: menuItems.id,
      itemName: menuItems.name,
    })
    .from(eightySixEvents)
    .innerJoin(menuItems, eq(menuItems.id, eightySixEvents.menuItemId))
    .where(
      and(
        eq(eightySixEvents.locationId, locationId),
        isNull(eightySixEvents.restoredAt),
        lt(eightySixEvents.eightySixedAt, boundary),
        eq(menuItems.autoRestore, true),
        eq(menuItems.isEightySixed, true),
      ),
    );

  const actor: Actor = { userId: null, label: "nightly auto-restore" };
  const restored: { itemId: string; itemName: string }[] = [];
  for (const row of due) {
    await restore(row.itemId, actor, "nightly_auto");
    restored.push({ itemId: row.itemId, itemName: row.itemName });
  }

  return {
    locationId,
    locationName: location.name,
    restored,
    serviceDayStart: boundary.toISOString(),
  };
}

/** Every active location, for the cron sweep. */
export async function activeLocationIds(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.active, true));
  return rows.map((r) => r.id);
}
