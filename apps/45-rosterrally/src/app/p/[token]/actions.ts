"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import type { FormState } from "@/components/ActionForm";
import { getDb } from "@/db";
import { clubs } from "@/db/schema";
import { resolveHouseholdLink } from "@/lib/links";
import { outstandingForHousehold } from "@/lib/family";
import { getGateway } from "@/lib/payments";
import { env } from "@/lib/env";
import { claimSlot, releaseClaim } from "@/lib/volunteers";

/**
 * The three things a parent can do from their own page. Every one of them starts
 * by resolving the signed token, and none of them takes a household id from the
 * request — a forwarded link can only ever act on the family it belongs to.
 */

async function household(form: FormData) {
  const token = String(form.get("token") ?? "");
  const resolved = await resolveHouseholdLink(token);
  if (!resolved.ok) {
    throw new Error(
      resolved.reason === "expired"
        ? "That link has expired. Ask the club for a new one."
        : "That link is no longer valid. Ask the club for a new one.",
    );
  }
  return { household: resolved.household, token };
}

export async function claimSlotAction(_prev: FormState, form: FormData): Promise<FormState> {
  let outcome;
  let token: string;
  try {
    const ctx = await household(form);
    token = ctx.token;
    outcome = await claimSlot(String(form.get("slotId") ?? ""), ctx.household.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not claim that" };
  }
  revalidatePath(`/p/${token}`);
  revalidatePath("/volunteers");
  return outcome.ok
    ? { ok: `You have got ${outcome.role}. We will remind you the day before.` }
    : { error: outcome.message };
}

export async function releaseClaimAction(_prev: FormState, form: FormData): Promise<FormState> {
  let released: boolean;
  let token: string;
  try {
    const ctx = await household(form);
    token = ctx.token;
    released = await releaseClaim(String(form.get("claimId") ?? ""), ctx.household.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not give that up" };
  }
  revalidatePath(`/p/${token}`);
  revalidatePath("/volunteers");
  return released
    ? { ok: "Given up — the slot is open for somebody else." }
    : { error: "That was not yours to give up" };
}

export async function payBalanceAction(_prev: FormState, form: FormData): Promise<FormState> {
  let url: string;
  try {
    const ctx = await household(form);
    const outstanding = await outstandingForHousehold(ctx.household.id);
    if (outstanding.length === 0) return { error: "There is nothing outstanding to pay" };

    const [club] = await getDb().select().from(clubs).where(eq(clubs.id, ctx.household.clubId));
    const total = outstanding.reduce((s, o) => s + o.balanceCents, 0);

    const checkout = await getGateway().createCheckout({
      clubId: ctx.household.clubId,
      clubName: club?.name ?? "Your club",
      householdId: ctx.household.id,
      householdEmail: ctx.household.email,
      lines: outstanding.map((o) => ({
        registrationId: o.registrationId,
        label: o.label,
        amountCents: o.balanceCents,
      })),
      // Our fee rode on the original checkout; a balance payment does not add another.
      platformFeeCents: 0,
      absorbPlatformFee: true,
      connectedAccountId: club?.stripeAccountReady ? club.stripeAccountId : null,
      successUrl: `${env.appUrl}/p/${ctx.token}`,
      cancelUrl: `${env.appUrl}/p/${ctx.token}`,
    });
    void total;
    url = checkout.url;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start that payment" };
  }
  redirect(url);
}
