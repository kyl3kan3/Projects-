"use server";

/**
 * Tenant actions. Every one of them resolves the tenancy **from the token** and
 * never from a form field: the token is the only credential a tenant has, and a
 * tenancy id in a hidden input would let anyone with a link pay — or sign — for
 * somebody else's unit.
 */

import { revalidatePath } from "next/cache";
import { renderSignedLease } from "@/lib/docs";
import { field, formError, formOk, type FormState } from "@/lib/form";
import { reverseLadderIfPaid } from "@/lib/ladder-run";
import { balance, post } from "@/lib/ledger";
import { verifyTenantToken } from "@/lib/links";
import { formatMoney, isoDateOf, prorateFirstMonth } from "@/lib/money";
import { rentPayments, SIMULATED_METHODS } from "@/lib/payments";
import { completeMoveIn, savePaymentMethod, tenancyContext } from "@/lib/tenancy";

async function contextFromToken(token: string) {
  const claim = await verifyTenantToken(token);
  if (!claim) return null;
  const ctx = await tenancyContext(claim.tenancyId);
  if (!ctx) return null;
  return { ctx, purpose: claim.purpose };
}

export async function signLeaseAction(_prev: FormState, form: FormData): Promise<FormState> {
  const token = field(form, "token");
  const found = await contextFromToken(token);
  if (!found) return formError("This link has expired. Ask the office for a new one.");
  if (found.purpose !== "movein") return formError("This link cannot sign a lease.");

  const { ctx } = found;
  if (ctx.tenancy.signedAt) return formOk("Already signed.");

  const typed = field(form, "signature");
  if (typed.trim().length < 3) return formError("Type your full name to sign");
  if (field(form, "agree") !== "on") return formError("Tick the box to agree to the agreement");

  const first = prorateFirstMonth(ctx.tenancy.rateCents, ctx.tenancy.startedOn, ctx.settings.prorateRule);
  await renderSignedLease(ctx, first, typed.trim());
  revalidatePath(`/t/${token}`);
  return formOk("Signed. Next: a card or bank account for the rent.");
}

export async function savePaymentMethodAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const token = field(form, "token");
  const found = await contextFromToken(token);
  if (!found) return formError("This link has expired. Ask the office for a new one.");
  const { ctx } = found;
  if (!ctx.tenancy.signedAt) return formError("Sign the agreement first");

  const methodId = field(form, "methodId");
  const allowed = SIMULATED_METHODS.some((m) => m.id === methodId);
  if (!allowed && !methodId.startsWith("pm_")) {
    return formError("Pick a payment method");
  }
  await savePaymentMethod(ctx.tenancy.id, methodId);
  revalidatePath(`/t/${token}`);
  return formOk("Saved. One more step: the first payment.");
}

/**
 * The first payment, from the tenant's side. It calls the same `completeMoveIn` the
 * owner's console calls, so there is one code path that issues a gate code.
 */
export async function payFirstMonthAction(_prev: FormState, form: FormData): Promise<FormState> {
  const token = field(form, "token");
  const found = await contextFromToken(token);
  if (!found) return formError("This link has expired. Ask the office for a new one.");
  const { ctx } = found;
  try {
    const result = await completeMoveIn(ctx, `tenant:${ctx.tenant.id}`, "saved");
    revalidatePath(`/t/${token}`);
    if (!result.charged) return formError(result.message);
    return formOk(`Paid. Your gate code is ${result.gateCode}.`);
  } catch (err) {
    return formError(err instanceof Error ? err.message : "The payment did not go through");
  }
}

/** Pay the outstanding balance on an existing tenancy. */
export async function payBalanceAction(_prev: FormState, form: FormData): Promise<FormState> {
  const token = field(form, "token");
  const found = await contextFromToken(token);
  if (!found) return formError("This link has expired. Ask the office for a new one.");
  const { ctx } = found;

  const outstanding = await balance(ctx.tenancy.id);
  if (outstanding <= 0) return formOk("Nothing is due — you are paid up.");

  const outcome = await rentPayments().charge({
    stripeAccountId: ctx.owner.stripeAccountId,
    customerId: ctx.tenant.stripeCustomerId,
    paymentMethodId: ctx.tenancy.stripePaymentMethodId,
    amountCents: outstanding,
    description: `${ctx.facility.name} unit ${ctx.unit.label}`,
    idempotencyKey: `tenantpay:${ctx.tenancy.id}:${isoDateOf(new Date())}:${outstanding}`,
  });
  if (!outcome.ok) return formError(outcome.message);

  await post({
    tenancyId: ctx.tenancy.id,
    kind: "payment",
    amountCents: -outstanding,
    description: `Paid online${outcome.simulated ? " (simulated)" : ""}`,
    occurredOn: isoDateOf(new Date()),
    stripePaymentIntentId: outcome.paymentIntentId,
  });

  const reversal = await reverseLadderIfPaid(ctx.tenancy.id, isoDateOf(new Date()));
  revalidatePath(`/t/${token}`);
  return formOk(
    reversal.overlockLifted
      ? `${formatMoney(outstanding)} paid. Your gate code works again.`
      : `${formatMoney(outstanding)} paid. Thank you.`,
  );
}
