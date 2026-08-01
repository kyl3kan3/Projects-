"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ActionForm";
import { MoneyParseError } from "@/lib/format";
import {
  PortalError,
  askPortalQuestion,
  attachToPortalBid,
  declineFromPortal,
  portalRateLimit,
  removePortalAttachment,
  requirePortal,
  savePortalDraft,
  submitPortalBid,
  willBidFromPortal,
  type PortalBidInput,
} from "@/lib/portal";
import type { LineState } from "@/db/schema";

/**
 * Portal actions. Every one of them starts from the token in the form and nothing
 * else: `requirePortal` verifies the signature, looks up the invitation by id **and**
 * token hash, and returns a context whose ids all came out of that row.
 *
 * The form posts `formLineId` values, and those are the one thing here that comes
 * from the client. They are validated against the token's own package inside
 * `savePortalDraft`/`submitPortalBid` — an id belonging to another package is
 * dropped, not stored, not converted into a free-form row.
 */

function fail(err: unknown, fallback: string): ActionState {
  if (err instanceof PortalError || err instanceof MoneyParseError) return { error: err.message };
  console.error(fallback, err);
  return { error: fallback };
}

function readBid(form: FormData): PortalBidInput {
  const lines: PortalBidInput["lines"] = [];

  // Form lines: `line:<formLineId>` carries the amount, `state:<formLineId>` the
  // priced/excluded/included choice.
  for (const [key, value] of form.entries()) {
    const match = /^line:(.+)$/.exec(key);
    if (!match) continue;
    const formLineId = match[1];
    const stateRaw = String(form.get(`state:${formLineId}`) ?? "priced");
    const state: LineState =
      stateRaw === "excluded"
        ? "excluded"
        : stateRaw === "included_elsewhere"
          ? "included_elsewhere"
          : "priced";
    lines.push({
      formLineId,
      rawDescription: String(form.get(`desc:${formLineId}`) ?? ""),
      state,
      amount: String(value ?? ""),
    });
  }

  // Free-form rows the sub added: `extraDesc:<n>` / `extraAmount:<n>`.
  for (const [key, value] of form.entries()) {
    const match = /^extraDesc:(\d+)$/.exec(key);
    if (!match) continue;
    const description = String(value ?? "").trim();
    if (!description) continue;
    lines.push({
      formLineId: null,
      rawDescription: description,
      state: "priced",
      amount: String(form.get(`extraAmount:${match[1]}`) ?? ""),
    });
  }

  const chips = (name: string) =>
    String(form.get(name) ?? "")
      .split("\n")
      .flatMap((v) => v.split(","))
      .map((v) => v.trim())
      .filter(Boolean);

  return {
    kind: form.get("kind") === "lump_sum" ? "lump_sum" : "itemized",
    lines,
    lumpSumAmount: String(form.get("lumpSum") ?? ""),
    inclusions: chips("inclusions"),
    exclusions: chips("exclusions"),
    notes: String(form.get("notes") ?? "") || null,
  };
}

async function contextFor(form: FormData) {
  const token = String(form.get("token") ?? "");
  const ctx = await requirePortal(token);
  if (!portalRateLimit(ctx.invitationId)) {
    throw new PortalError("Too many requests from this link. Give it a minute.");
  }
  return { ctx, token };
}

/**
 * One action behind the bid form, with two submit buttons.
 *
 * "Save" and "Submit" have to see the *same* fields, so they are the same form and
 * the same action; the button's own `name="intent"` decides which. Two separate
 * forms would mean the save button posted an empty bid — quietly wiping what the sub
 * had typed, which is the one unforgivable bug on this screen.
 */
export async function bidFormAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const draft = form.get("intent") === "draft";
  try {
    const { ctx, token } = await contextFor(form);
    const input = readBid(form);
    if (draft) {
      await savePortalDraft(ctx, input);
      revalidatePath(`/bid/${token}`);
      return { ok: "Saved. Come back to this same link any time before the bid date." };
    }
    const result = await submitPortalBid(ctx, input);
    revalidatePath(`/bid/${token}`);
    return {
      ok:
        result.revision > 1
          ? `Revision ${result.revision} submitted. ${ctx.company.name} has it; the earlier version is kept on the record.`
          : `Bid submitted. ${ctx.company.name} has it.`,
    };
  } catch (err) {
    return fail(err, draft ? "Could not save your bid" : "Could not submit your bid");
  }
}

export async function declineAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { ctx, token } = await contextFor(form);
    await declineFromPortal(ctx, String(form.get("reason") ?? ""));
    revalidatePath(`/bid/${token}`);
    return { ok: "Thanks for telling us. That saves everyone a phone call." };
  } catch (err) {
    return fail(err, "Could not record that");
  }
}

export async function willBidAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { ctx, token } = await contextFor(form);
    await willBidFromPortal(ctx);
    revalidatePath(`/bid/${token}`);
    return { ok: "Marked as bidding. Take your time — the form saves as a draft." };
  } catch (err) {
    return fail(err, "Could not record that");
  }
}

export async function askQuestionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { ctx, token } = await contextFor(form);
    await askPortalQuestion(ctx, String(form.get("body") ?? ""));
    revalidatePath(`/bid/${token}`);
    return {
      ok: "Question sent. The answer goes to every bidder on this trade, so nobody gets an edge.",
    };
  } catch (err) {
    return fail(err, "Could not send your question");
  }
}

export async function attachAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { ctx, token } = await contextFor(form);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a file first" };
    await attachToPortalBid(ctx, {
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      data: Buffer.from(await file.arrayBuffer()),
    });
    revalidatePath(`/bid/${token}`);
    return { ok: `${file.name} attached to your bid` };
  } catch (err) {
    return fail(err, "Could not attach that file");
  }
}

export async function removeAttachmentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { ctx, token } = await contextFor(form);
    await removePortalAttachment(ctx, String(form.get("attachmentId") ?? ""));
    revalidatePath(`/bid/${token}`);
    return { ok: "Removed" };
  } catch (err) {
    return fail(err, "Could not remove that file");
  }
}
