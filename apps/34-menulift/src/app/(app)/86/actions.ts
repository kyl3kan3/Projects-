"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { locations, menuItems } from "@/db/schema";
import { boardActorFor } from "@/lib/auth";
import { openCount, toggleEightySix, tonightCount } from "@/lib/eighty-six";

/**
 * Refresh every dashboard surface that shows 86 state.
 *
 * `/board/[slug]` matters as much as `/86`: the expo board renders the actor and
 * the time from server data ("Crispy Half Chicken · 86'd 7:42pm by Dana"), and
 * without this the phone at the pass keeps its optimistic row forever and never
 * learns who did it. Found by driving the PIN board in a browser — the owner's
 * board looked fine, which is exactly why it was easy to miss.
 */
async function refreshBoards(locationId: string): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ slug: locations.slug })
    .from(locations)
    .where(eq(locations.id, locationId));
  revalidatePath("/86");
  revalidatePath("/menu");
  if (row) revalidatePath(`/board/${row.slug}`);
}

export interface ToggleResult {
  ok: boolean;
  error: string | null;
  itemId: string;
  nowEightySixed: boolean;
  openCount: number;
  tonightCount: number;
}

/**
 * The one tap.
 *
 * Authorisation is the interesting part: the actor may be a signed-in owner *or*
 * a PIN session, and either way it must be scoped to the location that owns the
 * item. `boardActorFor` resolves both and returns null when neither applies, so
 * an item id posted from nowhere gets nothing.
 *
 * Returns the new counts so the client can settle its optimistic state against
 * the truth instead of guessing.
 */
export async function toggleEightySixAction(
  itemId: string,
  note?: string | null,
): Promise<ToggleResult> {
  const db = getDb();
  const [item] = await db
    .select({ id: menuItems.id, locationId: menuItems.locationId })
    .from(menuItems)
    .where(eq(menuItems.id, itemId));

  const empty = { itemId, nowEightySixed: false, openCount: 0, tonightCount: 0 };
  if (!item) return { ok: false, error: "That dish no longer exists", ...empty };

  const actor = await boardActorFor(item.locationId);
  if (!actor) {
    return { ok: false, error: "This board session has expired — sign in or re-enter the PIN.", ...empty };
  }

  try {
    const { result, nowEightySixed } = await toggleEightySix(itemId, actor, note);
    await refreshBoards(item.locationId);
    return {
      ok: true,
      error: null,
      itemId,
      nowEightySixed,
      openCount: result.openCount,
      tonightCount: await tonightCount(item.locationId),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not change that dish",
      ...empty,
      openCount: await openCount(item.locationId),
    };
  }
}

/** Turn nightly auto-restore on or off for one dish, from the board. */
export async function setAutoRestoreAction(itemId: string, autoRestore: boolean): Promise<void> {
  const db = getDb();
  const [item] = await db
    .select({ id: menuItems.id, locationId: menuItems.locationId })
    .from(menuItems)
    .where(eq(menuItems.id, itemId));
  if (!item) return;
  const actor = await boardActorFor(item.locationId);
  if (!actor) return;
  await db
    .update(menuItems)
    .set({ autoRestore, updatedAt: new Date() })
    .where(and(eq(menuItems.id, itemId), eq(menuItems.locationId, item.locationId)));
  await refreshBoards(item.locationId);
}
