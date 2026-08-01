"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, locations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { newQrToken, rotateQrToken } from "@/lib/qr";
import { featureAllowed, locationsAllowed } from "@/lib/plans";
import { createBillingPortalSession, createCheckoutSession } from "@/lib/stripe";
import { stripeConfigured } from "@/lib/env";
import type { Plan } from "@/db/schema";
import { redirect } from "next/navigation";

export interface SettingsState {
  error?: string;
  ok?: string;
}

export async function updateLocationAction(
  _prev: SettingsState,
  form: FormData,
): Promise<SettingsState> {
  const { account } = await requireUser();
  const id = String(form.get("locationId") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const timezone = String(form.get("timezone") ?? "").trim();
  const kioskPin = String(form.get("kioskPin") ?? "").trim();

  if (!name) return { error: "The location needs a name — it appears on the waiver and receipt." };
  if (!/^\d{4,8}$/.test(kioskPin)) return { error: "The kiosk PIN is 4 to 8 digits." };
  try {
    // Reject a timezone Postgres and Intl would disagree about later.
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    return { error: `"${timezone}" is not a timezone. Use an IANA name like America/Denver.` };
  }

  const db = getDb();
  await db
    .update(locations)
    .set({ name, timezone, kioskPin })
    .where(and(eq(locations.id, id), eq(locations.accountId, account.id)));

  revalidatePath("/settings");
  revalidatePath("/checkin");
  return { ok: "Saved." };
}

export async function addLocationAction(
  _prev: SettingsState,
  form: FormData,
): Promise<SettingsState> {
  const { account } = await requireUser();
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Give the location a name." };

  const db = getDb();
  const [existing] = await db
    .select({ n: count() })
    .from(locations)
    .where(eq(locations.accountId, account.id));
  const allowed = locationsAllowed(account);
  if (Number(existing?.n ?? 0) >= allowed) {
    return {
      error: `Your plan covers ${allowed} ${allowed === 1 ? "location" : "locations"}. Operator covers 3.`,
    };
  }

  await db.insert(locations).values({
    accountId: account.id,
    name,
    timezone: String(form.get("timezone") ?? "America/Denver"),
    kioskPin: String(Math.floor(1000 + Math.random() * 9000)),
    qrToken: newQrToken(),
  });

  revalidatePath("/settings");
  return { ok: `${name} added. It has its own QR poster and kiosk PIN.` };
}

/**
 * Rotate the poster token. This is destructive to physical property — every
 * printed poster stops working — so the UI holds to confirm and says so.
 */
export async function rotateQrAction(
  _prev: SettingsState,
  form: FormData,
): Promise<SettingsState> {
  const { account } = await requireUser();
  const id = String(form.get("locationId") ?? "");
  await rotateQrToken(account.id, id);
  revalidatePath("/settings");
  revalidatePath("/settings/poster");
  return { ok: "New code issued. Every poster printed from the old one is now dead — reprint." };
}

export async function updateSettingsAction(
  _prev: SettingsState,
  form: FormData,
): Promise<SettingsState> {
  const { account } = await requireUser();
  const posterFooterOff = form.get("posterFooterOff") === "on";

  if (posterFooterOff && !featureAllowed(account, "removablePosterFooter")) {
    return { error: "Removing the poster footer is an Operator feature." };
  }

  const retentionYears = Number(form.get("retentionYears") ?? 7);
  if (!Number.isInteger(retentionYears) || retentionYears < 1 || retentionYears > 25) {
    return { error: "Retention is between 1 and 25 years." };
  }

  const db = getDb();
  await db
    .update(accounts)
    .set({
      settings: {
        ...account.settings,
        posterFooter: !posterFooterOff,
        retentionYears,
        digestHour: Number(form.get("digestHour") ?? account.settings.digestHour),
      },
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, account.id));

  revalidatePath("/settings");
  return { ok: "Saved." };
}

/* ------------------------------------------------------------------ billing */

export async function checkoutAction(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const { account, user } = await requireUser();
  if (!stripeConfigured()) {
    return { error: "Stripe is not configured on this deployment (STRIPE_SECRET_KEY is unset)." };
  }
  const planId = String(form.get("plan") ?? "counter") as Plan;
  const interval = String(form.get("interval") ?? "monthly") === "annual" ? "annual" : "monthly";

  let url: string;
  try {
    url = await createCheckoutSession(account, user.email, planId, interval);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Stripe would not start a checkout" };
  }
  redirect(url);
}

export async function portalAction(_prev: SettingsState, _form: FormData): Promise<SettingsState> {
  const { account, user } = await requireUser();
  if (!stripeConfigured()) {
    return { error: "Stripe is not configured on this deployment (STRIPE_SECRET_KEY is unset)." };
  }
  let url: string;
  try {
    url = await createBillingPortalSession(account, user.email);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Stripe would not open the portal" };
  }
  redirect(url);
}
