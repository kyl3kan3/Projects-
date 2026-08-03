"use server";

/**
 * Pursuit actions: stages, the scorecard, the requirement checklist, linking
 * library blocks, and the win/loss close.
 *
 * Each one gates on the response workspace (Pursuit and above) and on write
 * access, then scopes every query by firm. The scorecard's two entry points are
 * deliberately separate: saving is cheap and repeatable, deciding is permanent.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWrite } from "@/lib/auth";
import { hasResponseWorkspace } from "@/lib/plans";
import { readCriteria } from "@/lib/scorecard";
import {
  addRequirement,
  closePursuit,
  createManualPursuit,
  deleteRequirement,
  getScorecard,
  recordDecision,
  saveScorecard,
  setOwner,
  setRequirementStatus,
  setStage,
} from "@/lib/pursuits";
import { linkBlock, unlinkBlockUse } from "@/lib/library";
import { addDeadline, setDeadlineComplete } from "@/lib/deadlines";
import { parseFlexibleDate } from "@/lib/parse";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function required(formData: FormData, name: string): string {
  const value = field(formData, name);
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

/** Dollars in the form, integer cents in the column. */
function centsField(formData: FormData, name: string): number | null {
  const raw = field(formData, name).replace(/[$,\s]/g, "");
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

async function gate() {
  const ctx = await requireWrite();
  if (!hasResponseWorkspace(ctx.access.planId)) {
    redirect("/settings/billing?upgrade=workspace");
  }
  return ctx;
}

/** Read the `score_<key>` / `note_<key>` pairs the scorecard form submits. */
function criteriaFrom(formData: FormData, keys: string[]) {
  return keys.map((key) => {
    const raw = field(formData, `score_${key}`);
    const score = raw === "" ? null : Number(raw);
    return {
      key,
      score1to5: Number.isFinite(score) ? (score as number) : null,
      note: field(formData, `note_${key}`),
    };
  });
}

export async function createPursuitAction(formData: FormData): Promise<void> {
  const { firm, user } = await gate();
  const pursuit = await createManualPursuit({
    firmId: firm.id,
    actorUserId: user.id,
    title: required(formData, "title"),
    valueCents: centsField(formData, "valueCents"),
    proposalDueAt: parseFlexibleDate(field(formData, "proposalDueAt")),
  });
  revalidatePath("/pursuits");
  revalidatePath("/deadlines");
  redirect(`/pursuits/${pursuit.id}`);
}

export async function setStageAction(formData: FormData): Promise<void> {
  const { firm, user } = await gate();
  const pursuitId = required(formData, "pursuitId");
  await setStage({
    firmId: firm.id,
    actorUserId: user.id,
    pursuitId,
    stage: required(formData, "stage") as never,
  });
  revalidatePath(`/pursuits/${pursuitId}`);
  revalidatePath("/pursuits");
  revalidatePath("/reports");
}

export async function setOwnerAction(formData: FormData): Promise<void> {
  const { firm, user } = await gate();
  const pursuitId = required(formData, "pursuitId");
  const ownerUserId = field(formData, "ownerUserId");
  await setOwner({
    firmId: firm.id,
    actorUserId: user.id,
    pursuitId,
    ownerUserId: ownerUserId || null,
  });
  revalidatePath(`/pursuits/${pursuitId}`);
}

export async function saveScorecardAction(formData: FormData): Promise<void> {
  const { firm, user } = await gate();
  const pursuitId = required(formData, "pursuitId");
  const existing = await getScorecard(pursuitId);
  const keys = readCriteria(existing?.criteria ?? null).map((row) => row.key);
  await saveScorecard({
    firmId: firm.id,
    actorUserId: user.id,
    pursuitId,
    criteria: criteriaFrom(formData, keys),
  });
  revalidatePath(`/pursuits/${pursuitId}`);
}

/** Permanent: stamps who and when, moves the stage, and closes a no-bid. */
export async function recordDecisionAction(formData: FormData): Promise<void> {
  const { firm, user } = await gate();
  const pursuitId = required(formData, "pursuitId");
  const existing = await getScorecard(pursuitId);
  const keys = readCriteria(existing?.criteria ?? null).map((row) => row.key);
  await recordDecision({
    firmId: firm.id,
    actorUserId: user.id,
    pursuitId,
    criteria: criteriaFrom(formData, keys),
  });
  revalidatePath(`/pursuits/${pursuitId}`);
  revalidatePath("/pursuits");
  revalidatePath("/reports");
  revalidatePath("/deadlines");
}

export async function addRequirementAction(formData: FormData): Promise<void> {
  const { firm, user } = await gate();
  const pursuitId = required(formData, "pursuitId");
  await addRequirement({
    firmId: firm.id,
    actorUserId: user.id,
    pursuitId,
    label: required(formData, "label"),
    ownerUserId: field(formData, "ownerUserId") || null,
    dueAt: parseFlexibleDate(field(formData, "dueAt")),
  });
  revalidatePath(`/pursuits/${pursuitId}`);
}

export async function setRequirementStatusAction(formData: FormData): Promise<void> {
  const { firm } = await gate();
  const pursuitId = required(formData, "pursuitId");
  await setRequirementStatus({
    firmId: firm.id,
    requirementId: required(formData, "requirementId"),
    status: required(formData, "status") as never,
  });
  revalidatePath(`/pursuits/${pursuitId}`);
}

export async function deleteRequirementAction(formData: FormData): Promise<void> {
  const { firm } = await gate();
  const pursuitId = required(formData, "pursuitId");
  await deleteRequirement(firm.id, required(formData, "requirementId"));
  revalidatePath(`/pursuits/${pursuitId}`);
}

/** Link-and-snapshot: the block's body is frozen into this pursuit. */
export async function linkBlockAction(formData: FormData): Promise<void> {
  const { firm, user } = await gate();
  const pursuitId = required(formData, "pursuitId");
  await linkBlock({
    firmId: firm.id,
    timezone: firm.timezone,
    pursuitId,
    answerBlockId: required(formData, "answerBlockId"),
    requirementLabel: field(formData, "requirementLabel"),
    linkedByUserId: user.id,
  });
  revalidatePath(`/pursuits/${pursuitId}`);
}

export async function unlinkBlockAction(formData: FormData): Promise<void> {
  const { firm, user } = await gate();
  const pursuitId = required(formData, "pursuitId");
  await unlinkBlockUse({
    firmId: firm.id,
    actorUserId: user.id,
    blockUseId: required(formData, "blockUseId"),
  });
  revalidatePath(`/pursuits/${pursuitId}`);
}

export async function addPursuitDeadlineAction(formData: FormData): Promise<void> {
  const { firm } = await gate();
  const pursuitId = required(formData, "pursuitId");
  const dueAt = parseFlexibleDate(field(formData, "dueAt"));
  if (!dueAt) throw new Error("That date could not be read. Try 2026-03-21 or 03/21/2026 5:00 PM.");
  await addDeadline({
    firmId: firm.id,
    pursuitId,
    kind: (field(formData, "kind") || "custom") as never,
    label: required(formData, "label"),
    dueAt,
  });
  revalidatePath(`/pursuits/${pursuitId}`);
  revalidatePath("/deadlines");
}

export async function completeDeadlineAction(formData: FormData): Promise<void> {
  const { firm } = await gate();
  await setDeadlineComplete(
    firm.id,
    required(formData, "deadlineId"),
    field(formData, "complete") === "1",
  );
  const pursuitId = field(formData, "pursuitId");
  if (pursuitId) revalidatePath(`/pursuits/${pursuitId}`);
  revalidatePath("/deadlines");
}

/** Win/loss on close. A win flags every block it used `won_with`. */
export async function closePursuitAction(formData: FormData): Promise<void> {
  const { firm, user } = await gate();
  const pursuitId = required(formData, "pursuitId");
  const outcome = required(formData, "outcome");
  if (outcome !== "won" && outcome !== "lost") throw new Error("Outcome must be won or lost.");
  await closePursuit({
    firmId: firm.id,
    actorUserId: user.id,
    pursuitId,
    outcome,
    valueCents: centsField(formData, "valueCents"),
    note: field(formData, "note"),
  });
  revalidatePath(`/pursuits/${pursuitId}`);
  revalidatePath("/pursuits");
  revalidatePath("/library");
  revalidatePath("/reports");
}
