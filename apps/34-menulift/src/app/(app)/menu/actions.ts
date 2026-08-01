"use server";

import { revalidatePath } from "next/cache";
import { requireUser, type Actor } from "@/lib/auth";
import { parseMoneyToCents } from "@/lib/format";
import {
  createItem,
  createMenu,
  createSection,
  deleteItem,
  deleteSection,
  publishMenu,
  reorderItems,
  reorderSections,
  unpublishMenu,
  updateItem,
  updateMenu,
} from "@/lib/menus";
import { recomputeImportsForItem } from "@/lib/import-run";
import { getDb } from "@/db";
import type { FormState } from "./state";
import { and, eq } from "drizzle-orm";
import { menuItems, menuSections, menus } from "@/db/schema";

/**
 * Every exported function in this file is a public endpoint, so every one of them
 * starts by resolving the session and then *proves the target belongs to it*.
 * A uuid in a form field is not authorisation.
 */
async function actorAndLocation(): Promise<{ actor: Actor; locationId: string }> {
  const ctx = await requireUser();
  return {
    actor: { userId: ctx.user.id, label: ctx.user.name || ctx.user.email.split("@")[0] },
    locationId: ctx.location.id,
  };
}

async function assertMenu(menuId: string, locationId: string): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ id: menus.id })
    .from(menus)
    .where(and(eq(menus.id, menuId), eq(menus.locationId, locationId)));
  if (!row) throw new Error("That menu is not at this location");
}

async function assertSection(sectionId: string, locationId: string): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ id: menuSections.id })
    .from(menuSections)
    .innerJoin(menus, eq(menus.id, menuSections.menuId))
    .where(and(eq(menuSections.id, sectionId), eq(menus.locationId, locationId)));
  if (!row) throw new Error("That section is not at this location");
}

async function assertItem(itemId: string, locationId: string): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(and(eq(menuItems.id, itemId), eq(menuItems.locationId, locationId)));
  if (!row) throw new Error("That dish is not at this location");
}

function fail(err: unknown): FormState {
  return { error: err instanceof Error ? err.message : "Something went wrong", ok: null };
}

export async function createMenuAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { actor, locationId } = await actorAndLocation();
    const start = String(formData.get("start") ?? "").trim();
    const end = String(formData.get("end") ?? "").trim();
    await createMenu(
      {
        locationId,
        name: String(formData.get("name") ?? ""),
        daypart: start && end ? { start, end } : null,
      },
      actor,
    );
    revalidatePath("/menu");
    return { error: null, ok: "Menu added" };
  } catch (err) {
    return fail(err);
  }
}

export async function updateMenuAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { actor, locationId } = await actorAndLocation();
    const menuId = String(formData.get("menuId") ?? "");
    await assertMenu(menuId, locationId);
    const start = String(formData.get("start") ?? "").trim();
    const end = String(formData.get("end") ?? "").trim();
    const days = formData
      .getAll("days")
      .map((d) => Number(d))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    await updateMenu(
      menuId,
      {
        name: String(formData.get("name") ?? ""),
        daypart: start && end ? { start, end, ...(days.length ? { days } : {}) } : null,
      },
      actor,
    );
    revalidatePath("/menu");
    return { error: null, ok: "Saved" };
  } catch (err) {
    return fail(err);
  }
}

export async function createSectionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { actor, locationId } = await actorAndLocation();
    const menuId = String(formData.get("menuId") ?? "");
    await assertMenu(menuId, locationId);
    await createSection(
      menuId,
      String(formData.get("name") ?? ""),
      actor,
      String(formData.get("note") ?? ""),
    );
    revalidatePath("/menu");
    return { error: null, ok: "Section added" };
  } catch (err) {
    return fail(err);
  }
}

export async function createItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { actor, locationId } = await actorAndLocation();
    const sectionId = String(formData.get("sectionId") ?? "");
    await assertSection(sectionId, locationId);

    const priceCents = parseMoneyToCents(String(formData.get("price") ?? ""));
    if (priceCents === null) return { error: "Enter a price, like 24 or 24.00", ok: null };
    const costRaw = String(formData.get("cost") ?? "").trim();
    const costCents = costRaw ? parseMoneyToCents(costRaw) : null;
    if (costRaw && costCents === null) {
      return { error: "That plate cost isn't a number", ok: null };
    }

    await createItem(
      {
        sectionId,
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
        priceCents,
        costCents,
        dietaryTags: formData.getAll("tags").map(String),
      },
      actor,
    );
    revalidatePath("/menu");
    return { error: null, ok: "Dish added" };
  } catch (err) {
    return fail(err);
  }
}

export async function updateItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { actor, locationId } = await actorAndLocation();
    const itemId = String(formData.get("itemId") ?? "");
    await assertItem(itemId, locationId);

    const priceCents = parseMoneyToCents(String(formData.get("price") ?? ""));
    if (priceCents === null) return { error: "Enter a price, like 24 or 24.00", ok: null };

    const costRaw = String(formData.get("cost") ?? "").trim();
    const costCents = costRaw ? parseMoneyToCents(costRaw) : null;
    if (costRaw && costCents === null) {
      return { error: "That plate cost isn't a number", ok: null };
    }

    const { changes } = await updateItem(
      itemId,
      {
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
        priceCents,
        costCents,
        dietaryTags: formData.getAll("tags").map(String),
        autoRestore: formData.get("autoRestore") === "on",
      },
      actor,
    );

    // Entering a plate cost is the whole reason a matrix was withheld; rebuild it
    // rather than making the owner re-upload the CSV.
    if (changes > 0) await recomputeImportsForItem(itemId);

    revalidatePath("/menu");
    revalidatePath("/matrix");
    revalidatePath("/history");
    return { error: null, ok: changes === 0 ? "No changes" : `Saved ${changes} change${changes === 1 ? "" : "s"}` };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { actor, locationId } = await actorAndLocation();
    const itemId = String(formData.get("itemId") ?? "");
    await assertItem(itemId, locationId);
    await deleteItem(itemId, actor);
    revalidatePath("/menu");
    return { error: null, ok: "Dish removed" };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteSectionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { actor, locationId } = await actorAndLocation();
    const sectionId = String(formData.get("sectionId") ?? "");
    await assertSection(sectionId, locationId);
    await deleteSection(sectionId, actor);
    revalidatePath("/menu");
    return { error: null, ok: "Section removed" };
  } catch (err) {
    return fail(err);
  }
}

export async function publishMenuAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { actor, locationId } = await actorAndLocation();
    const menuId = String(formData.get("menuId") ?? "");
    await assertMenu(menuId, locationId);
    const result = await publishMenu(menuId, actor);
    revalidatePath("/menu");
    return { error: null, ok: `Live — ${result.itemCount} dishes` };
  } catch (err) {
    return fail(err);
  }
}

export async function unpublishMenuAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { actor, locationId } = await actorAndLocation();
    const menuId = String(formData.get("menuId") ?? "");
    await assertMenu(menuId, locationId);
    await unpublishMenu(menuId, actor);
    revalidatePath("/menu");
    return { error: null, ok: "Back to draft" };
  } catch (err) {
    return fail(err);
  }
}

/** Commit a new order for a section's items (drag release, or an arrow tap). */
export async function reorderItemsAction(sectionId: string, orderedIds: string[]): Promise<void> {
  const { actor, locationId } = await actorAndLocation();
  await assertSection(sectionId, locationId);
  await reorderItems(sectionId, orderedIds, actor);
  revalidatePath("/menu");
}

export async function reorderSectionsAction(menuId: string, orderedIds: string[]): Promise<void> {
  const { actor, locationId } = await actorAndLocation();
  await assertMenu(menuId, locationId);
  await reorderSections(menuId, orderedIds, actor);
  revalidatePath("/menu");
}
