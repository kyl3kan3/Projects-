"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEstimator, AuthError } from "@/lib/auth";
import type { ActionState } from "@/components/ActionForm";
import {
  ProjectError,
  addFormLine,
  createPackage,
  createProject,
  deleteFormLine,
  getPackage,
  updatePackage,
  updateProject,
} from "@/lib/projects";
import {
  InviteError,
  freshLinkFor,
  nudgeInvitations,
  revokeInvitation,
  sendInvites,
  transcribeBid,
} from "@/lib/invites";
import { QuestionError, answerQuestion } from "@/lib/questions";
import { AdjustmentError, addAdjustment, removeAdjustment } from "@/lib/leveling-data";
import { AwardError, awardPackage, unawardPackage } from "@/lib/award";
import { MappingError, mapTrayLine, unmapTrayLine } from "@/lib/mapping";
import { PlanFileError, deletePlanFile, uploadPlanFile } from "@/lib/plan-files";
import { MoneyParseError, parseMoneyToCents } from "@/lib/format";

/**
 * Every exported function in this file is a public endpoint reachable by anyone who
 * can guess its id — so every one of them starts with `requireEstimator()`, which
 * resolves the company from the session cookie, and passes `ctx.company.id` into a
 * service that scopes by it. Nothing here trusts a company id, project id or bid id
 * from the form as proof of anything.
 *
 * There are no unused actions in this file. An exported action nothing calls is
 * attack surface, not dead code.
 */

function actor(ctx: Awaited<ReturnType<typeof requireEstimator>>) {
  return { userId: ctx.user.id, label: ctx.user.email };
}

function fail(err: unknown, fallback: string): ActionState {
  if (
    err instanceof ProjectError ||
    err instanceof InviteError ||
    err instanceof QuestionError ||
    err instanceof AdjustmentError ||
    err instanceof AwardError ||
    err instanceof MappingError ||
    err instanceof PlanFileError ||
    err instanceof MoneyParseError ||
    err instanceof AuthError
  ) {
    return { error: err.message };
  }
  console.error(fallback, err);
  return { error: fallback };
}

/* ---------------------------------------------------------------- projects --- */

export async function createProjectAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const ctx = await requireEstimator();
    const dueRaw = String(form.get("bidDueAt") ?? "");
    // A date input gives a local calendar day; bids are due at 5pm on it, which is
    // what every invitation email is going to say.
    const project = await createProject(ctx.company.id, ctx.company.plan, actor(ctx), {
      name: String(form.get("name") ?? ""),
      address: String(form.get("address") ?? "") || null,
      bidDueAt: new Date(`${dueRaw}T17:00:00Z`),
      notes: String(form.get("notes") ?? "") || null,
    });
    id = project.id;
  } catch (err) {
    return fail(err, "Could not create the project");
  }
  redirect(`/projects/${id}`);
}

export async function updateProjectAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireEstimator();
    const projectId = String(form.get("projectId") ?? "");
    const dueRaw = String(form.get("bidDueAt") ?? "");
    await updateProject(ctx.company.id, projectId, {
      name: String(form.get("name") ?? ""),
      address: String(form.get("address") ?? "") || null,
      ...(dueRaw ? { bidDueAt: new Date(`${dueRaw}T17:00:00Z`) } : {}),
      notes: String(form.get("notes") ?? "") || null,
    });
    revalidatePath(`/projects/${projectId}`);
    return { ok: "Project updated" };
  } catch (err) {
    return fail(err, "Could not update the project");
  }
}

export async function archiveProjectAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireEstimator();
    const projectId = String(form.get("projectId") ?? "");
    await updateProject(ctx.company.id, projectId, { status: "archived" });
    revalidatePath("/projects");
    return { ok: "Archived — it no longer counts against your plan" };
  } catch (err) {
    return fail(err, "Could not archive the project");
  }
}

/* ---------------------------------------------------------------- packages --- */

export async function createPackageAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireEstimator();
    const projectId = String(form.get("projectId") ?? "");
    const pkg = await createPackage(ctx.company.id, projectId, actor(ctx), {
      csiDivision: String(form.get("csiDivision") ?? ""),
      scopeNotes: String(form.get("scopeNotes") ?? "") || null,
      seedForm: form.get("seedForm") === "on",
    });
    revalidatePath(`/projects/${projectId}`);
    return { ok: `${pkg.tradeLabel} package added` };
  } catch (err) {
    return fail(err, "Could not add the package");
  }
}

export async function updatePackageAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireEstimator();
    const packageId = String(form.get("packageId") ?? "");
    const owned = await getPackage(ctx.company.id, packageId);
    if (!owned) return { error: "That package no longer exists" };
    await updatePackage(ctx.company.id, packageId, {
      tradeLabel: String(form.get("tradeLabel") ?? owned.pkg.tradeLabel),
      scopeNotes: String(form.get("scopeNotes") ?? "") || null,
    });
    revalidatePath(`/projects/${owned.project.id}/packages/${packageId}`);
    return { ok: "Scope updated — bidders see it on their next visit" };
  } catch (err) {
    return fail(err, "Could not update the package");
  }
}

export async function closePackageAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireEstimator();
    const packageId = String(form.get("packageId") ?? "");
    const owned = await getPackage(ctx.company.id, packageId);
    if (!owned) return { error: "That package no longer exists" };
    const reopen = owned.pkg.status === "closed";
    await updatePackage(ctx.company.id, packageId, { status: reopen ? "open" : "closed" });
    revalidatePath(`/projects/${owned.project.id}/packages/${packageId}`);
    return {
      ok: reopen ? "Reopened — the portal accepts bids again" : "Closed to new bids",
    };
  } catch (err) {
    return fail(err, "Could not change the package");
  }
}

/* --------------------------------------------------------------- bid form --- */

export async function addFormLineAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireEstimator();
    const packageId = String(form.get("packageId") ?? "");
    await addFormLine(ctx.company.id, packageId, {
      description: String(form.get("description") ?? ""),
      unit: String(form.get("unit") ?? "") || null,
      quantity: String(form.get("quantity") ?? "") || null,
      isAlternate: form.get("isAlternate") === "on",
      isAllowance: form.get("isAllowance") === "on",
    });
    const owned = await getPackage(ctx.company.id, packageId);
    revalidatePath(`/projects/${owned?.project.id}/packages/${packageId}`);
    return { ok: "Line added to the bid form" };
  } catch (err) {
    return fail(err, "Could not add the line");
  }
}

export async function deleteFormLineAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireEstimator();
    const packageId = String(form.get("packageId") ?? "");
    await deleteFormLine(ctx.company.id, packageId, String(form.get("formLineId") ?? ""));
    const owned = await getPackage(ctx.company.id, packageId);
    revalidatePath(`/projects/${owned?.project.id}/packages/${packageId}`);
    return { ok: "Line removed" };
  } catch (err) {
    return fail(err, "Could not remove the line");
  }
}

/* ---------------------------------------------------------------- invites --- */

export async function sendInvitesAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireEstimator();
    const packageId = String(form.get("packageId") ?? "");
    const result = await sendInvites(ctx.company.id, actor(ctx), {
      packageId,
      subContactIds: form.getAll("subContactId").map(String),
      personalNote: String(form.get("personalNote") ?? "") || null,
    });
    const owned = await getPackage(ctx.company.id, packageId);
    revalidatePath(`/projects/${owned?.project.id}/packages/${packageId}`);
    return {
      ok:
        result.sent > 0
          ? `${result.sent} invite${result.sent === 1 ? "" : "s"} sent${result.skipped ? `, ${result.skipped} already invited` : ""}`
          : "Everyone picked was already invited",
    };
  } catch (err) {
    return fail(err, "Could not send the invites");
  }
}

export async function nudgeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const ctx = await requireEstimator();
    const packageId = String(form.get("packageId") ?? "");
    const result = await nudgeInvitations(ctx.company.id, actor(ctx), packageId);
    revalidatePath(`/projects/${String(form.get("projectId"))}/packages/${packageId}`);
    if (result.sent === 0 && result.skipped > 0) {
      return { ok: "Already nudged today — they get one reminder a day at most" };
    }
    return {
      ok:
        result.sent > 0
          ? `Reminder sent to ${result.sent} bidder${result.sent === 1 ? "" : "s"}`
          : "Nobody left to remind",
    };
  } catch (err) {
    return fail(err, "Could not send the reminders");
  }
}

export async function revokeInviteAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireEstimator();
    await revokeInvitation(ctx.company.id, actor(ctx), String(form.get("invitationId") ?? ""));
    revalidatePath(`/projects/${String(form.get("projectId"))}/packages/${String(form.get("packageId"))}`);
    return { ok: "Link withdrawn — it stops working immediately" };
  } catch (err) {
    return fail(err, "Could not withdraw the link");
  }
}

export async function freshLinkAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const ctx = await requireEstimator();
    const url = await freshLinkFor(ctx.company.id, String(form.get("invitationId") ?? ""));
    if (!url) return { error: "That invitation is not yours" };
    return { ok: "Fresh link — text it to them. The previous one no longer works.", detail: url };
  } catch (err) {
    return fail(err, "Could not mint a link");
  }
}

export async function transcribeBidAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireEstimator();
    const packageId = String(form.get("packageId") ?? "");
    const owned = await getPackage(ctx.company.id, packageId);
    if (!owned) return { error: "That package no longer exists" };

    const kind = form.get("kind") === "lump_sum" ? "lump_sum" : "itemized";
    const lines: { bidFormLineId: string; amountCents: number | null; excluded: boolean }[] = [];
    for (const [key, value] of form.entries()) {
      const match = /^amount:(.+)$/.exec(key);
      if (!match) continue;
      const excluded = form.get(`excluded:${match[1]}`) === "on";
      const cents = excluded ? null : parseMoneyToCents(String(value));
      if (!excluded && cents === null) continue;
      lines.push({ bidFormLineId: match[1], amountCents: cents, excluded });
    }

    await transcribeBid(ctx.company.id, actor(ctx), {
      invitationId: String(form.get("invitationId") ?? ""),
      kind,
      lumpSumCents: parseMoneyToCents(String(form.get("lumpSum") ?? "")),
      lines,
      notes: String(form.get("notes") ?? "") || null,
    });
    revalidatePath(`/projects/${owned.project.id}/packages/${packageId}`);
    revalidatePath(`/projects/${owned.project.id}/packages/${packageId}/leveling`);
    return { ok: "Transcribed — it is on the leveling grid, marked as entered by you" };
  } catch (err) {
    return fail(err, "Could not transcribe the bid");
  }
}

/* -------------------------------------------------------------------- Q&A --- */

export async function answerQuestionAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireEstimator();
    const result = await answerQuestion(ctx.company.id, actor(ctx), {
      questionId: String(form.get("questionId") ?? ""),
      answer: String(form.get("answer") ?? ""),
      broadcast: form.get("broadcast") !== "off",
    });
    revalidatePath(
      `/projects/${String(form.get("projectId"))}/packages/${String(form.get("packageId"))}`,
    );
    return {
      ok:
        result.notified > 0
          ? `Answered and broadcast to ${result.notified} bidder${result.notified === 1 ? "" : "s"}`
          : "Answered",
    };
  } catch (err) {
    return fail(err, "Could not post the answer");
  }
}

/* ------------------------------------------------------------- leveling --- */

export async function addAdjustmentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireEstimator();
    const packageId = String(form.get("packageId") ?? "");
    const kindRaw = String(form.get("kind") ?? "plug");
    const kind = kindRaw === "normalize" || kindRaw === "scope_add" ? kindRaw : "plug";
    const cents = parseMoneyToCents(String(form.get("amount") ?? ""));
    if (cents === null) return { error: "Enter an amount" };

    await addAdjustment(ctx.company.id, actor(ctx), {
      packageId,
      bidId: String(form.get("bidId") ?? "") || null,
      bidFormLineId: String(form.get("bidFormLineId") ?? "") || null,
      kind,
      amountCents: cents,
      reason: String(form.get("reason") ?? ""),
    });
    const owned = await getPackage(ctx.company.id, packageId);
    revalidatePath(`/projects/${owned?.project.id}/packages/${packageId}/leveling`);
    return { ok: kind === "plug" ? "Plug applied and footnoted" : "Adjustment applied" };
  } catch (err) {
    return fail(err, "Could not apply the adjustment");
  }
}

export async function removeAdjustmentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireEstimator();
    await removeAdjustment(ctx.company.id, actor(ctx), String(form.get("adjustmentId") ?? ""));
    revalidatePath(
      `/projects/${String(form.get("projectId"))}/packages/${String(form.get("packageId"))}/leveling`,
    );
    return { ok: "Adjustment removed" };
  } catch (err) {
    return fail(err, "Could not remove the adjustment");
  }
}

export async function mapLineAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const ctx = await requireEstimator();
    const packageId = String(form.get("packageId") ?? "");
    await mapTrayLine({
      companyId: ctx.company.id,
      userId: ctx.user.id,
      tradePackageId: packageId,
      bidLineId: String(form.get("bidLineId") ?? ""),
      bidFormLineId: String(form.get("bidFormLineId") ?? ""),
      remember: form.get("remember") !== "off",
    });
    const owned = await getPackage(ctx.company.id, packageId);
    revalidatePath(`/projects/${owned?.project.id}/packages/${packageId}/leveling`);
    return { ok: "Mapped — remembered for this sub's next project" };
  } catch (err) {
    return fail(err, "Could not map the line");
  }
}

export async function unmapLineAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const ctx = await requireEstimator();
    const packageId = String(form.get("packageId") ?? "");
    await unmapTrayLine({
      companyId: ctx.company.id,
      userId: ctx.user.id,
      tradePackageId: packageId,
      bidLineId: String(form.get("bidLineId") ?? ""),
    });
    const owned = await getPackage(ctx.company.id, packageId);
    revalidatePath(`/projects/${owned?.project.id}/packages/${packageId}/leveling`);
    return { ok: "Back in the tray, and the remembered mapping is forgotten" };
  } catch (err) {
    return fail(err, "Could not unmap the line");
  }
}

/* ------------------------------------------------------------------ award --- */

export async function awardPackageAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireEstimator();
    const packageId = String(form.get("packageId") ?? "");
    const result = await awardPackage(ctx.company.id, actor(ctx), {
      packageId,
      bidId: String(form.get("bidId") ?? ""),
      note: String(form.get("note") ?? "") || null,
      acknowledgedWarnings: Number(form.get("warningCount") ?? -1),
      sendRegrets: form.get("sendRegrets") !== "off",
    });
    const owned = await getPackage(ctx.company.id, packageId);
    revalidatePath(`/projects/${owned?.project.id}/packages/${packageId}/leveling`);
    revalidatePath(`/projects/${owned?.project.id}`);
    return {
      ok: `Awarded. ${result.awardEmails} award notice and ${result.regretEmails} regret notice${result.regretEmails === 1 ? "" : "s"} sent.`,
    };
  } catch (err) {
    return fail(err, "Could not award the package");
  }
}

export async function unawardPackageAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireEstimator();
    const packageId = String(form.get("packageId") ?? "");
    await unawardPackage(ctx.company.id, actor(ctx), {
      packageId,
      reason: String(form.get("reason") ?? ""),
    });
    const owned = await getPackage(ctx.company.id, packageId);
    revalidatePath(`/projects/${owned?.project.id}/packages/${packageId}/leveling`);
    return { ok: "Award pulled. The previous award is kept in the record." };
  } catch (err) {
    return fail(err, "Could not pull the award");
  }
}

/* ------------------------------------------------------------- plan files --- */

export async function uploadPlanAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const ctx = await requireEstimator();
    const projectId = String(form.get("projectId") ?? "");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload" };

    const uploaded = await uploadPlanFile(ctx.company.id, ctx.company.plan, actor(ctx), {
      projectId,
      packageId: String(form.get("packageId") ?? "") || null,
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      data: Buffer.from(await file.arrayBuffer()),
      versionLabel: String(form.get("versionLabel") ?? "Rev 0"),
      supersedes: String(form.get("supersedes") ?? "") || null,
    });
    revalidatePath(`/projects/${projectId}`);
    return { ok: `${uploaded.filename} uploaded as ${uploaded.versionLabel}` };
  } catch (err) {
    return fail(err, "Could not upload the file");
  }
}

export async function deletePlanAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const ctx = await requireEstimator();
    await deletePlanFile(ctx.company.id, actor(ctx), String(form.get("fileId") ?? ""));
    revalidatePath(`/projects/${String(form.get("projectId"))}`);
    return { ok: "File removed" };
  } catch (err) {
    return fail(err, "Could not remove the file");
  }
}
