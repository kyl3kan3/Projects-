/**
 * The guest menu's read path — the only query in this product that runs at
 * dining-room scale, and the reason the speed claim is honest.
 *
 * Shape (ARCHITECTURE.md flow 1 and 2):
 *
 *   QR scan -> CDN / ISR HTML (revalidate 60)
 *           -> this loader, wrapped in Next's data cache, tagged per slug
 *           -> Postgres, three indexed queries
 *
 * A warm request never reaches here at all. What makes an 86 land "within
 * seconds" is not the 60-second window — it is {@link revalidatePublicMenu},
 * called by every write that changes what a guest sees. It purges the tag *and*
 * the route, so the next scan regenerates immediately.
 *
 * Two rules this file exists to enforce:
 *
 *  1. **The cached payload is time-independent.** Which daypart is live depends
 *     on the clock, so that decision happens *outside* the cache, at render.
 *     Caching "the 7pm answer" and serving it at 11pm was the obvious bug here.
 *  2. **Everything returned is JSON-ready** — strings and numbers, no `Date`
 *     objects. It is what the data cache stores.
 */

import { unstable_cache, revalidatePath, revalidateTag } from "next/cache";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  itemPhotos,
  locations,
  menuItems,
  menuSections,
  menus,
  type Daypart,
} from "@/db/schema";
import { daypartLabel, isDaypartActive, resolveActiveMenu } from "@/lib/dayparts";
import { photoUrl } from "@/lib/storage";

/** Cache tag for everything a location's guest menu reads. */
export function menuTag(slug: string): string {
  return `public-menu:${slug}`;
}

/**
 * Called by every write a guest can see: an 86, a restore, a publish, a photo
 * approval, a price edit on a live menu.
 *
 * Deliberately *not* rate-limited. DESIGN.md suggests coalescing to one call per
 * location per 2s, which would mean a trailing timer — and on a serverless host a
 * trailing timer is a promise the process may not live long enough to keep. A
 * guest reading a dish the kitchen just ran out of is the exact failure this
 * product exists to prevent, so every flip purges immediately and the ISR
 * endpoint takes the load.
 */
export function revalidatePublicMenu(slug: string): void {
  revalidateTag(menuTag(slug));
  revalidatePath(`/m/${slug}`);
  revalidatePath(`/m/${slug}/[menuKey]`, "page");
}

export interface PublicItem {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  dietaryTags: string[];
  isEightySixed: boolean;
  eightySixNote: string | null;
  photoUrl: string | null;
}

export interface PublicSection {
  id: string;
  name: string;
  note: string | null;
  items: PublicItem[];
}

export interface PublicMenu {
  id: string;
  name: string;
  /** URL segment for this menu: /m/<slug>/<key>. */
  key: string;
  daypart: Daypart | null;
  daypartLabel: string | null;
  sections: PublicSection[];
}

export interface PublicMenuPayload {
  location: {
    id: string;
    name: string;
    slug: string;
    address: string | null;
    timezone: string;
    currency: string;
  };
  menus: PublicMenu[];
  generatedAt: string;
}

/** `"Happy Hour"` -> `"happy-hour"`. Deterministic, so links stay stable. */
export function menuKeyFor(name: string, index: number, taken: Set<string>): string {
  const root =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "menu";
  if (!taken.has(root)) {
    taken.add(root);
    return root;
  }
  const suffixed = `${root}-${index + 1}`;
  taken.add(suffixed);
  return suffixed;
}

async function buildPayload(slug: string): Promise<PublicMenuPayload | null> {
  const db = getDb();
  const [location] = await db
    .select()
    .from(locations)
    .where(and(eq(locations.slug, slug), eq(locations.active, true)));
  if (!location) return null;

  const liveMenus = await db
    .select()
    .from(menus)
    .where(and(eq(menus.locationId, location.id), eq(menus.status, "live")))
    .orderBy(asc(menus.position), asc(menus.createdAt));
  if (!liveMenus.length) {
    return {
      location: {
        id: location.id,
        name: location.name,
        slug: location.slug,
        address: location.address,
        timezone: location.timezone,
        currency: "USD",
      },
      menus: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const menuIds = liveMenus.map((m) => m.id);
  const sections = await db
    .select()
    .from(menuSections)
    .where(inArray(menuSections.menuId, menuIds))
    .orderBy(asc(menuSections.position), asc(menuSections.createdAt));

  const sectionIds = sections.map((s) => s.id);
  const items = sectionIds.length
    ? await db
        .select()
        .from(menuItems)
        .where(inArray(menuItems.sectionId, sectionIds))
        .orderBy(asc(menuItems.position), asc(menuItems.createdAt))
    : [];

  // Only *approved* photos reach a guest. That is the whole point of the review
  // step, so the filter lives in the read path and not in a caller's `if`.
  const photoIds = items.map((i) => i.photoId).filter((id): id is string => !!id);
  const photos = photoIds.length
    ? await db
        .select()
        .from(itemPhotos)
        .where(and(inArray(itemPhotos.id, photoIds), eq(itemPhotos.status, "approved")))
    : [];
  const photoByItem = new Map<string, string>();
  for (const p of photos) {
    const key = p.enhancedKey ?? p.originalKey;
    photoByItem.set(p.menuItemId, photoUrl(key));
  }

  const itemsBySection = new Map<string, PublicItem[]>();
  for (const item of items) {
    const bucket = itemsBySection.get(item.sectionId) ?? [];
    bucket.push({
      id: item.id,
      name: item.name,
      description: item.description,
      priceCents: item.priceCents,
      dietaryTags: item.dietaryTags ?? [],
      isEightySixed: item.isEightySixed,
      eightySixNote: item.eightySixNote,
      photoUrl: photoByItem.get(item.id) ?? null,
    });
    itemsBySection.set(item.sectionId, bucket);
  }

  const sectionsByMenu = new Map<string, PublicSection[]>();
  for (const s of sections) {
    const bucket = sectionsByMenu.get(s.menuId) ?? [];
    bucket.push({ id: s.id, name: s.name, note: s.note, items: itemsBySection.get(s.id) ?? [] });
    sectionsByMenu.set(s.menuId, bucket);
  }

  const taken = new Set<string>();
  return {
    location: {
      id: location.id,
      name: location.name,
      slug: location.slug,
      address: location.address,
      timezone: location.timezone,
      currency: "USD",
    },
    menus: liveMenus.map((m, i) => ({
      id: m.id,
      name: m.name,
      key: menuKeyFor(m.name, i, taken),
      daypart: m.daypart ?? null,
      daypartLabel: daypartLabel(m.daypart ?? null),
      sections: sectionsByMenu.get(m.id) ?? [],
    })),
    generatedAt: new Date().toISOString(),
  };
}

/** The cached entry point. Tagged so an 86 can purge it. */
export async function loadPublicMenu(slug: string): Promise<PublicMenuPayload | null> {
  const cached = unstable_cache(async () => buildPayload(slug), ["public-menu", slug], {
    revalidate: 60,
    tags: [menuTag(slug)],
  });
  return cached();
}

/** Uncached — the owner's live preview must be instantly truthful. */
export async function loadPublicMenuFresh(slug: string): Promise<PublicMenuPayload | null> {
  return buildPayload(slug);
}

export interface ResolvedMenuView {
  payload: PublicMenuPayload;
  active: PublicMenu | null;
  /** True when `active` was chosen because nothing was open, not because it is. */
  outsideServiceHours: boolean;
  eightySixedCount: number;
}

/**
 * Decide which menu the guest sees. Runs at render time, never inside the cache.
 *
 * `requestedKey` comes from the URL when a guest taps a daypart chip; an unknown
 * key falls back to the clock rather than 404ing, because that URL is printed on
 * a table tent somewhere.
 */
export function resolveMenuView(
  payload: PublicMenuPayload,
  now: Date,
  requestedKey?: string,
): ResolvedMenuView {
  const tz = payload.location.timezone;
  const requested = requestedKey ? payload.menus.find((m) => m.key === requestedKey) : undefined;

  const auto = resolveActiveMenu(
    payload.menus.map((m, i) => ({ id: m.id, name: m.name, daypart: m.daypart, position: i })),
    now,
    tz,
  );
  const active = requested ?? payload.menus.find((m) => m.id === auto?.id) ?? payload.menus[0] ?? null;

  const outsideServiceHours = active ? !isDaypartActive(active.daypart, now, tz) : false;
  const eightySixedCount = active
    ? active.sections.reduce((n, s) => n + s.items.filter((i) => i.isEightySixed).length, 0)
    : 0;

  return { payload, active, outsideServiceHours, eightySixedCount };
}
