"use server";

/**
 * PO draft actions: build, edit a quantity, send, dismiss. Four exports, four
 * controls on screen.
 */

import { revalidatePath } from "next/cache";
import { requireShop } from "@/lib/auth";
import { safeMessage } from "@/lib/errors";
import { buildDrafts, dismissDraft, sendDraft, setLineQty } from "@/lib/po";

export interface PoState {
  error: string | null;
  note: string | null;
}

export async function buildDraftsAction(
  _prev: PoState,
  _formData: FormData,
): Promise<PoState> {
  const { shop } = await requireShop();
  try {
    const result = await buildDrafts(shop);
    revalidatePath("/po");
    if (!result.drafts.length) {
      return {
        error: null,
        note:
          result.suppressed > 0
            ? `Nothing new to draft — ${result.suppressed} SKU${result.suppressed === 1 ? " is" : "s are"} covered by a PO you already sent.`
            : "Nothing needs ordering right now.",
      };
    }
    const lines = result.drafts.reduce((sum, d) => sum + d.lineCount, 0);
    return {
      error: null,
      note: `${result.drafts.length} draft${result.drafts.length === 1 ? "" : "s"}, ${lines} line${lines === 1 ? "" : "s"}${
        result.unassigned ? ` · ${result.unassigned} SKU${result.unassigned === 1 ? "" : "s"} with no supplier` : ""
      }`,
    };
  } catch (err) {
    return { error: safeMessage(err, "The drafts could not be built."), note: null };
  }
}

export async function setLineQtyAction(_prev: PoState, formData: FormData): Promise<PoState> {
  const { shop } = await requireShop();
  const draftId = String(formData.get("draftId") ?? "");
  const lineId = String(formData.get("lineId") ?? "");
  const qty = Number(formData.get("finalQty") ?? 0);
  try {
    const check = await setLineQty(shop, draftId, lineId, qty);
    revalidatePath("/po");
    return { error: null, note: check.messages.join(" ") || null };
  } catch (err) {
    return { error: safeMessage(err, "That quantity could not be saved."), note: null };
  }
}

export async function sendDraftAction(_prev: PoState, formData: FormData): Promise<PoState> {
  const { shop } = await requireShop();
  const draftId = String(formData.get("draftId") ?? "");
  try {
    const result = await sendDraft(shop, draftId);
    revalidatePath("/po");
    revalidatePath("/reorder");
    return {
      error: null,
      note: result.suppressed
        ? `Prepared for ${result.sentTo} — email is switched off on this deployment (DRY_RUN), so nothing was actually sent. The PO is marked sent and its SKUs are suppressed until ${result.suppressUntil.toISOString().slice(0, 10)}.`
        : `Sent to ${result.sentTo} · ${result.lineCount} lines`,
    };
  } catch (err) {
    return { error: safeMessage(err, "That PO could not be sent."), note: null };
  }
}

export async function dismissDraftAction(_prev: PoState, formData: FormData): Promise<PoState> {
  const { shop } = await requireShop();
  const draftId = String(formData.get("draftId") ?? "");
  try {
    await dismissDraft(shop, draftId);
    revalidatePath("/po");
    revalidatePath("/reorder");
    return { error: null, note: "Dismissed. Those SKUs will not be re-suggested for one lead time." };
  } catch (err) {
    return { error: safeMessage(err, "That PO could not be dismissed."), note: null };
  }
}
