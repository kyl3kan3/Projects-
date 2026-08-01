"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import type { FormState } from "@/components/ActionForm";
import { getDb } from "@/db";
import { clubs, households, seasons } from "@/db/schema";
import { notifyHousehold } from "@/lib/comms";
import { DEFAULT_CLUB_SETTINGS } from "@/lib/auth";
import { householdUrl, mintHouseholdToken } from "@/lib/links";
import { formatMoney } from "@/lib/money";
import { gatewayIsLive, verifyTestCheckout } from "@/lib/payments";
import { applyAvailableCredit, getHouseholdMoney, settlePayment } from "@/lib/registration";

/**
 * Settle a test-gateway checkout.
 *
 * Everything the Stripe webhook does, in the same order and through the same
 * functions: idempotent settlement keyed on the provider reference, a cascade
 * across the household's open registrations oldest-first, credit applied, and the
 * confirmation with the family's durable link. Refuses outright when a real Stripe
 * key is present, so this can never be a way to mark a real registration paid.
 */
export async function confirmTestCheckoutAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  if (gatewayIsLive()) {
    return { error: "This deployment uses Stripe, so the test gateway is disabled" };
  }
  const token = String(form.get("token") ?? "");
  const claims = await verifyTestCheckout(token);
  if (!claims) return { error: "That checkout link has expired. Nothing was charged." };

  const db = getDb();
  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.id, claims.householdId));
  if (!household || household.clubId !== claims.clubId) {
    return { error: "That checkout does not match a family on file" };
  }
  const [club] = await db.select().from(clubs).where(eq(clubs.id, claims.clubId));

  const result = await settlePayment({
    clubId: claims.clubId,
    householdId: claims.householdId,
    amountCents: claims.amountCents,
    platformFeeCents: claims.platformFeeCents,
    method: "card",
    // Deterministic from the token, so a double-tapped confirm settles once.
    providerReference: `test_${token.slice(-24)}`,
    note: "Test gateway (no Stripe key configured)",
  });
  await applyAvailableCredit(claims.householdId);

  const money = await getHouseholdMoney(claims.householdId);
  const linkToken = await mintHouseholdToken(claims.householdId);

  if (!result.duplicate) {
    const [season] = await db
      .select()
      .from(seasons)
      .where(eq(seasons.clubId, claims.clubId))
      .limit(1);
    try {
      await notifyHousehold({
        clubId: claims.clubId,
        seasonId: season?.id ?? "",
        householdId: claims.householdId,
        subject: `You're registered with ${club?.name ?? "the club"}`,
        body: [
          `Thanks ${household.contactName} — we received ${formatMoney(claims.amountCents)}.`,
          money.netDueCents > 0
            ? `${formatMoney(money.netDueCents)} is still outstanding; your family page has the rest of the plan.`
            : "Nothing is outstanding.",
          "Your family page has your children's schedule, every message we send you, and the volunteer slots you can claim. One link, all season, nothing to install.",
        ].join("\n\n"),
        channels: household.smsConsent && household.phone ? ["email", "sms"] : ["email"],
        purpose: "registration_receipt",
        smsBudget: club?.settings?.smsMonthlyBudget ?? DEFAULT_CLUB_SETTINGS.smsMonthlyBudget,
      });
    } catch (err) {
      // A failed receipt must not undo a settled payment.
      console.error("[checkout] receipt not sent", err);
    }
  }

  redirect(householdUrl(linkToken).replace(/^https?:\/\/[^/]+/, ""));
}
