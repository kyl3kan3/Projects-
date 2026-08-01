"use server";

/**
 * Organization settings: the profile that feeds fit scoring, the reminder ladder,
 * the timezone every deadline is read in, and the ICS feed token.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations, type OrgProfile } from "@/db/schema";
import { clearSession, requireOwner, requireUser } from "@/lib/auth";
import { isValidTimeZone } from "@/lib/dates";
import { parseDollarsToCents } from "@/lib/money";
import { normalizeOffsets } from "@/lib/reminders";
import { hashIcsToken, newIcsToken } from "@/lib/ics";
import { env } from "@/lib/env";
import { CAUSE_AREAS, BUDGET_BANDS } from "@/lib/fit-score";
import { createCheckoutSession, createPortalSession, stripeConfigured } from "@/lib/billing";
import { PLAN_ORDER, type BillingInterval } from "@/lib/plans";
import { isUsState } from "@/lib/us-states";
import type { Plan } from "@/db/schema";

export interface SettingsState {
  error: string | null;
  ok?: boolean;
  message?: string;
}

function str(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Save the profile. `profileVersion` bumps on every save so cached fit scores are
 * invalidated — a score computed against last month's mission is worse than no
 * score, because it looks current.
 */
export async function saveProfileAction(
  _prev: SettingsState,
  form: FormData,
): Promise<SettingsState> {
  const { org } = await requireUser();
  const db = getDb();

  const serviceStates = form
    .getAll("serviceStates")
    .map((v) => String(v).trim().toUpperCase())
    .filter((v) => isUsState(v));
  const causeCodes = form
    .getAll("causeCodes")
    .map((v) => String(v).trim())
    .filter((v) => CAUSE_AREAS.some((c) => c.code === v));

  const askRaw = str(form, "typicalAsk");
  const typicalAskCents = askRaw ? parseDollarsToCents(askRaw) : null;
  if (askRaw && typicalAskCents === null) {
    return { error: `"${askRaw}" is not an amount I can read. Try 10,000 or 10k.` };
  }

  const budgetBand = str(form, "budgetBand");
  if (budgetBand && !BUDGET_BANDS.some((b) => b.code === budgetBand)) {
    return { error: "Pick a budget band from the list" };
  }

  const ein = str(form, "ein");
  if (ein && !/^\d{2}-?\d{7}$/.test(ein)) {
    return { error: "An EIN looks like 34-1234567" };
  }

  const profile: OrgProfile = {
    mission: form.get("mission")?.toString().trim() ?? "",
    programs: form.get("programs")?.toString().trim() ?? "",
    budgetBand,
    serviceStates,
    causeCodes,
    ein: ein ? ein.replace(/^(\d{2})-?(\d{7})$/, "$1-$2") : "",
    typicalAskCents,
  };

  const name = str(form, "name");

  await db
    .update(organizations)
    .set({
      name: name || org.name,
      profile,
      profileVersion: org.profileVersion + 1,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, org.id));

  revalidatePath("/settings");
  revalidatePath("/settings/profile");
  revalidatePath("/discovery");

  if (str(form, "next") === "pipeline") redirect("/pipeline");
  return { error: null, ok: true, message: "Profile saved. Discovery has re-scored." };
}

export async function saveRemindersAction(
  _prev: SettingsState,
  form: FormData,
): Promise<SettingsState> {
  const { org } = await requireUser();
  const db = getDb();

  const timezone = str(form, "timezone");
  if (timezone && !isValidTimeZone(timezone)) {
    return { error: `"${timezone}" is not a timezone this server recognises` };
  }

  const raw = [str(form, "offset1"), str(form, "offset2"), str(form, "offset3")]
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n));
  const offsets = normalizeOffsets(raw);

  await db
    .update(organizations)
    .set({
      timezone: timezone || org.timezone,
      reminderOffsets: offsets,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, org.id));

  revalidatePath("/settings");
  revalidatePath("/calendar");
  revalidatePath("/pipeline");
  return {
    error: null,
    ok: true,
    message: `Reminders will go out ${offsets.join(", ")} days before each date, plus one notice if a date slips.`,
  };
}

/**
 * Issue or rotate the ICS token. The raw token is returned exactly once — it is
 * stored only as an HMAC, so a database leak does not hand out everyone's calendar,
 * and rotating makes the old URL stop resolving immediately.
 */
export async function rotateIcsTokenAction(
  _prev: SettingsState,
  _form: FormData,
): Promise<SettingsState> {
  const { org } = await requireOwner();
  const db = getDb();
  const token = newIcsToken();
  await db
    .update(organizations)
    .set({ icsTokenHash: hashIcsToken(token, env.icsTokenSecret), updatedAt: new Date() })
    .where(eq(organizations.id, org.id));
  revalidatePath("/settings");
  return {
    error: null,
    ok: true,
    message: `${env.appUrl}/api/calendar/${token}/grantgrid.ics`,
  };
}

export async function signOutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}

/* ----------------------------------------------------------------- billing --- */

export async function startCheckoutAction(
  _prev: SettingsState,
  form: FormData,
): Promise<SettingsState> {
  const { org, user } = await requireOwner();
  const planId = str(form, "plan");
  const interval = str(form, "interval") === "annual" ? "annual" : "monthly";
  if (!PLAN_ORDER.includes(planId as Plan)) return { error: "Pick a plan" };
  if (!stripeConfigured()) {
    return {
      error:
        "Stripe is not configured on this deployment (STRIPE_SECRET_KEY is unset), so checkout cannot open.",
    };
  }
  let url: string;
  try {
    url = await createCheckoutSession(
      org,
      user.email,
      planId as Plan,
      interval as BillingInterval,
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Stripe refused the request" };
  }
  redirect(url);
}

export async function openPortalAction(
  _prev: SettingsState,
  _form: FormData,
): Promise<SettingsState> {
  const { org, user } = await requireOwner();
  if (!stripeConfigured()) {
    return { error: "Stripe is not configured on this deployment." };
  }
  if (!org.stripeCustomerId) {
    return { error: "There is no billing account yet — choose a plan first." };
  }
  let url: string;
  try {
    url = await createPortalSession(org, user.email);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Stripe refused the request" };
  }
  redirect(url);
}
