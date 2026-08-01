"use server";

import { revalidatePath } from "next/cache";
import { requireFirm } from "@/lib/auth";
import { markDisputed, writeOffInvoice } from "@/lib/invoices";
import { logPromise } from "@/lib/promises";
import { resumeRun, sendNextStepNow, stopRun } from "@/lib/sequences";
import { audit } from "@/lib/audit";

export interface InvoiceActionState {
  error?: string;
  notice?: string;
}

function revalidate(invoiceId: string) {
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/aging");
  revalidatePath("/promises");
  revalidatePath("/approvals");
  revalidatePath("/forecast");
}

export async function logPromiseAction(
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const { firm, user } = await requireFirm();
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const promisedFor = String(formData.get("promisedFor") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  const result = await logPromise({
    firmId: firm.id,
    invoiceId,
    promisedFor,
    source: "manual",
    note: note || undefined,
    actor: user.id,
  });
  revalidate(invoiceId);
  return result.ok
    ? { notice: `Logged. Follow-up is paused until ${promisedFor}, then resumes one step firmer if it is missed.` }
    : { error: result.reason };
}

export async function sendNextStepAction(
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const { firm, user } = await requireFirm();
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const result = await sendNextStepNow(firm.id, invoiceId, user.id);
  revalidate(invoiceId);
  if (!result.ok) return { error: result.reason };
  if (result.outcome.outcome === "sent") {
    return {
      notice: result.outcome.delivered
        ? "Sent."
        : `Recorded, but not delivered: ${result.outcome.error ?? "the mail provider is not configured"}.`,
    };
  }
  if (result.outcome.outcome === "no_recipient") {
    return { error: "This client has no email address on file." };
  }
  if (result.outcome.outcome === "already_claimed") {
    return { error: "That step has already gone out." };
  }
  return { notice: "Queued for approval." };
}

export async function pauseRunAction(
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const { firm, user } = await requireFirm();
  const invoiceId = String(formData.get("invoiceId") ?? "");
  await stopRun(invoiceId, "stopped by the firm");
  await audit(firm.id, user.id, "sequence_stopped", invoiceId);
  revalidate(invoiceId);
  return { notice: "Stopped. Nothing further will be sent on this invoice." };
}

export async function resumeRunAction(
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const { firm, user } = await requireFirm();
  const invoiceId = String(formData.get("invoiceId") ?? "");
  await resumeRun(firm.id, invoiceId, user.id);
  revalidate(invoiceId);
  return { notice: "Resumed at the next pinned step." };
}

export async function writeOffAction(
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const { firm, user } = await requireFirm();
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || "Written off by the firm";
  await writeOffInvoice(firm.id, invoiceId, reason, user.id);
  revalidate(invoiceId);
  return { notice: "Written off. It leaves the aging report and the forecast." };
}

export async function disputeAction(
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const { firm, user } = await requireFirm();
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const note = String(formData.get("note") ?? "").trim() || "Disputed";
  await markDisputed(firm.id, invoiceId, note, user.id);
  revalidate(invoiceId);
  return { notice: "Marked disputed. Follow-up stops until you resolve it." };
}
