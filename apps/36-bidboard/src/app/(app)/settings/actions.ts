"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, users, type UserRole } from "@/db/schema";
import {
  AuthError,
  canAdminister,
  hashPassword,
  requireEstimator,
  requireUser,
} from "@/lib/auth";
import type { ActionState } from "@/components/ActionForm";
import { canAddSeat } from "@/lib/plans";
import { normalizeReminderDays } from "@/lib/schedule";
import { audit } from "@/lib/audit";
import { billingConfigured, createBillingPortalSession, createCheckoutSession } from "@/lib/billing";
import type { Plan } from "@/db/schema";

export async function updateCompanyAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireEstimator();
    const db = getDb();
    const days = String(form.get("reminderDays") ?? "")
      .split(/[,\s]+/)
      .map(Number)
      .filter((n) => Number.isFinite(n));

    await db
      .update(companies)
      .set({
        name: String(form.get("name") ?? ctx.company.name).trim().slice(0, 160),
        replyToEmail: String(form.get("replyTo") ?? "").trim().toLowerCase() || null,
        settings: {
          reminderDays: days.length > 0 ? normalizeReminderDays(days) : ctx.company.settings.reminderDays,
          portalNote: String(form.get("portalNote") ?? "").trim().slice(0, 500) || null,
        },
      })
      .where(eq(companies.id, ctx.company.id));
    revalidatePath("/settings");
    return { ok: "Saved" };
  } catch (err) {
    return { error: err instanceof AuthError ? err.message : "Could not save those settings" };
  }
}

export async function addSeatAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const ctx = await requireUser();
    if (!canAdminister(ctx.user.role)) return { error: "Only an admin can add seats" };

    const db = getDb();
    const seats = await db.select().from(users).where(eq(users.companyId, ctx.company.id));
    const gate = canAddSeat(ctx.company.plan, seats.length);
    if (!gate.allowed) return { error: gate.reason! };

    const email = String(form.get("email") ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address" };
    const password = String(form.get("password") ?? "");
    if (password.length < 8) return { error: "Give them a password of at least 8 characters" };

    const [clash] = await db.select().from(users).where(eq(users.email, email));
    if (clash) return { error: "That email already has an account" };

    const roleRaw = String(form.get("role") ?? "estimator");
    const role: UserRole = roleRaw === "viewer" ? "viewer" : roleRaw === "admin" ? "admin" : "estimator";

    await db.insert(users).values({
      companyId: ctx.company.id,
      email,
      name: String(form.get("name") ?? "").trim() || null,
      passwordHash: await hashPassword(password),
      role,
    });
    await audit({
      companyId: ctx.company.id,
      actorKind: "user",
      actorId: ctx.user.id,
      actorLabel: ctx.user.email,
      action: "seat.added",
      target: email,
      metadata: { role },
    });
    revalidatePath("/settings");
    return { ok: `${email} can sign in now — hand them the password you just set.` };
  } catch (err) {
    console.error("addSeat failed", err);
    return { error: "Could not add that seat" };
  }
}

export async function removeSeatAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const ctx = await requireUser();
    if (!canAdminister(ctx.user.role)) return { error: "Only an admin can remove seats" };
    const userId = String(form.get("userId") ?? "");
    if (userId === ctx.user.id) return { error: "You cannot remove your own seat" };

    const db = getDb();
    const [target] = await db.select().from(users).where(eq(users.id, userId));
    if (!target || target.companyId !== ctx.company.id) return { error: "That seat is not yours" };

    await db.delete(users).where(eq(users.id, userId));
    await audit({
      companyId: ctx.company.id,
      actorKind: "user",
      actorId: ctx.user.id,
      actorLabel: ctx.user.email,
      action: "seat.removed",
      target: target.email,
    });
    revalidatePath("/settings");
    return { ok: `${target.email} no longer has access` };
  } catch {
    return { error: "Could not remove that seat" };
  }
}

/* ---------------------------------------------------------------- billing --- */

export async function checkoutAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let url: string;
  try {
    const ctx = await requireUser();
    if (!canAdminister(ctx.user.role)) return { error: "Only an admin can change the plan" };
    if (!billingConfigured()) {
      return {
        error:
          "Stripe is not configured on this deployment. Set STRIPE_SECRET_KEY and the three price ids.",
      };
    }
    const planRaw = String(form.get("plan") ?? "");
    const plan: Plan =
      planRaw === "builder" ? "builder" : planRaw === "precon" ? "precon" : "crew";
    url = await createCheckoutSession(ctx.company, plan, "/settings/billing");
  } catch (err) {
    console.error("checkout failed", err);
    return { error: "Could not start checkout" };
  }
  redirect(url);
}

export async function billingPortalAction(): Promise<void> {
  const ctx = await requireUser();
  if (!canAdminister(ctx.user.role)) return;
  if (!billingConfigured()) return;
  const url = await createBillingPortalSession(ctx.company, "/settings/billing");
  redirect(url);
}
