"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { associations, users, type BoardRole, type Plan } from "@/db/schema";
import { inviteBoardMember, requireCapability, setBoardRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { withDefaults } from "@/lib/settings";
import { featureAllowed, planForFeature, PLAN_ORDER } from "@/lib/plans";
import {
  createBillingPortal,
  createConnectAccountLink,
  createSubscriptionCheckout,
  stripeConfigured,
  syncConnectStatus,
} from "@/lib/stripe";

export interface SettingsState {
  error?: string;
  ok?: string;
}

export async function saveAssociationAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  try {
    const { association, user } = await requireCapability("settings");
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { error: "The association needs a name — members see it on every invoice" };
    const settings = withDefaults(association.settings);
    settings.invoiceFooter = String(formData.get("invoiceFooter") ?? "").trim();
    settings.fiscalYearStartMonth = Math.min(
      12,
      Math.max(1, Number(formData.get("fiscalYearStartMonth") ?? 1) || 1),
    );

    await getDb()
      .update(associations)
      .set({ name, timezone: String(formData.get("timezone") ?? association.timezone), settings })
      .where(eq(associations.id, association.id));
    await audit(
      association.id,
      { kind: "user", id: user.id, name: user.name },
      "updated_settings",
      association.name,
    );
    revalidatePath("/settings");
    return { ok: "Saved." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save that" };
  }
}

export async function saveLadderAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  try {
    const { association, user } = await requireCapability("settings");
    const settings = withDefaults(association.settings);
    const smsAllowed = featureAllowed(association.plan, "sms");

    const ladder = settings.reminderLadder.map((rung, index) => {
      const days = Number(formData.get(`afterDays_${index}`) ?? rung.afterDays);
      const subject = String(formData.get(`subject_${index}`) ?? rung.subject);
      const body = String(formData.get(`body_${index}`) ?? rung.body);
      const channel = String(formData.get(`channel_${index}`) ?? rung.channel);
      return {
        ...rung,
        afterDays: Number.isFinite(days) && days > 0 ? Math.floor(days) : rung.afterDays,
        subject: subject.trim() || rung.subject,
        body: body.trim() || rung.body,
        channel: channel === "sms" && smsAllowed ? ("sms" as const) : ("email" as const),
      };
    });

    // Rungs must ascend, or the ladder can never advance past the first one.
    for (let i = 1; i < ladder.length; i++) {
      if (ladder[i].afterDays <= ladder[i - 1].afterDays) {
        return {
          error: `Step ${i + 1} must be later than step ${i} — otherwise the ladder can never reach it.`,
        };
      }
    }

    settings.reminderLadder = ladder;
    await getDb().update(associations).set({ settings }).where(eq(associations.id, association.id));
    await audit(
      association.id,
      { kind: "user", id: user.id, name: user.name },
      "updated_reminder_ladder",
      `${ladder.length} steps`,
    );
    revalidatePath("/settings");
    return { ok: "Ladder saved. It applies to the next sweep." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the ladder" };
  }
}

export async function inviteBoardMemberAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  try {
    const { association, user } = await requireCapability("settings");
    const role = String(formData.get("role") ?? "member") as BoardRole;
    if (!["president", "treasurer", "secretary", "member"].includes(role)) {
      return { error: "Pick a role" };
    }
    if (role !== "member" && !featureAllowed(association.plan, "boardRoles")) {
      return {
        error: `Roles beyond read-only board members come with ${planForFeature("boardRoles").name}. Upgrade in Settings.`,
      };
    }
    const result = await inviteBoardMember(association.id, {
      email: String(formData.get("email") ?? ""),
      name: String(formData.get("name") ?? ""),
      role,
      termNote: String(formData.get("termNote") ?? ""),
    });
    await audit(
      association.id,
      { kind: "user", id: user.id, name: user.name },
      "invited_board_member",
      String(formData.get("email") ?? ""),
      { role },
    );
    revalidatePath("/settings");
    return {
      ok: `Added. Give them this one-time password to sign in and change: ${result.temporaryPassword}`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add that board member" };
  }
}

export async function setRoleAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  try {
    const { association, user } = await requireCapability("settings");
    const userId = String(formData.get("userId") ?? "");
    const role = String(formData.get("role") ?? "member") as BoardRole;
    const [target] = await getDb()
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.associationId, association.id)));
    if (!target) return { error: "That person is not on this board" };

    await setBoardRole(association.id, userId, role);
    await audit(
      association.id,
      { kind: "user", id: user.id, name: user.name },
      "changed_board_role",
      `${target.name} → ${role}`,
      { userId, from: target.role, to: role },
    );
    revalidatePath("/settings");
    return { ok: `${target.name} is now ${role}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not change that role" };
  }
}

/* ------------------------------------------------------------- payments --- */

export async function connectStripeAction(): Promise<void> {
  const { association, user } = await requireCapability("settings");
  if (!stripeConfigured()) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set on this deployment, so Stripe onboarding cannot start.",
    );
  }
  const url = await createConnectAccountLink(association, user.email);
  redirect(url);
}

export async function refreshConnectAction(
  _prev: SettingsState,
  _formData: FormData,
): Promise<SettingsState> {
  try {
    const { association } = await requireCapability("settings");
    if (!stripeConfigured()) {
      return { error: "STRIPE_SECRET_KEY is not set on this deployment." };
    }
    const ready = await syncConnectStatus(association.id);
    revalidatePath("/settings/payments");
    return {
      ok: ready
        ? "Stripe says the association's account can accept payments."
        : "Stripe says the account is not ready yet — finish onboarding in the Stripe tab and check again.",
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not check with Stripe" };
  }
}

/* -------------------------------------------------------------- billing --- */

export async function upgradeAction(formData: FormData): Promise<void> {
  const { association, user } = await requireCapability("settings");
  const planId = String(formData.get("plan") ?? "") as Plan;
  if (!PLAN_ORDER.includes(planId)) throw new Error("Pick a plan");
  if (!stripeConfigured()) {
    throw new Error("STRIPE_SECRET_KEY is not set on this deployment, so checkout cannot start.");
  }
  const url = await createSubscriptionCheckout(association, user.email, planId);
  redirect(url);
}

export async function billingPortalAction(): Promise<void> {
  const { association, user } = await requireCapability("settings");
  if (!stripeConfigured()) {
    throw new Error("STRIPE_SECRET_KEY is not set on this deployment.");
  }
  const url = await createBillingPortal(association, user.email);
  redirect(url);
}
