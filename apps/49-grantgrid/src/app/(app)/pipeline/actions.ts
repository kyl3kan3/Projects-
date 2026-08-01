"use server";

/**
 * Pipeline and workspace mutations.
 *
 * Every action re-resolves the session and scopes its query by the caller's
 * organization id — an exported `"use server"` function is a public endpoint, and
 * an id arriving in a FormData field is a claim, not a fact.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isCivilDate } from "@/lib/dates";
import { parseDollarsToCents } from "@/lib/money";
import {
  addDeadline,
  completeDeadline,
  createGrant,
  deleteDeadline,
  deleteGrant,
  enterAward,
  moveStage,
  updateGrantFields,
} from "@/lib/grants";
import { isReportScheduleKey } from "@/lib/reminders";
import {
  addRequirement,
  deleteItem,
  linkAnswer,
  saveDraft,
  setItemStatus,
  unlinkAnswer,
} from "@/lib/workspace";
import type { DeadlineKind, GrantStage, WorkspaceStatus } from "@/db/schema";
import { STAGES } from "@/lib/stages";

export interface ActionState {
  error: string | null;
  ok?: boolean;
}

const OK: ActionState = { error: null, ok: true };

function str(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
}

function actorName(user: { name: string | null; email: string }): string {
  return user.name?.trim() || user.email.split("@")[0];
}

const DEADLINE_KINDS: DeadlineKind[] = ["loi", "application", "report", "renewal", "custom"];

function parseKind(value: string): DeadlineKind | null {
  return (DEADLINE_KINDS as string[]).includes(value) ? (value as DeadlineKind) : null;
}

function parseStage(value: string): GrantStage | null {
  return STAGES.some((s) => s.id === value) ? (value as GrantStage) : null;
}

/* ------------------------------------------------------------------ grants --- */

export async function createGrantAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { user, org } = await requireUser();
  const funderName = str(form, "funderName");
  if (!funderName) return { error: "Give the funder a name" };

  const askRaw = str(form, "askAmount");
  const askAmountCents = askRaw ? parseDollarsToCents(askRaw) : null;
  if (askRaw && askAmountCents === null) {
    return { error: `"${askRaw}" is not an amount I can read. Try 25,000 or 25k.` };
  }

  const dueOn = str(form, "dueOn");
  const kind = parseKind(str(form, "kind")) ?? "application";
  if (dueOn && !isCivilDate(dueOn)) return { error: "That date is not a real date" };

  const result = await createGrant(org, {
    organizationId: org.id,
    title: str(form, "title") || `${funderName} request`,
    funderName,
    askAmountCents,
    ownerUserId: user.id,
    notes: str(form, "notes") || null,
    source: "manual",
    actor: actorName(user),
  });
  if ("error" in result) return { error: result.error };

  if (dueOn) {
    await addDeadline(org.id, result.grant.id, { kind, dueOn }, actorName(user));
  }

  revalidatePath("/pipeline");
  revalidatePath("/calendar");
  redirect(`/pipeline/${result.grant.id}`);
}

export async function moveStageAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { user, org } = await requireUser();
  const grantId = str(form, "grantId");
  const stage = parseStage(str(form, "stage"));
  if (!grantId || !stage) return { error: "Pick a stage" };
  await moveStage(org.id, grantId, stage, actorName(user));
  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${grantId}`);
  return OK;
}

export async function updateGrantAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { user, org } = await requireUser();
  const grantId = str(form, "grantId");
  if (!grantId) return { error: "Missing grant" };

  const askRaw = str(form, "askAmount");
  const askAmountCents = askRaw ? parseDollarsToCents(askRaw) : null;
  if (askRaw && askAmountCents === null) {
    return { error: `"${askRaw}" is not an amount I can read. Try 25,000 or 25k.` };
  }

  await updateGrantFields(
    org.id,
    grantId,
    {
      title: str(form, "title") || undefined,
      funderName: str(form, "funderName") || undefined,
      askAmountCents,
      notes: str(form, "notes") || null,
    },
    actorName(user),
  );
  revalidatePath(`/pipeline/${grantId}`);
  revalidatePath("/pipeline");
  return OK;
}

export async function deleteGrantAction(form: FormData): Promise<void> {
  const { user, org } = await requireUser();
  const grantId = str(form, "grantId");
  if (!grantId) return;
  await deleteGrant(org.id, grantId, actorName(user));
  revalidatePath("/pipeline");
  revalidatePath("/calendar");
  redirect("/pipeline");
}

/* --------------------------------------------------------------- deadlines --- */

export async function addDeadlineAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { user, org } = await requireUser();
  const grantId = str(form, "grantId");
  const dueOn = str(form, "dueOn");
  const kind = parseKind(str(form, "kind"));
  if (!grantId || !kind) return { error: "Pick what kind of date this is" };
  if (!isCivilDate(dueOn)) return { error: "That date is not a real date" };

  await addDeadline(
    org.id,
    grantId,
    { kind, dueOn, label: str(form, "label") || undefined },
    actorName(user),
  );
  revalidatePath(`/pipeline/${grantId}`);
  revalidatePath("/pipeline");
  revalidatePath("/calendar");
  return OK;
}

export async function toggleDeadlineAction(form: FormData): Promise<void> {
  const { user, org } = await requireUser();
  const deadlineId = str(form, "deadlineId");
  const done = str(form, "done") === "1";
  if (!deadlineId) return;
  await completeDeadline(org.id, deadlineId, done, actorName(user));
  revalidatePath("/pipeline");
  revalidatePath("/calendar");
  const grantId = str(form, "grantId");
  if (grantId) revalidatePath(`/pipeline/${grantId}`);
}

export async function deleteDeadlineAction(form: FormData): Promise<void> {
  const { org } = await requireUser();
  const deadlineId = str(form, "deadlineId");
  if (!deadlineId) return;
  await deleteDeadline(org.id, deadlineId);
  revalidatePath("/pipeline");
  revalidatePath("/calendar");
  const grantId = str(form, "grantId");
  if (grantId) revalidatePath(`/pipeline/${grantId}`);
}

/* ------------------------------------------------------------------ awards --- */

export async function enterAwardAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { user, org } = await requireUser();
  const grantId = str(form, "grantId");
  const amount = parseDollarsToCents(str(form, "awardedAmount"));
  const awardedOn = str(form, "awardedOn");
  const schedule = str(form, "schedule");

  if (!grantId) return { error: "Missing grant" };
  if (amount === null) return { error: "Enter the award amount, e.g. 25,000" };
  if (!isCivilDate(awardedOn)) return { error: "When was it awarded?" };
  if (!isReportScheduleKey(schedule)) return { error: "Pick a report schedule" };

  await enterAward(
    org.id,
    grantId,
    {
      awardedAmountCents: amount,
      restrictions: str(form, "restrictions") || null,
      awardedOn,
      schedule,
    },
    actorName(user),
  );
  revalidatePath(`/pipeline/${grantId}`);
  revalidatePath("/pipeline");
  revalidatePath("/calendar");
  return OK;
}

/* --------------------------------------------------------------- workspace --- */

export async function addRequirementAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { org } = await requireUser();
  const grantId = str(form, "grantId");
  const requirement = str(form, "requirement");
  if (!grantId || !requirement) return { error: "What does the funder ask for?" };
  await addRequirement(org.id, grantId, requirement);
  revalidatePath(`/pipeline/${grantId}`);
  return OK;
}

export async function linkAnswerAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { user, org } = await requireUser();
  const itemId = str(form, "itemId");
  const answerId = str(form, "answerId");
  const grantId = str(form, "grantId");
  if (!itemId) return { error: "Missing checklist item" };
  if (!answerId) {
    await unlinkAnswer(org.id, itemId);
  } else {
    await linkAnswer(org.id, itemId, answerId, actorName(user));
  }
  revalidatePath(`/pipeline/${grantId}`);
  return OK;
}

export async function saveDraftAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { org } = await requireUser();
  const itemId = str(form, "itemId");
  const grantId = str(form, "grantId");
  const status = str(form, "status");
  const allowed: WorkspaceStatus[] = ["todo", "drafted", "final"];
  if (!itemId) return { error: "Missing checklist item" };
  const next = (allowed as string[]).includes(status)
    ? (status as WorkspaceStatus)
    : "drafted";
  await saveDraft(org.id, itemId, form.get("draftBody")?.toString() ?? "", next);
  revalidatePath(`/pipeline/${grantId}`);
  return OK;
}

export async function setItemStatusAction(form: FormData): Promise<void> {
  const { org } = await requireUser();
  const itemId = str(form, "itemId");
  const grantId = str(form, "grantId");
  const status = str(form, "status");
  const allowed: WorkspaceStatus[] = ["todo", "drafted", "final"];
  if (!itemId || !(allowed as string[]).includes(status)) return;
  await setItemStatus(org.id, itemId, status as WorkspaceStatus);
  revalidatePath(`/pipeline/${grantId}`);
}

export async function deleteItemAction(form: FormData): Promise<void> {
  const { org } = await requireUser();
  const itemId = str(form, "itemId");
  const grantId = str(form, "grantId");
  if (!itemId) return;
  await deleteItem(org.id, itemId);
  revalidatePath(`/pipeline/${grantId}`);
}
