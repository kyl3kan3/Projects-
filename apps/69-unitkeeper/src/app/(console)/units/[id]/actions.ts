"use server";

/**
 * Unit-file actions: the move-in, the ledger, the gate code, the move-out.
 *
 * Every one re-resolves the owner and re-checks that the tenancy hangs off a
 * facility they own. `ownedTenancy` returning null is the whole authorisation
 * story, and it is checked before anything is read, not after.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { defaultStatementWindow, renderLease, renderStatement } from "@/lib/docs";
import { checkbox, field, formError, formOk, type FormState } from "@/lib/form";
import { reissueGateCode, setGateCodeStatus } from "@/lib/gate";
import { reverseLadderIfPaid } from "@/lib/ladder-run";
import { post, postAdjustment } from "@/lib/ledger";
import { mintTenantToken, tenantLinkUrl } from "@/lib/links";
import {
  isIsoDate,
  isoDateOf,
  parseMoneyToCents,
  prorateFirstMonth,
  type IsoDate,
} from "@/lib/money";
import { canAddUnit } from "@/lib/plans";
import { MAKE_READY_ITEMS } from "@/db/schema";
import { completeMoveIn, moveOut, ownedTenancy, startMoveIn } from "@/lib/tenancy";
import { ownedUnit, unitCount } from "@/lib/units";

function today(): IsoDate {
  return isoDateOf(new Date());
}

/* ---------------------------------------------------------------- move-in --- */

export async function startMoveInAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { owner, ent } = await requireOwner();
  if (ent.locked) return formError(ent.lockReason ?? "Your plan is not active");

  const unitId = field(form, "unitId");
  const found = await ownedUnit(owner.id, unitId);
  if (!found) return formError("That unit is not yours");

  // A move-in on a unit past the plan cap would create a tenancy the owner cannot
  // see. Refuse it here rather than half-way through.
  const gate = canAddUnit(ent, (await unitCount(owner.id)) - 1);
  if (!gate.allowed) return formError(gate.reason ?? "Your plan does not cover this unit");

  const startedOn = field(form, "startedOn") || today();
  if (!isIsoDate(startedOn)) return formError("Enter the move-in date as YYYY-MM-DD");

  let rateCents: number;
  try {
    rateCents = parseMoneyToCents(field(form, "rate") || String(found.unit.monthlyRateCents / 100));
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Enter the agreed monthly rate");
  }

  let tenancyId: string;
  try {
    const created = await startMoveIn(owner.id, owner.email, found.unit, {
      tenantName: field(form, "tenantName"),
      email: field(form, "email"),
      phone: field(form, "phone"),
      address: field(form, "address"),
      alternateContact: field(form, "alternateContact"),
      rateCents,
      startedOn,
    });
    tenancyId = created.tenancyId;
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not start the move-in");
  }

  const ctx = await ownedTenancy(owner.id, tenancyId);
  if (ctx) {
    const first = prorateFirstMonth(rateCents, startedOn, ctx.settings.prorateRule);
    await renderLease(ctx, first);
  }

  revalidatePath("/map");
  revalidatePath(`/units/${unitId}`);
  revalidatePath(`/units/${unitId}/move-in`);
  /**
   * A real redirect, not a returned `redirectTo`. The owner is already standing on
   * /units/{id}/move-in, and `router.push` to the URL you are already on is a no-op
   * that leaves step 1 on screen while the tenancy exists behind it. Caught in
   * Chromium, not by reading the code.
   */
  redirect(`/units/${unitId}/move-in`);
}

/**
 * Finish a move-in the tenant did not finish themselves — cash at the counter, or
 * a retry of the saved method. The gate code is issued here and only here.
 */
export async function completeMoveInAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { owner } = await requireOwner();
  const ctx = await ownedTenancy(owner.id, field(form, "tenancyId"));
  if (!ctx) return formError("That tenancy is not yours");
  const method = field(form, "method") === "cash" ? "cash" : "saved";
  try {
    const result = await completeMoveIn(ctx, owner.email, method);
    revalidatePath(`/units/${ctx.unit.id}`);
    revalidatePath("/map");
    if (!result.charged) return formError(result.message);
    return formOk(
      `${result.message} Gate code ${result.gateCode}.`,
      `/map?facility=${ctx.facility.id}&flipped=${ctx.unit.id}`,
    );
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not complete the move-in");
  }
}

/** A fresh move-in link, when the first one expired or went to the wrong number. */
export async function refreshMoveInLinkAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { owner } = await requireOwner();
  const ctx = await ownedTenancy(owner.id, field(form, "tenancyId"));
  if (!ctx) return formError("That tenancy is not yours");
  const token = await mintTenantToken(ctx.tenancy.id, ctx.tenancy.signedAt ? "pay" : "movein");
  await audit(owner.id, owner.email, "tenant_link.reissued", ctx.tenancy.id);
  revalidatePath(`/units/${ctx.unit.id}/move-in`);
  return formOk(tenantLinkUrl(token));
}

/* ----------------------------------------------------------------- ledger --- */

export async function recordPaymentAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { owner } = await requireOwner();
  const ctx = await ownedTenancy(owner.id, field(form, "tenancyId"));
  if (!ctx) return formError("That tenancy is not yours");

  let amountCents: number;
  try {
    amountCents = parseMoneyToCents(field(form, "amount"));
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Enter the amount received");
  }
  if (amountCents <= 0) return formError("A payment is a positive amount");

  const occurredOn = field(form, "occurredOn") || today();
  if (!isIsoDate(occurredOn)) return formError("Enter the date as YYYY-MM-DD");

  await post({
    tenancyId: ctx.tenancy.id,
    kind: "payment",
    amountCents: -amountCents,
    description: field(form, "description") || "Payment received at the counter",
    occurredOn,
  });

  const reversal = await reverseLadderIfPaid(ctx.tenancy.id, today());
  await audit(owner.id, owner.email, "ledger.payment", ctx.tenancy.id, { amountCents });

  revalidatePath(`/units/${ctx.unit.id}`);
  revalidatePath("/delinquency");
  revalidatePath("/map");

  const notes: string[] = [];
  if (reversal.overlockLifted) notes.push("overlock lifted and the gate code is live again");
  if (reversal.reversedRungs > 0) notes.push(`${reversal.reversedRungs} ladder step(s) reversed`);
  if (reversal.lienCaseResolved) notes.push("the lien case is resolved as paid");
  return formOk(
    notes.length > 0 ? `Payment recorded — ${notes.join(", ")}.` : "Payment recorded.",
    reversal.overlockLifted
      ? `/map?facility=${ctx.facility.id}&flipped=${ctx.unit.id}`
      : undefined,
  );
}

/** A correction. It is a new row and it is logged; nothing is ever edited. */
export async function postAdjustmentAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { owner } = await requireOwner();
  const ctx = await ownedTenancy(owner.id, field(form, "tenancyId"));
  if (!ctx) return formError("That tenancy is not yours");

  let amountCents: number;
  try {
    amountCents = parseMoneyToCents(field(form, "amount"));
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Enter the adjustment");
  }
  if (amountCents === 0) return formError("An adjustment of zero changes nothing");
  const description = field(form, "description");
  if (!description) return formError("Say what the adjustment is for — the packet prints it");

  await postAdjustment(owner.id, owner.email, {
    tenancyId: ctx.tenancy.id,
    amountCents,
    description,
    occurredOn: today(),
  });
  await reverseLadderIfPaid(ctx.tenancy.id, today());
  revalidatePath(`/units/${ctx.unit.id}`);
  return formOk("Adjustment posted as a new row.");
}

export async function generateStatementAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { owner } = await requireOwner();
  const ctx = await ownedTenancy(owner.id, field(form, "tenancyId"));
  if (!ctx) return formError("That tenancy is not yours");
  const window = defaultStatementWindow(today());
  const { r2Key } = await renderStatement(ctx, window.from, window.to);
  revalidatePath(`/units/${ctx.unit.id}`);
  return formOk(`Statement generated: ${r2Key.split("/").pop()}`);
}

/* ------------------------------------------------------------- gate codes --- */

export async function gateCodeAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { owner } = await requireOwner();
  const ctx = await ownedTenancy(owner.id, field(form, "tenancyId"));
  if (!ctx) return formError("That tenancy is not yours");
  const intent = field(form, "intent");

  if (intent === "reissue") {
    const code = await reissueGateCode(owner.id, owner.email, ctx.tenancy.id, ctx.facility.id);
    revalidatePath(`/units/${ctx.unit.id}`);
    return formOk(`New gate code ${code}. Export the CSV again for the keypad.`);
  }
  if (intent === "revoked" || intent === "active" || intent === "overlocked") {
    await setGateCodeStatus(owner.id, owner.email, ctx.tenancy.id, intent);
    revalidatePath(`/units/${ctx.unit.id}`);
    revalidatePath("/map");
    return formOk(
      intent === "revoked"
        ? "Code revoked. It will export as disabled."
        : intent === "overlocked"
          ? "Marked overlocked. The code exports as disabled until the balance clears."
          : "Code active again.",
    );
  }
  return formError("Unknown gate-code action");
}

/* --------------------------------------------------------------- move-out --- */

export async function moveOutAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { owner } = await requireOwner();
  const ctx = await ownedTenancy(owner.id, field(form, "tenancyId"));
  if (!ctx) return formError("That tenancy is not yours");

  const endedOn = field(form, "endedOn") || today();
  if (!isIsoDate(endedOn)) return formError("Enter the move-out date as YYYY-MM-DD");

  const makeReady: Record<string, boolean> = {};
  for (const item of MAKE_READY_ITEMS) makeReady[item] = checkbox(form, `mr_${item}`);

  try {
    const result = await moveOut(ctx, owner.email, endedOn, makeReady);
    revalidatePath("/map");
    revalidatePath(`/units/${ctx.unit.id}`);
    const tail =
      result.owedCents > 0
        ? `${(result.owedCents / 100).toFixed(2)} still owed`
        : result.refundDueCents > 0
          ? `${(result.refundDueCents / 100).toFixed(2)} to refund`
          : "square";
    return formOk(
      `Unit ${ctx.unit.label} is vacant. Final balance: ${tail}.`,
      `/map?facility=${ctx.facility.id}&flipped=${ctx.unit.id}`,
    );
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not complete the move-out");
  }
}

/** Money back to a tenant who left in credit. Posted as a refund row. */
export async function refundAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { owner } = await requireOwner();
  const ctx = await ownedTenancy(owner.id, field(form, "tenancyId"));
  if (!ctx) return formError("That tenancy is not yours");
  let amountCents: number;
  try {
    amountCents = parseMoneyToCents(field(form, "amount"));
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Enter the refund");
  }
  if (amountCents <= 0) return formError("A refund is a positive amount");
  await post({
    tenancyId: ctx.tenancy.id,
    kind: "refund",
    amountCents,
    description: field(form, "description") || "Refund issued to the tenant",
    occurredOn: today(),
  });
  await audit(owner.id, owner.email, "ledger.refund", ctx.tenancy.id, { amountCents });
  revalidatePath(`/units/${ctx.unit.id}`);
  return formOk("Refund recorded. The credit is cleared.");
}
