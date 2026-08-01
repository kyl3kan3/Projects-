"use server";

import { revalidatePath } from "next/cache";
import { requireFirm } from "@/lib/auth";
import { approveAll, approveMessage, declineMessage } from "@/lib/sequences";

export interface ApprovalActionState {
  error?: string;
  notice?: string;
}

function revalidate() {
  revalidatePath("/approvals");
  revalidatePath("/aging");
}

export async function approveOneAction(
  _prev: ApprovalActionState,
  formData: FormData,
): Promise<ApprovalActionState> {
  const { firm, user } = await requireFirm();
  const messageId = String(formData.get("messageId") ?? "");
  const result = await approveMessage(firm.id, messageId, user.id);
  revalidate();
  if (!result.ok) {
    const reasons: Record<string, string> = {
      not_found: "That send is no longer in the tray.",
      already_handled: "Someone has already handled that one.",
      settled: "Dropped: the client paid before you approved it.",
    };
    return { error: reasons[result.reason] ?? "Could not approve that send." };
  }
  return {
    notice: result.delivered
      ? "Sent."
      : `Recorded, but not delivered: ${result.error ?? "the mail provider is not configured"}.`,
  };
}

export async function declineOneAction(
  _prev: ApprovalActionState,
  formData: FormData,
): Promise<ApprovalActionState> {
  const { firm, user } = await requireFirm();
  const messageId = String(formData.get("messageId") ?? "");
  const ok = await declineMessage(firm.id, messageId, user.id);
  revalidate();
  return ok
    ? { notice: "Skipped. The ladder moves on; this rung will not come back." }
    : { error: "That send is no longer in the tray." };
}

export async function approveAllAction(
  _prev: ApprovalActionState,
  _formData: FormData,
): Promise<ApprovalActionState> {
  const { firm, user } = await requireFirm();
  const result = await approveAll(firm.id, user.id);
  revalidate();
  if (result.approved === 0 && result.skipped === 0) return { error: "Nothing was waiting." };
  const parts = [`${result.approved} approved`];
  if (result.delivered !== result.approved) parts.push(`${result.delivered} delivered`);
  if (result.skipped > 0) parts.push(`${result.skipped} dropped (already settled)`);
  return { notice: `${parts.join(" · ")}.` };
}
