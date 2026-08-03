"use server";

import { revalidatePath } from "next/cache";
import { requireOnboardedUser } from "@/lib/auth";
import {
  addLineItem,
  duplicateEstimate,
  removeLineItem,
  updateEstimateSettings,
  updateLineItem,
} from "@/lib/estimates";
import { parseAmountToCents, parseQuantityToMilli } from "@/lib/money";
import { sendProposal } from "@/lib/proposals";
import type { DepositType, Unit } from "@/db/schema";

export interface EditState {
  error?: string;
  ok?: boolean;
}

/**
 * Every exported function in this file is a public endpoint, so each one starts by
 * resolving the session and scoping the write to that org — the id in the form is
 * never trusted on its own.
 */

export async function updateLineAction(
  estimateId: string,
  lineId: string,
  values: { name: string; quantity: string; unitPrice: string },
): Promise<EditState> {
  const { org, user } = await requireOnboardedUser();
  const quantityMilli = parseQuantityToMilli(values.quantity);
  const unitPriceCents = parseAmountToCents(values.unitPrice);
  if (quantityMilli === null || quantityMilli <= 0) {
    return { error: "Enter a quantity, like 2 or 2.5." };
  }
  if (unitPriceCents === null || unitPriceCents < 0) {
    return { error: "Enter a price, like 1450 or 1,450.00." };
  }
  const result = await updateLineItem(org, user.id, estimateId, lineId, {
    name: values.name,
    quantityMilli,
    unitPriceCents,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath(`/estimates/${estimateId}`);
  return { ok: true };
}

export async function addLineAction(
  estimateId: string,
  values: { name: string; quantity: string; unitPrice: string; unit: Unit },
): Promise<EditState> {
  const { org, user } = await requireOnboardedUser();
  const quantityMilli = parseQuantityToMilli(values.quantity) ?? 1000;
  const unitPriceCents = parseAmountToCents(values.unitPrice);
  if (unitPriceCents === null || unitPriceCents < 0) {
    return { error: "Enter a price for the new line." };
  }
  const result = await addLineItem(org, user.id, estimateId, {
    name: values.name,
    quantityMilli,
    unitPriceCents,
    unit: values.unit,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath(`/estimates/${estimateId}`);
  return { ok: true };
}

export async function removeLineAction(estimateId: string, lineId: string): Promise<EditState> {
  const { org, user } = await requireOnboardedUser();
  const result = await removeLineItem(org, user.id, estimateId, lineId);
  if (!result.ok) return { error: result.error };
  revalidatePath(`/estimates/${estimateId}`);
  return { ok: true };
}

export async function updateSettingsAction(
  estimateId: string,
  values: { taxRatePct: string; depositType: DepositType; depositValue: string },
): Promise<EditState> {
  const { org, user } = await requireOnboardedUser();
  const taxPct = Number(values.taxRatePct);
  if (!Number.isFinite(taxPct) || taxPct < 0 || taxPct > 25) {
    return { error: "Sales tax should be a percentage between 0 and 25." };
  }
  const depositValue =
    values.depositType === "fixed"
      ? (parseAmountToCents(values.depositValue) ?? 0)
      : Math.max(0, Math.min(100, Number(values.depositValue) || 0));
  const result = await updateEstimateSettings(org, user.id, estimateId, {
    taxRateBp: Math.round(taxPct * 100),
    depositType: values.depositType,
    depositValue,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath(`/estimates/${estimateId}`);
  return { ok: true };
}

export interface SendState {
  error?: string;
  url?: string;
  emailed?: boolean;
  emailError?: string;
  proposalId?: string;
}

export async function sendProposalAction(estimateId: string): Promise<SendState> {
  const { org, user } = await requireOnboardedUser();
  const result = await sendProposal(org, user.id, estimateId);
  if (!result.ok) return { error: result.error };
  revalidatePath(`/estimates/${estimateId}`);
  revalidatePath("/jobs");
  revalidatePath("/proposals");
  return {
    url: result.url,
    emailed: result.emailed,
    emailError: result.emailError,
    proposalId: result.proposalId,
  };
}

export async function duplicateEstimateAction(
  estimateId: string,
): Promise<{ estimateId?: string; error?: string }> {
  const { org, user } = await requireOnboardedUser();
  const result = await duplicateEstimate(org, user.id, estimateId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/jobs");
  return { estimateId: result.estimateId };
}
