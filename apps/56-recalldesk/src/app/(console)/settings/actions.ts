"use server";

/**
 * Practice and location settings, plus adding a location and inviting staff.
 *
 * The two numbers that matter most live here: the estimated visit value (which is
 * what every recovered dollar is worth) and the attribution window. Changing
 * either is audit-logged, and neither restates history — attribution rows keep the
 * value and window they were written with.
 */

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { locations, practices, users } from "@/db/schema";
import { assertLocation, hashPassword, requireRole, type Role } from "@/lib/auth";
import { visitValueCentsFor, windowDaysFor } from "@/lib/attribution";
import { locationAllowed } from "@/lib/plans";
import { DEFAULT_BOOKING_NOTICE } from "@/lib/presets";
import { audit } from "@/server/audit";
import { seedPracticeContent } from "@/lib/auth";

export interface SettingsState {
  error: string | null;
  saved?: boolean;
}

export async function updatePracticeAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  // Every role check here sits inside a try. A server action is a public
  // endpoint: the forms disable what a role cannot change, but the POST is still
  // reachable and a denial must be a readable sentence, not a server crash.
  let ctx: Awaited<ReturnType<typeof requireRole>>;
  try {
    ctx = await requireRole("office_manager");
  } catch (error) {
    return { error: error instanceof Error ? error.message : "You cannot do that." };
  }
  const dollars = Number(formData.get("visitValueDollars") ?? 0);
  const windowDays = Number(formData.get("attributionWindowDays") ?? 30);

  if (!Number.isFinite(dollars) || dollars < 1 || dollars > 5000) {
    return { error: "An estimated visit value between $1 and $5,000, please." };
  }
  if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 180) {
    return { error: "The attribution window is between 1 and 180 days." };
  }

  // Money is integer cents, rounded once, here at the edge.
  const visitValueCents = Math.round(dollars * 100);

  try {
    await getDb()
      .update(practices)
      .set({
        name: String(formData.get("practiceName") ?? ctx.practice.name).trim() || ctx.practice.name,
        settings: { ...ctx.practice.settings, visitValueCents, attributionWindowDays: windowDays },
        updatedAt: new Date(),
      })
      .where(eq(practices.id, ctx.practice.id));

    await audit({
      practiceId: ctx.practice.id,
      actorId: ctx.user.id,
      action: "settings.updated",
      target: `practice:${ctx.practice.id}`,
      metadata: {
        visitValueCentsFrom: visitValueCentsFor(ctx.practice.settings),
        visitValueCentsTo: visitValueCents,
        windowFrom: windowDaysFor(ctx.practice.settings),
        windowTo: windowDays,
      },
    });
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    return { error: null, saved: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save those settings." };
  }
}

export async function updateLocationAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  let ctx: Awaited<ReturnType<typeof requireRole>>;
  try {
    ctx = await requireRole("office_manager");
  } catch (error) {
    return { error: error instanceof Error ? error.message : "You cannot do that." };
  }
  const locationId = String(formData.get("locationId") ?? "");
  const quietStart = Number(formData.get("quietStartHour") ?? 9);
  const quietEnd = Number(formData.get("quietEndHour") ?? 19);
  const cap = Number(formData.get("hourlySendCap") ?? 120);

  if (!Number.isInteger(quietStart) || !Number.isInteger(quietEnd) || quietStart < 0 || quietEnd > 23) {
    return { error: "Quiet hours are whole hours between 0 and 23." };
  }
  if (quietEnd <= quietStart) {
    return { error: "Sending has to end after it starts — a window across midnight is not allowed." };
  }
  if (!Number.isInteger(cap) || cap < 1 || cap > 2000) {
    return { error: "An hourly send cap between 1 and 2,000." };
  }

  try {
    assertLocation(ctx, locationId);
    await getDb()
      .update(locations)
      .set({
        name: String(formData.get("name") ?? "").trim() || ctx.location.name,
        phone: String(formData.get("phone") ?? "").trim() || null,
        bookingNotice: String(formData.get("bookingNotice") ?? "").trim() || DEFAULT_BOOKING_NOTICE,
        quietStartHour: quietStart,
        quietEndHour: quietEnd,
        hourlySendCap: cap,
        updatedAt: new Date(),
      })
      .where(eq(locations.id, locationId));

    await audit({
      practiceId: ctx.practice.id,
      actorId: ctx.user.id,
      action: "settings.updated",
      target: `location:${locationId}`,
      metadata: { quietStart, quietEnd, hourlySendCap: cap },
    });
    revalidatePath("/settings");
    return { error: null, saved: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save that location." };
  }
}

export async function addLocationAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  let ctx: Awaited<ReturnType<typeof requireRole>>;
  try {
    ctx = await requireRole("owner");
  } catch (error) {
    return { error: error instanceof Error ? error.message : "You cannot do that." };
  }
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "America/Chicago");
  if (!name) return { error: "Give the location a name." };

  const gate = locationAllowed(ctx.practice.plan, ctx.locations.length);
  if (!gate.ok) return { error: gate.reason };

  try {
    const [created] = await getDb()
      .insert(locations)
      .values({ practiceId: ctx.practice.id, name, timezone, bookingNotice: DEFAULT_BOOKING_NOTICE })
      .returning();
    await seedPracticeContent(ctx.practice.id, created.id);
    await audit({
      practiceId: ctx.practice.id,
      actorId: ctx.user.id,
      action: "location.created",
      target: `location:${created.id}`,
      metadata: { timezone },
    });
    revalidatePath("/settings");
    return { error: null, saved: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not add that location." };
  }
}

/** Switch which location the operational screens are scoped to. */
export async function switchLocationAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const locationId = String(formData.get("locationId") ?? "");
  try {
    const ctx = await requireRole("front_desk");
    assertLocation(ctx, locationId);
    await getDb()
      .update(users)
      .set({ defaultLocationId: locationId, updatedAt: new Date() })
      .where(eq(users.id, ctx.user.id));
    revalidatePath("/", "layout");
    return { error: null, saved: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not switch location." };
  }
}

const ROLES: Role[] = ["owner", "office_manager", "front_desk"];

export async function inviteUserAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  let ctx: Awaited<ReturnType<typeof requireRole>>;
  try {
    ctx = await requireRole("owner");
  } catch (error) {
    return { error: error instanceof Error ? error.message : "You cannot do that." };
  }
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const rawRole = String(formData.get("role") ?? "front_desk");
  const role = ROLES.includes(rawRole as Role) ? (rawRole as Role) : "front_desk";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  if (!name) return { error: "Enter their name." };
  if (password.length < 8) return { error: "Set a starting password of at least 8 characters." };

  try {
    const db = getDb();
    const [existing] = await db.select().from(users).where(eq(users.email, email));
    if (existing) return { error: "Someone already has an account with that email." };

    const [created] = await db
      .insert(users)
      .values({
        practiceId: ctx.practice.id,
        email,
        name,
        role,
        passwordHash: await hashPassword(password),
        defaultLocationId: ctx.location.id,
      })
      .returning();

    await audit({
      practiceId: ctx.practice.id,
      actorId: ctx.user.id,
      action: "user.invited",
      target: `user:${created.id}`,
      metadata: { role },
    });
    revalidatePath("/settings");
    return { error: null, saved: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not add that person." };
  }
}
