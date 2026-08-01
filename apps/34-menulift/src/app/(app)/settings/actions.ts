"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { locations } from "@/db/schema";
import { clearSession, requireUser, setStaffPin } from "@/lib/auth";
import { revalidatePublicMenu } from "@/lib/menu-data";
import { log } from "@/lib/menus";
import { isValidTimeZone } from "@/lib/time";
import { syncQuantity } from "@/lib/billing";
import { redirect } from "next/navigation";
import type { SettingsState } from "./state";

export async function saveLocationAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  try {
    const ctx = await requireUser();
    const db = getDb();
    const name = String(formData.get("name") ?? "").trim();
    if (name.length < 2) return { error: "The restaurant needs a name", ok: null };
    const address = String(formData.get("address") ?? "").trim() || null;
    const timezone = String(formData.get("timezone") ?? "").trim();
    if (timezone && !isValidTimeZone(timezone)) {
      return { error: `"${timezone}" is not a timezone this server knows`, ok: null };
    }
    const rolloverRaw = Number(formData.get("rollover") ?? 4);
    const rollover = Number.isInteger(rolloverRaw) && rolloverRaw >= 0 && rolloverRaw <= 23 ? rolloverRaw : 4;

    await db
      .update(locations)
      .set({
        name,
        address,
        timezone: timezone || ctx.location.timezone,
        serviceRolloverHour: rollover,
      })
      .where(eq(locations.id, ctx.location.id));

    const actor = { userId: ctx.user.id, label: ctx.user.name || ctx.user.email.split("@")[0] };
    if (name !== ctx.location.name) {
      await log(ctx.location.id, null, null, actor, "location name", ctx.location.name, name);
    }
    if (timezone && timezone !== ctx.location.timezone) {
      await log(ctx.location.id, null, null, actor, "timezone", ctx.location.timezone, timezone);
    }

    revalidatePublicMenu(ctx.location.slug);
    revalidatePath("/settings");
    return { error: null, ok: "Saved" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save", ok: null };
  }
}

export async function setPinAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  try {
    const ctx = await requireUser();
    const pin = String(formData.get("pin") ?? "").trim();
    const clear = formData.get("clear") === "1";
    await setStaffPin(ctx.location.id, clear ? null : pin);
    revalidatePath("/settings");
    revalidatePath("/86");
    return {
      error: null,
      ok: clear ? "PIN removed — the station board is closed" : "PIN set",
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not set the PIN", ok: null };
  }
}

export async function addLocationAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  try {
    const ctx = await requireUser();
    const db = getDb();
    const name = String(formData.get("name") ?? "").trim();
    if (name.length < 2) return { error: "Give the location a name", ok: null };
    const { uniqueLocationSlug } = await import("@/lib/auth");
    await db.insert(locations).values({
      organizationId: ctx.organization.id,
      name,
      slug: await uniqueLocationSlug(name),
      timezone: ctx.location.timezone,
    });
    // A new location is a new billable unit; push the quantity before anyone asks.
    await syncQuantity(ctx.organization.id);
    revalidatePath("/settings");
    revalidatePath("/settings/billing");
    return { error: null, ok: `${name} added — it bills at 20% off from the second location on` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add that location", ok: null };
  }
}

export async function signOutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
