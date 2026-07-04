/**
 * src/lib/menus.ts
 *
 * Menu domain logic: sections, items, dayparts, draft/publish lifecycle,
 * and the change log. Publishing is the only path that touches the guest
 * page -- it snapshots the render payload and triggers ISR revalidation.
 *
 * TODO:
 * - [ ] CRUD for menus/sections/items with position management (drag-reorder
 *       writes sparse positions, compacted lazily).
 * - [ ] Every field change writes a menu_change_log row (actor, field,
 *       old/new value) -- change history is a side effect, never optional.
 * - [ ] publishMenu(menuId): stamp published_at, snapshot payload,
 *       revalidatePath(`/m/[slug]`).
 * - [ ] Daypart resolution: given a location's local time, which menus are
 *       active now (price_windows / daypart jsonb).
 * - [ ] Dietary tag validation (GF|V|VG|DF only -- typeset labels, not icons).
 * - [ ] Zod schemas for editor payloads.
 */

export type MenuLifecycle = "draft" | "live";

export interface PublishResult {
  menuId: string;
  publishedAt: Date;
  revalidatedPaths: string[];
}

export function publishMenu(_menuId: string): Promise<PublishResult> {
  throw new Error("Not implemented");
}

export function activeMenusForLocation(
  _locationId: string,
  _localNow: Date,
): Promise<string[]> {
  throw new Error("Not implemented");
}
