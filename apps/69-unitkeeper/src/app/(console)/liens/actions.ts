"use server";

/**
 * Lien-case actions. Every one of them is a decision with legal consequences, so
 * every one of them is the owner's: the engine computes dates, generates documents
 * and refuses early steps. It never advances a case on its own.
 */

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { lienCases } from "@/db/schema";
import { requireOwner } from "@/lib/auth";
import { renderLienNotice, renderLienPacket } from "@/lib/docs";
import { field, formError, formOk, type FormState } from "@/lib/form";
import { canUseLienEngine } from "@/lib/plans";
import { delinquencyFor } from "@/lib/ledger";
import {
  attachNotice,
  caseById,
  completeStep,
  HardStopError,
  ManualModeError,
  openLienCase,
  packOfRow,
  resolveCase,
} from "@/lib/lien";
import { manualModeSentence } from "@/lib/lien-rules";
import { isoDateOf } from "@/lib/money";
import { markNoticeSent } from "@/lib/notices";
import { ownedTenancy } from "@/lib/tenancy";

export async function openLienCaseAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { owner, ent } = await requireOwner();
  const gate = canUseLienEngine(ent);
  if (!gate.allowed) return formError(gate.reason ?? "The lien engine is not on your plan");

  const ctx = await ownedTenancy(owner.id, field(form, "tenancyId"));
  if (!ctx) return formError("That tenancy is not yours");

  const asOf = isoDateOf(new Date());
  const delq = await delinquencyFor(ctx.tenancy.id, asOf);
  if (delq.since === null || delq.outstandingCents <= 0) {
    return formError("Nothing is owed on this unit, so there is no lien to claim");
  }

  try {
    const { lienCaseId } = await openLienCase(
      owner.id,
      owner.email,
      ctx.tenancy.id,
      ctx.facility.state,
      delq.since,
    );
    revalidatePath("/delinquency");
    revalidatePath("/liens");
    return formOk("Lien case opened. Nothing has been sent yet.", `/liens/${lienCaseId}`);
  } catch (err) {
    if (err instanceof ManualModeError) return formError(manualModeSentence(err.message));
    return formError(err instanceof Error ? err.message : "Could not open the case");
  }
}

/**
 * Generate the notice for a step. Deliberately separate from completing the step:
 * a PDF on a screen is not a document in the mail, and only the owner knows when it
 * actually went.
 */
export async function generateLienNoticeAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { owner, ent } = await requireOwner();
  const gate = canUseLienEngine(ent);
  if (!gate.allowed) return formError(gate.reason ?? "The lien engine is not on your plan");

  const lienCaseId = field(form, "lienCaseId");
  const stepKey = field(form, "stepKey");
  const found = await caseById(lienCaseId);
  if (!found) return formError("That lien case no longer exists");
  const ctx = await ownedTenancy(owner.id, found.lienCase.tenancyId);
  if (!ctx) return formError("That lien case is not yours");

  const delq = await delinquencyFor(ctx.tenancy.id, isoDateOf(new Date()));
  const { r2Key } = await renderLienNotice(
    ctx,
    lienCaseId,
    found.timeline,
    stepKey,
    delq.outstandingCents,
  );
  await attachNotice(lienCaseId, stepKey, r2Key);
  revalidatePath(`/liens/${lienCaseId}`);
  return formOk("Notice generated. Print it, mail it certified, then record the tracking number.");
}

export async function completeLienStepAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { owner, ent } = await requireOwner();
  const gate = canUseLienEngine(ent);
  if (!gate.allowed) return formError(gate.reason ?? "The lien engine is not on your plan");

  const lienCaseId = field(form, "lienCaseId");
  const stepKey = field(form, "stepKey");
  const trackingNumber = field(form, "trackingNumber");
  const found = await caseById(lienCaseId);
  if (!found) return formError("That lien case no longer exists");
  const ctx = await ownedTenancy(owner.id, found.lienCase.tenancyId);
  if (!ctx) return formError("That lien case is not yours");

  const step = found.timeline.steps.find((s) => s.key === stepKey);
  if (step?.requires.includes("certified_mail") && !trackingNumber) {
    return formError(
      "This step requires certified mail. Enter the tracking number — the receipt is the proof the notice was sent.",
    );
  }

  try {
    await completeStep(owner.id, owner.email, lienCaseId, stepKey, {
      trackingNumber: trackingNumber || undefined,
    });
  } catch (err) {
    if (err instanceof HardStopError) return formError(err.message);
    return formError(err instanceof Error ? err.message : "Could not record that step");
  }

  if (step?.noticeR2Key) {
    const notices = await import("@/lib/notices").then((m) => m.noticesForCase(lienCaseId));
    const match = notices.find((n) => n.r2Key === step.noticeR2Key);
    if (match) {
      await markNoticeSent(match.id, { certified: true, trackingNumber: trackingNumber || undefined });
    }
  }

  revalidatePath(`/liens/${lienCaseId}`);
  revalidatePath("/liens");
  return formOk("Recorded. The next step's date is computed from today, not from the due date.");
}

export async function generatePacketAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { owner, ent } = await requireOwner();
  const gate = canUseLienEngine(ent);
  if (!gate.allowed) return formError(gate.reason ?? "The lien engine is not on your plan");

  const lienCaseId = field(form, "lienCaseId");
  const found = await caseById(lienCaseId);
  if (!found) return formError("That lien case no longer exists");
  const ctx = await ownedTenancy(owner.id, found.lienCase.tenancyId);
  if (!ctx) return formError("That lien case is not yours");

  const { r2Key, noticeCount } = await renderLienPacket(
    ctx,
    found.lienCase,
    packOfRow(found.rule),
  );
  await getDb()
    .update(lienCases)
    .set({ updatedAt: new Date() })
    .where(eq(lienCases.id, lienCaseId));
  revalidatePath(`/liens/${lienCaseId}`);
  return formOk(
    `Packet built with ${noticeCount} notice${noticeCount === 1 ? "" : "s"} plus the full ledger: /api/documents/${r2Key}`,
  );
}

export async function resolveCaseAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { owner } = await requireOwner();
  const lienCaseId = field(form, "lienCaseId");
  const reason = field(form, "reason");
  if (!["paid", "vacated", "sold", "error"].includes(reason)) {
    return formError("Pick why the case is closing");
  }
  const found = await caseById(lienCaseId);
  if (!found) return formError("That lien case no longer exists");
  const ctx = await ownedTenancy(owner.id, found.lienCase.tenancyId);
  if (!ctx) return formError("That lien case is not yours");

  await resolveCase(owner.id, owner.email, lienCaseId, reason as "paid" | "vacated" | "sold" | "error");
  revalidatePath("/liens");
  revalidatePath(`/liens/${lienCaseId}`);
  return formOk("Case closed. The file stays; nothing is deleted.", "/liens");
}
