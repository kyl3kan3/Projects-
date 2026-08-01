"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import type { FormState } from "@/components/ActionForm";
import { getDb } from "@/db";
import { clubs, users, type Plan, type StaffRole } from "@/db/schema";
import { audit } from "@/lib/audit";
import { inviteStaff, requireCapability, setStaffRole } from "@/lib/auth";
import { createFlatPlanCheckout } from "@/lib/payments";
import { env } from "@/lib/env";

const ROLES: StaffRole[] = ["admin", "registrar", "treasurer", "coach", "manager"];

function actorOf(ctx: Awaited<ReturnType<typeof requireCapability>>) {
  return { kind: "user" as const, id: ctx.user.id, name: ctx.user.name };
}

export async function saveClubAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_club");
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "The club needs a name" };
  const timezone = String(form.get("timezone") ?? ctx.club.timezone);
  const budget = Number(form.get("smsMonthlyBudget") ?? 2000);

  // Validate the zone by using it: an invalid IANA name throws here rather than
  // silently mis-scheduling every game in the season.
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch {
    return { error: `${timezone} is not a timezone this server recognises` };
  }

  await getDb()
    .update(clubs)
    .set({
      name,
      timezone,
      settings: {
        ...ctx.settings,
        smsMonthlyBudget: Number.isInteger(budget) && budget >= 0 ? budget : 2000,
        replyToEmail: String(form.get("replyToEmail") ?? ctx.settings.replyToEmail),
      },
    })
    .where(eq(clubs.id, ctx.club.id));

  await audit(ctx.club.id, actorOf(ctx), "club_settings_saved", `club:${ctx.club.id}`, { timezone });
  revalidatePath("/settings");
  revalidatePath("/season");
  return {
    ok:
      timezone === ctx.club.timezone
        ? "Saved."
        : `Saved. New games are read in ${timezone}; games already on the schedule keep the instants they were created with.`,
  };
}

export async function inviteStaffAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_club");
  const role = String(form.get("role") ?? "coach") as StaffRole;
  try {
    const result = await inviteStaff(ctx.club.id, {
      email: String(form.get("email") ?? ""),
      name: String(form.get("name") ?? ""),
      role: ROLES.includes(role) ? role : "coach",
    });
    await audit(ctx.club.id, actorOf(ctx), "staff_invited", `user:${result.userId}`, { role });
    revalidatePath("/settings");
    return {
      ok: `Added. Their one-time password is ${result.temporaryPassword} — read it out at the coaches' meeting; they can change it after signing in.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add them" };
  }
}

export async function setRoleAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_club");
  const userId = String(form.get("userId") ?? "");
  const role = String(form.get("role") ?? "coach") as StaffRole;
  const [target] = await getDb().select().from(users).where(eq(users.id, userId));
  if (!target || target.clubId !== ctx.club.id) return { error: "That person is not in your club" };
  try {
    await setStaffRole(ctx.club.id, userId, ROLES.includes(role) ? role : "coach");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not change the role" };
  }
  revalidatePath("/settings");
  return { ok: `${target.name} is now ${role}.` };
}

/**
 * Switch between the per-registration fee and the $49/mo flat plan.
 *
 * With Stripe configured this hands off to Checkout. Without it, the plan is
 * switched directly and the response says so plainly — the plan is what gates our
 * $1.50, and a club must be able to choose it on a deployment that has no Stripe
 * key yet.
 */
export async function switchPlanAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_club");
  const plan = String(form.get("plan") ?? "per_registration") as Plan;
  if (plan !== "flat" && plan !== "per_registration") return { error: "Unknown plan" };

  if (plan === "flat") {
    const checkout = await createFlatPlanCheckout({
      clubId: ctx.club.id,
      clubName: ctx.club.name,
      email: ctx.user.email,
      returnUrl: `${env.appUrl}/settings`,
    });
    await getDb().update(clubs).set({ plan: "flat" }).where(eq(clubs.id, ctx.club.id));
    await audit(ctx.club.id, actorOf(ctx), "plan_switched", `club:${ctx.club.id}`, { plan });
    revalidatePath("/settings");
    return {
      ok: checkout.url
        ? `Continue to Stripe to set up the $49/mo: ${checkout.url}`
        : `Switched to the flat plan. New registrations carry no per-registration fee. ${checkout.note}`,
    };
  }

  await getDb().update(clubs).set({ plan: "per_registration" }).where(eq(clubs.id, ctx.club.id));
  await audit(ctx.club.id, actorOf(ctx), "plan_switched", `club:${ctx.club.id}`, { plan });
  revalidatePath("/settings");
  return { ok: "Switched to $1.50 per paid registration. Scholarship codes never carry it." };
}

/** Record the club's own Stripe Connect account id. */
export async function saveStripeAccountAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireCapability("manage_club");
  const accountId = String(form.get("stripeAccountId") ?? "").trim();
  if (accountId && !/^acct_[A-Za-z0-9]+$/.test(accountId)) {
    return { error: "A Stripe account id looks like acct_1234ABCD" };
  }
  await getDb()
    .update(clubs)
    .set({
      stripeAccountId: accountId || null,
      stripeAccountReady: Boolean(accountId),
    })
    .where(eq(clubs.id, ctx.club.id));
  await audit(ctx.club.id, actorOf(ctx), "stripe_account_saved", `club:${ctx.club.id}`);
  revalidatePath("/settings");
  return {
    ok: accountId
      ? "Saved. Registration money now lands in the club's own Stripe balance, with our fee split off."
      : "Cleared. Until an account is connected, checkout runs against the platform account.",
  };
}
