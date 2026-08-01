"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import type { FormState } from "@/components/ActionForm";
import { getDb } from "@/db";
import { households, registrations } from "@/db/schema";
import { requireCapability } from "@/lib/auth";
import { notifyHousehold } from "@/lib/comms";
import { formatMoney, parseMoney } from "@/lib/money";
import {
  getHouseholdMoney,
  recordManualPayment,
  refundRegistration,
} from "@/lib/registration";
import { householdUrl, mintHouseholdToken, revokeHouseholdToken } from "@/lib/links";

function actorOf(ctx: Awaited<ReturnType<typeof requireCapability>>) {
  return { kind: "user" as const, id: ctx.user.id, name: ctx.user.name };
}

/** Every action here re-checks that the row belongs to the caller's club. */
async function ownRegistration(clubId: string, registrationId: string) {
  const [row] = await getDb()
    .select()
    .from(registrations)
    .where(eq(registrations.id, registrationId));
  if (!row || row.clubId !== clubId) throw new Error("That registration is not in your club");
  return row;
}

async function ownHousehold(clubId: string, householdId: string) {
  const [row] = await getDb().select().from(households).where(eq(households.id, householdId));
  if (!row || row.clubId !== clubId) throw new Error("That family is not in your club");
  return row;
}

export async function recordPaymentAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_money");
  const householdId = String(form.get("householdId") ?? "");
  await ownHousehold(ctx.club.id, householdId);
  const amount = parseMoney(String(form.get("amount") ?? ""));
  if (amount === null || amount <= 0) {
    return { error: "Enter the amount as a plain figure, e.g. 185 or 185.00" };
  }
  const method = String(form.get("method") ?? "check") as "check" | "cash" | "other";

  const result = await recordManualPayment({
    clubId: ctx.club.id,
    householdId,
    amountCents: amount,
    method,
    reference: String(form.get("reference") ?? ""),
    actorUserId: ctx.user.id,
    actorName: ctx.user.name,
  });
  revalidatePath("/registrations");
  revalidatePath("/season");
  const credit =
    result.creditCents > 0
      ? ` ${formatMoney(result.creditCents)} is sitting as credit against their next registration.`
      : "";
  return {
    ok: `Recorded ${formatMoney(amount)}. ${formatMoney(result.appliedCents)} applied oldest-first.${credit}`,
  };
}

export async function refundAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_money");
  const registrationId = String(form.get("registrationId") ?? "");
  await ownRegistration(ctx.club.id, registrationId);
  const amount = parseMoney(String(form.get("amount") ?? ""));
  if (amount === null || amount <= 0) return { error: "Enter the refund amount" };
  const cancel = form.get("cancel") === "on";

  try {
    const result = await refundRegistration(registrationId, amount, actorOf(ctx), {
      cancel,
      reason: String(form.get("reason") ?? "") || undefined,
    });
    revalidatePath("/registrations");
    revalidatePath(`/registrations/${registrationId}`);
    revalidatePath("/season");
    return {
      ok: `Refunded ${formatMoney(result.refundedCents)}${
        result.canceled ? " and canceled the registration — the place is back in the pool." : "."
      }`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not refund" };
  }
}

export async function cancelRegistrationAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireCapability("manage_money");
  const registrationId = String(form.get("registrationId") ?? "");
  const row = await ownRegistration(ctx.club.id, registrationId);
  try {
    // Cancel and hand back whatever was actually settled.
    const result = await refundRegistration(registrationId, row.amountCents, actorOf(ctx), {
      cancel: true,
      reason: String(form.get("reason") ?? "Canceled by the club"),
    });
    revalidatePath("/registrations");
    revalidatePath("/season");
    return {
      ok:
        result.refundedCents > 0
          ? `Canceled and refunded ${formatMoney(result.refundedCents)}.`
          : "Canceled. Nothing had been paid, so there was nothing to refund.",
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not cancel" };
  }
}

/** Send the family their own page link again — the "I lost the email" button. */
export async function resendLinkAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("send_comms");
  const householdId = String(form.get("householdId") ?? "");
  const household = await ownHousehold(ctx.club.id, householdId);
  const seasonId = String(form.get("seasonId") ?? "");
  const money = await getHouseholdMoney(householdId);
  const token = await mintHouseholdToken(householdId);

  await notifyHousehold({
    clubId: ctx.club.id,
    seasonId,
    householdId,
    subject: `Your ${ctx.club.name} family page`,
    body: [
      `Hi ${household.contactName} — here is your family page for ${ctx.club.name}.`,
      money.netDueCents > 0
        ? `It shows ${formatMoney(money.netDueCents)} still to pay, your children's schedule, and the volunteer slots you can claim.`
        : "It shows your children's schedule, every message we have sent you, and the volunteer slots you can claim. Nothing is outstanding.",
      "Keep the link — it works all season and there is nothing to install.",
    ].join("\n\n"),
    channels: household.smsConsent && household.phone ? ["email", "sms"] : ["email"],
    purpose: "family_link",
    smsBudget: ctx.settings.smsMonthlyBudget,
  });

  revalidatePath("/registrations");
  return { ok: `Sent to ${household.email}. Their link: ${householdUrl(token)}` };
}

export async function revokeLinkAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireCapability("manage_club");
  const householdId = String(form.get("householdId") ?? "");
  await ownHousehold(ctx.club.id, householdId);
  await revokeHouseholdToken(householdId);
  revalidatePath("/registrations");
  return { ok: "Every link this family holds now stops working. Send a fresh one when they ask." };
}
