/**
 * Menu domain logic: sections, items, positions, the draft/publish lifecycle,
 * and the change log.
 *
 * Two structural decisions worth stating:
 *
 *  - **Every field change writes a `menu_change_log` row.** Change history is a
 *    side effect of editing, not a feature someone has to remember to call. All
 *    writes go through {@link updateItem} / {@link updateSection} for that reason.
 *  - **Publishing is the only thing that changes what a guest sees — except an
 *    86.** A draft menu is invisible; a live menu regenerates on publish. 86 state
 *    bypasses the cycle by design (see src/lib/eighty-six.ts): it is service
 *    truth, not an edit.
 */

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  eightySixEvents,
  itemPhotos,
  locations,
  menuChangeLog,
  menuItems,
  menuSections,
  menus,
  type Daypart,
  type Menu,
  type MenuItem,
  type MenuSection,
} from "@/db/schema";
import { parseClock } from "@/lib/dayparts";
import { normaliseTags } from "@/lib/dietary";
import { revalidatePublicMenu } from "@/lib/menu-data";
import { centsToInput, money } from "@/lib/format";
import type { Actor } from "@/lib/auth";

// Dietary tags live in a db-free module so client components can import them
// without dragging `postgres` into the browser bundle.
export { DIETARY_TAGS, DIETARY_TAG_LABELS, normaliseTags, type DietaryTag } from "@/lib/dietary";

/** Positions are spaced so a drag lands between neighbours without a rewrite. */
export const POSITION_STEP = 100;

/**
 * Next sparse position at the end of a list.
 *
 * Written as `max(col)` plus a TypeScript fallback rather than a raw coalesce
 * against an interpolated step constant. Interpolating a JS number into a raw
 * fragment sends it as an *untyped* bind parameter, so Postgres sees `-$1` and
 * fails with `operator is not unique: - unknown` — at runtime only.
 * That broke creating a menu, a section, or a dish outright, and neither the
 * typechecker nor the production build noticed.
 */
function nextPosition(maxValue: number | null): number {
  return maxValue === null ? 0 : maxValue + POSITION_STEP;
}


/* ----------------------------------------------------------------- reading */

export interface EditorItem extends MenuItem {
  photoStatus: string | null;
}

export interface EditorSection extends MenuSection {
  items: EditorItem[];
}

export interface EditorMenu extends Menu {
  sections: EditorSection[];
}

export async function loadEditorMenus(locationId: string): Promise<EditorMenu[]> {
  const db = getDb();
  const menuRows = await db
    .select()
    .from(menus)
    .where(eq(menus.locationId, locationId))
    .orderBy(asc(menus.position), asc(menus.createdAt));
  if (!menuRows.length) return [];

  const sectionRows = await db
    .select()
    .from(menuSections)
    .where(inArray(menuSections.menuId, menuRows.map((m) => m.id)))
    .orderBy(asc(menuSections.position), asc(menuSections.createdAt));

  const itemRows = sectionRows.length
    ? await db
        .select()
        .from(menuItems)
        .where(inArray(menuItems.sectionId, sectionRows.map((s) => s.id)))
        .orderBy(asc(menuItems.position), asc(menuItems.createdAt))
    : [];

  const photoIds = itemRows.map((i) => i.photoId).filter((id): id is string => !!id);
  const photos = photoIds.length
    ? await db.select().from(itemPhotos).where(inArray(itemPhotos.id, photoIds))
    : [];
  const statusByPhoto = new Map(photos.map((p) => [p.id, p.status]));

  const itemsBySection = new Map<string, EditorItem[]>();
  for (const item of itemRows) {
    const bucket = itemsBySection.get(item.sectionId) ?? [];
    bucket.push({ ...item, photoStatus: item.photoId ? statusByPhoto.get(item.photoId) ?? null : null });
    itemsBySection.set(item.sectionId, bucket);
  }

  const sectionsByMenu = new Map<string, EditorSection[]>();
  for (const s of sectionRows) {
    const bucket = sectionsByMenu.get(s.menuId) ?? [];
    bucket.push({ ...s, items: itemsBySection.get(s.id) ?? [] });
    sectionsByMenu.set(s.menuId, bucket);
  }

  return menuRows.map((m) => ({ ...m, sections: sectionsByMenu.get(m.id) ?? [] }));
}

/** Every live item at a location, for the 86 board. */
export interface BoardItem {
  id: string;
  name: string;
  sectionName: string;
  menuName: string;
  priceCents: number;
  isEightySixed: boolean;
  eightySixNote: string | null;
  autoRestore: boolean;
  eightySixedAt: Date | null;
  eightySixedBy: string | null;
}

export async function loadBoardItems(locationId: string): Promise<BoardItem[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: menuItems.id,
      name: menuItems.name,
      priceCents: menuItems.priceCents,
      isEightySixed: menuItems.isEightySixed,
      eightySixNote: menuItems.eightySixNote,
      autoRestore: menuItems.autoRestore,
      sectionName: menuSections.name,
      menuName: menus.name,
      sectionPosition: menuSections.position,
      itemPosition: menuItems.position,
    })
    .from(menuItems)
    .innerJoin(menuSections, eq(menuSections.id, menuItems.sectionId))
    .innerJoin(menus, eq(menus.id, menuSections.menuId))
    .where(and(eq(menuItems.locationId, locationId), eq(menus.status, "live")))
    .orderBy(asc(menuSections.position), asc(menuItems.position), asc(menuItems.name));

  // The open 86 for each currently-86'd item: who, and when.
  const open = await db
    .select()
    .from(eightySixEvents)
    .where(and(eq(eightySixEvents.locationId, locationId), isNull(eightySixEvents.restoredAt)))
    .orderBy(desc(eightySixEvents.eightySixedAt));
  const openByItem = new Map<string, (typeof open)[number]>();
  for (const e of open) if (!openByItem.has(e.menuItemId)) openByItem.set(e.menuItemId, e);

  return rows.map((r) => {
    const event = openByItem.get(r.id);
    return {
      id: r.id,
      name: r.name,
      sectionName: r.sectionName,
      menuName: r.menuName,
      priceCents: r.priceCents,
      isEightySixed: r.isEightySixed,
      eightySixNote: r.eightySixNote,
      autoRestore: r.autoRestore,
      eightySixedAt: event?.eightySixedAt ?? null,
      eightySixedBy: event?.actorLabel ?? null,
    };
  });
}

/* ----------------------------------------------------------------- writing */

async function slugForMenu(menuId: string): Promise<{ slug: string; status: string } | null> {
  const db = getDb();
  const [row] = await db
    .select({ slug: locations.slug, status: menus.status })
    .from(menus)
    .innerJoin(locations, eq(locations.id, menus.locationId))
    .where(eq(menus.id, menuId));
  return row ?? null;
}

async function slugForSection(sectionId: string): Promise<{ slug: string; status: string } | null> {
  const db = getDb();
  const [row] = await db
    .select({ slug: locations.slug, status: menus.status })
    .from(menuSections)
    .innerJoin(menus, eq(menus.id, menuSections.menuId))
    .innerJoin(locations, eq(locations.id, menus.locationId))
    .where(eq(menuSections.id, sectionId));
  return row ?? null;
}

async function slugForItem(itemId: string): Promise<{ slug: string; status: string } | null> {
  const db = getDb();
  const [row] = await db
    .select({ slug: locations.slug, status: menus.status })
    .from(menuItems)
    .innerJoin(menuSections, eq(menuSections.id, menuItems.sectionId))
    .innerJoin(menus, eq(menus.id, menuSections.menuId))
    .innerJoin(locations, eq(locations.id, menus.locationId))
    .where(eq(menuItems.id, itemId));
  return row ?? null;
}

export interface CreateMenuInput {
  locationId: string;
  name: string;
  daypart?: Daypart | null;
}

export async function createMenu(input: CreateMenuInput, actor: Actor): Promise<Menu> {
  const db = getDb();
  const name = input.name.trim();
  if (!name) throw new Error("Give the menu a name");
  const daypart = validateDaypart(input.daypart ?? null);

  const [maxRow] = await db
    .select({ max: max(menus.position) })
    .from(menus)
    .where(eq(menus.locationId, input.locationId));

  const [menu] = await db
    .insert(menus)
    .values({
      locationId: input.locationId,
      name,
      daypart,
      position: nextPosition(maxRow?.max ?? null),
    })
    .returning();

  await log(input.locationId, null, null, actor, "menu.created", null, name);
  return menu;
}

export function validateDaypart(daypart: Daypart | null): Daypart | null {
  if (!daypart) return null;
  const start = parseClock(daypart.start ?? "");
  const end = parseClock(daypart.end ?? "");
  if (start === null || end === null) throw new Error("Daypart times must be HH:MM, 24-hour");
  if (start === end) throw new Error("A daypart cannot start and end at the same minute");
  const days = Array.isArray(daypart.days)
    ? daypart.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : [];
  return { start: daypart.start, end: daypart.end, ...(days.length ? { days } : {}) };
}

export async function createSection(
  menuId: string,
  name: string,
  actor: Actor,
  note?: string | null,
): Promise<MenuSection> {
  const db = getDb();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Give the section a name");

  const [menu] = await db.select().from(menus).where(eq(menus.id, menuId));
  if (!menu) throw new Error("That menu no longer exists");

  const [maxRow] = await db
    .select({ max: max(menuSections.position) })
    .from(menuSections)
    .where(eq(menuSections.menuId, menuId));

  const [section] = await db
    .insert(menuSections)
    .values({
      menuId,
      name: trimmed,
      note: note?.trim() || null,
      position: nextPosition(maxRow?.max ?? null),
    })
    .returning();

  await log(menu.locationId, null, null, actor, "section.created", null, trimmed);
  await revalidateIfLive(menu.locationId, menu.status);
  return section;
}

export interface CreateItemInput {
  sectionId: string;
  name: string;
  description?: string | null;
  priceCents: number;
  costCents?: number | null;
  dietaryTags?: string[];
}

export async function createItem(input: CreateItemInput, actor: Actor): Promise<MenuItem> {
  const db = getDb();
  const name = input.name.trim();
  if (!name) throw new Error("Give the dish a name");
  if (!Number.isInteger(input.priceCents) || input.priceCents < 0) {
    throw new Error("Enter a price");
  }

  const [section] = await db
    .select({ id: menuSections.id, menuId: menuSections.menuId, locationId: menus.locationId, status: menus.status })
    .from(menuSections)
    .innerJoin(menus, eq(menus.id, menuSections.menuId))
    .where(eq(menuSections.id, input.sectionId));
  if (!section) throw new Error("That section no longer exists");

  const [maxRow] = await db
    .select({ max: max(menuItems.position) })
    .from(menuItems)
    .where(eq(menuItems.sectionId, input.sectionId));

  const [item] = await db
    .insert(menuItems)
    .values({
      sectionId: input.sectionId,
      locationId: section.locationId,
      name,
      description: input.description?.trim() || null,
      priceCents: input.priceCents,
      costCents: input.costCents ?? null,
      dietaryTags: normaliseTags(input.dietaryTags),
      position: nextPosition(maxRow?.max ?? null),
    })
    .returning();

  await log(section.locationId, item.id, name, actor, "item.created", null, money(input.priceCents));
  await revalidateIfLive(section.locationId, section.status);
  return item;
}

export interface ItemPatch {
  name?: string;
  description?: string | null;
  priceCents?: number;
  costCents?: number | null;
  dietaryTags?: string[];
  autoRestore?: boolean;
}

/**
 * Update an item, writing one change-log row per field that actually moved.
 *
 * "Actually moved" is the important part: saving a form without changing
 * anything must not fill the owner's history with noise.
 */
export async function updateItem(
  itemId: string,
  patch: ItemPatch,
  actor: Actor,
): Promise<{ item: MenuItem; changes: number }> {
  const db = getDb();
  const [existing] = await db.select().from(menuItems).where(eq(menuItems.id, itemId));
  if (!existing) throw new Error("That dish no longer exists");

  const next: Record<string, unknown> = {};
  const diffs: { field: string; oldValue: string | null; newValue: string | null }[] = [];

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("Give the dish a name");
    if (name !== existing.name) {
      next.name = name;
      diffs.push({ field: "name", oldValue: existing.name, newValue: name });
    }
  }
  if (patch.description !== undefined) {
    const description = patch.description?.trim() || null;
    if (description !== existing.description) {
      next.description = description;
      diffs.push({ field: "description", oldValue: existing.description, newValue: description });
    }
  }
  if (patch.priceCents !== undefined) {
    if (!Number.isInteger(patch.priceCents) || patch.priceCents < 0) throw new Error("Enter a price");
    if (patch.priceCents !== existing.priceCents) {
      next.priceCents = patch.priceCents;
      diffs.push({
        field: "price",
        oldValue: money(existing.priceCents),
        newValue: money(patch.priceCents),
      });
    }
  }
  if (patch.costCents !== undefined) {
    const cost = patch.costCents === null ? null : Math.round(patch.costCents);
    if (cost !== null && (!Number.isInteger(cost) || cost < 0)) throw new Error("Enter a plate cost");
    if (cost !== existing.costCents) {
      next.costCents = cost;
      diffs.push({
        field: "plate cost",
        oldValue: existing.costCents === null ? null : money(existing.costCents),
        newValue: cost === null ? null : money(cost),
      });
    }
  }
  if (patch.dietaryTags !== undefined) {
    const tags = normaliseTags(patch.dietaryTags);
    const before = normaliseTags(existing.dietaryTags);
    if (tags.join(",") !== before.join(",")) {
      next.dietaryTags = tags;
      diffs.push({
        field: "dietary tags",
        oldValue: before.join(" ") || "none",
        newValue: tags.join(" ") || "none",
      });
    }
  }
  if (patch.autoRestore !== undefined && patch.autoRestore !== existing.autoRestore) {
    next.autoRestore = patch.autoRestore;
    diffs.push({
      field: "nightly auto-restore",
      oldValue: existing.autoRestore ? "on" : "off",
      newValue: patch.autoRestore ? "on" : "off",
    });
  }

  if (!diffs.length) return { item: existing, changes: 0 };

  next.updatedAt = new Date();
  const [item] = await db.update(menuItems).set(next).where(eq(menuItems.id, itemId)).returning();

  for (const diff of diffs) {
    await log(existing.locationId, itemId, item.name, actor, diff.field, diff.oldValue, diff.newValue);
  }

  const where = await slugForItem(itemId);
  if (where?.status === "live") revalidatePublicMenu(where.slug);
  return { item, changes: diffs.length };
}

export async function updateSection(
  sectionId: string,
  patch: { name?: string; note?: string | null },
  actor: Actor,
): Promise<MenuSection> {
  const db = getDb();
  const [existing] = await db.select().from(menuSections).where(eq(menuSections.id, sectionId));
  if (!existing) throw new Error("That section no longer exists");
  const where = await slugForSection(sectionId);
  const [menu] = await db.select().from(menus).where(eq(menus.id, existing.menuId));

  const next: Record<string, unknown> = {};
  if (patch.name !== undefined && patch.name.trim() && patch.name.trim() !== existing.name) {
    next.name = patch.name.trim();
    await log(menu.locationId, null, null, actor, "section name", existing.name, patch.name.trim());
  }
  if (patch.note !== undefined) {
    const note = patch.note?.trim() || null;
    if (note !== existing.note) {
      next.note = note;
      await log(menu.locationId, null, null, actor, "section note", existing.note, note);
    }
  }
  if (!Object.keys(next).length) return existing;

  const [section] = await db
    .update(menuSections)
    .set(next)
    .where(eq(menuSections.id, sectionId))
    .returning();
  if (where?.status === "live") revalidatePublicMenu(where.slug);
  return section;
}

export async function deleteItem(itemId: string, actor: Actor): Promise<void> {
  const db = getDb();
  const [existing] = await db.select().from(menuItems).where(eq(menuItems.id, itemId));
  if (!existing) return;
  const where = await slugForItem(itemId);
  await log(existing.locationId, null, existing.name, actor, "item.deleted", existing.name, null);
  await db.delete(menuItems).where(eq(menuItems.id, itemId));
  if (where?.status === "live") revalidatePublicMenu(where.slug);
}

export async function deleteSection(sectionId: string, actor: Actor): Promise<void> {
  const db = getDb();
  const [existing] = await db.select().from(menuSections).where(eq(menuSections.id, sectionId));
  if (!existing) return;
  const [menu] = await db.select().from(menus).where(eq(menus.id, existing.menuId));
  const where = await slugForSection(sectionId);
  await log(menu.locationId, null, null, actor, "section.deleted", existing.name, null);
  await db.delete(menuSections).where(eq(menuSections.id, sectionId));
  if (where?.status === "live") revalidatePublicMenu(where.slug);
}

/**
 * Reorder within a parent by rewriting positions in the given order.
 *
 * The whole list is rewritten rather than computing a midpoint: a menu section
 * holds tens of items, not thousands, and a full rewrite cannot drift into
 * colliding positions after a few hundred drags.
 */
export async function reorderItems(sectionId: string, orderedIds: string[], actor: Actor): Promise<void> {
  const db = getDb();
  const existing = await db.select().from(menuItems).where(eq(menuItems.sectionId, sectionId));
  const known = new Set(existing.map((i) => i.id));
  const ids = orderedIds.filter((id) => known.has(id));
  // Anything the client didn't mention keeps its relative order at the end.
  const rest = existing
    .filter((i) => !ids.includes(i.id))
    .sort((a, b) => a.position - b.position)
    .map((i) => i.id);
  const final = [...ids, ...rest];

  for (let i = 0; i < final.length; i++) {
    await db
      .update(menuItems)
      .set({ position: i * POSITION_STEP })
      .where(eq(menuItems.id, final[i]));
  }
  if (existing[0]) {
    await log(existing[0].locationId, null, null, actor, "section reordered", null, `${final.length} items`);
    const where = await slugForSection(sectionId);
    if (where?.status === "live") revalidatePublicMenu(where.slug);
  }
}

export async function reorderSections(menuId: string, orderedIds: string[], actor: Actor): Promise<void> {
  const db = getDb();
  const existing = await db.select().from(menuSections).where(eq(menuSections.menuId, menuId));
  const known = new Set(existing.map((s) => s.id));
  const ids = orderedIds.filter((id) => known.has(id));
  const rest = existing
    .filter((s) => !ids.includes(s.id))
    .sort((a, b) => a.position - b.position)
    .map((s) => s.id);
  const final = [...ids, ...rest];
  for (let i = 0; i < final.length; i++) {
    await db
      .update(menuSections)
      .set({ position: i * POSITION_STEP })
      .where(eq(menuSections.id, final[i]));
  }
  const where = await slugForMenu(menuId);
  const [menu] = await db.select().from(menus).where(eq(menus.id, menuId));
  if (menu) await log(menu.locationId, null, null, actor, "menu reordered", null, `${final.length} sections`);
  if (where?.status === "live") revalidatePublicMenu(where.slug);
}

export interface PublishResult {
  menuId: string;
  publishedAt: Date;
  revalidatedPaths: string[];
  itemCount: number;
}

/**
 * Publish: stamp `published_at`, flip to live, purge the guest page.
 *
 * A menu with no items is refused — an empty QR page is worse than a laminated
 * one, and this is the last moment we can say so.
 */
export async function publishMenu(menuId: string, actor: Actor): Promise<PublishResult> {
  const db = getDb();
  const [menu] = await db.select().from(menus).where(eq(menus.id, menuId));
  if (!menu) throw new Error("That menu no longer exists");

  const [counts] = await db
    .select({ items: sql<number>`count(${menuItems.id})` })
    .from(menuSections)
    .leftJoin(menuItems, eq(menuItems.sectionId, menuSections.id))
    .where(eq(menuSections.menuId, menuId));
  const itemCount = Number(counts?.items ?? 0);
  if (itemCount === 0) {
    throw new Error("Add at least one dish before publishing — an empty menu is worse than none.");
  }

  const publishedAt = new Date();
  await db
    .update(menus)
    .set({ status: "live", publishedAt, updatedAt: publishedAt })
    .where(eq(menus.id, menuId));

  const [location] = await db.select().from(locations).where(eq(locations.id, menu.locationId));
  await log(menu.locationId, null, null, actor, "menu.published", menu.status, "live");
  if (location) revalidatePublicMenu(location.slug);

  return {
    menuId,
    publishedAt,
    revalidatedPaths: location ? [`/m/${location.slug}`] : [],
    itemCount,
  };
}

export async function unpublishMenu(menuId: string, actor: Actor): Promise<void> {
  const db = getDb();
  const [menu] = await db.select().from(menus).where(eq(menus.id, menuId));
  if (!menu) return;
  await db.update(menus).set({ status: "draft", updatedAt: new Date() }).where(eq(menus.id, menuId));
  const [location] = await db.select().from(locations).where(eq(locations.id, menu.locationId));
  await log(menu.locationId, null, null, actor, "menu.unpublished", "live", "draft");
  if (location) revalidatePublicMenu(location.slug);
}

export async function updateMenu(
  menuId: string,
  patch: { name?: string; daypart?: Daypart | null },
  actor: Actor,
): Promise<Menu> {
  const db = getDb();
  const [existing] = await db.select().from(menus).where(eq(menus.id, menuId));
  if (!existing) throw new Error("That menu no longer exists");
  const next: Record<string, unknown> = {};
  if (patch.name !== undefined && patch.name.trim() && patch.name.trim() !== existing.name) {
    next.name = patch.name.trim();
    await log(existing.locationId, null, null, actor, "menu name", existing.name, patch.name.trim());
  }
  if (patch.daypart !== undefined) {
    const daypart = validateDaypart(patch.daypart);
    const before = existing.daypart ? `${existing.daypart.start}-${existing.daypart.end}` : "always";
    const after = daypart ? `${daypart.start}-${daypart.end}` : "always";
    if (before !== after) {
      next.daypart = daypart;
      await log(existing.locationId, null, null, actor, "daypart", before, after);
    }
  }
  if (!Object.keys(next).length) return existing;
  next.updatedAt = new Date();
  const [menu] = await db.update(menus).set(next).where(eq(menus.id, menuId)).returning();
  const where = await slugForMenu(menuId);
  if (where?.status === "live") revalidatePublicMenu(where.slug);
  return menu;
}

/* --------------------------------------------------------------- history */

export async function loadChangeHistory(locationId: string, limit = 100) {
  const db = getDb();
  return db
    .select()
    .from(menuChangeLog)
    .where(eq(menuChangeLog.locationId, locationId))
    .orderBy(desc(menuChangeLog.changedAt))
    .limit(limit);
}

/** Items missing a plate cost — the "add plate costs" prompt on the matrix. */
export async function itemsMissingCost(locationId: string) {
  const db = getDb();
  return db
    .select({
      id: menuItems.id,
      name: menuItems.name,
      priceCents: menuItems.priceCents,
      sectionName: menuSections.name,
    })
    .from(menuItems)
    .innerJoin(menuSections, eq(menuSections.id, menuItems.sectionId))
    .where(and(eq(menuItems.locationId, locationId), isNull(menuItems.costCents)))
    .orderBy(asc(menuSections.position), asc(menuItems.position));
}

/** Change-log writer. Every mutation above funnels through this. */
export async function log(
  locationId: string,
  menuItemId: string | null,
  itemName: string | null,
  actor: Actor,
  field: string,
  oldValue: string | null,
  newValue: string | null,
): Promise<void> {
  const db = getDb();
  await db.insert(menuChangeLog).values({
    id: randomUUID(),
    locationId,
    menuItemId,
    itemName,
    actorUserId: actor.userId,
    actorLabel: actor.label,
    field,
    oldValue,
    newValue,
  });
}

async function revalidateIfLive(locationId: string, status: string): Promise<void> {
  if (status !== "live") return;
  const db = getDb();
  const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
  if (location) revalidatePublicMenu(location.slug);
}

/** Price for an input field, so the editor round-trips cents without drift. */
export const priceInputValue = centsToInput;
