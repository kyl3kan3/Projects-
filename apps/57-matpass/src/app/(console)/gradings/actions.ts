"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/ActionForm";
import { requireCan } from "@/lib/auth";
import {
  assembleCandidates,
  completeEvent,
  createEvent,
  inviteCandidates,
  listCandidates,
  setCandidateStatus,
  type Decision,
} from "@/lib/gradings";

function fail(err: unknown): FormState {
  return { error: err instanceof Error ? err.message : "That did not work" };
}

export async function createEventAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school, user } = await requireCan("complete_grading");
  const name = String(formData.get("name") ?? "").trim();
  const heldOn = String(formData.get("heldOn") ?? "").trim();
  const programIds = formData.getAll("programIds").map(String).filter(Boolean);

  let eventId: string;
  try {
    if (!heldOn) throw new Error("Pick the date it is held on");
    const held = new Date(`${heldOn}T12:00:00Z`);
    if (Number.isNaN(held.getTime())) throw new Error("That date could not be read");
    const event = await createEvent({
      schoolId: school.id,
      name,
      heldOn: held,
      programIds,
      actorId: user.id,
    });
    eventId = event.id;
    await assembleCandidates(event.id);
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/gradings");
  redirect(`/gradings/${eventId}`);
}

export async function reassembleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireCan("complete_grading");
  const gradingEventId = String(formData.get("gradingEventId") ?? "");
  try {
    const counts = await assembleCandidates(gradingEventId);
    revalidatePath(`/gradings/${gradingEventId}`);
    return {
      ok: `List rebuilt — ${counts.eligible} eligible, ${counts.nearMiss} near miss.`,
    };
  } catch (err) {
    return fail(err);
  }
}

export async function inviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school, user } = await requireCan("complete_grading");
  const gradingEventId = String(formData.get("gradingEventId") ?? "");
  const candidateIds = formData.getAll("candidateIds").map(String).filter(Boolean);
  try {
    const result = await inviteCandidates({
      gradingEventId,
      schoolId: school.id,
      schoolName: school.name,
      actorId: user.id,
      candidateIds: candidateIds.length > 0 ? candidateIds : undefined,
    });
    revalidatePath(`/gradings/${gradingEventId}`);
    return {
      ok:
        result.noEmail > 0
          ? `${result.invited} invited · ${result.emailed} emailed · ${result.noEmail} household${result.noEmail === 1 ? "" : "s"} without a usable address — add one on the household.`
          : `${result.invited} invited, ${result.emailed} emailed.`,
    };
  } catch (err) {
    return fail(err);
  }
}

export async function candidateStatusAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireCan("complete_grading");
  const gradingEventId = String(formData.get("gradingEventId") ?? "");
  const candidateId = String(formData.get("candidateId") ?? "");
  const status = String(formData.get("status") ?? "confirmed") as
    | "confirmed"
    | "invited"
    | "eligible";
  try {
    await setCandidateStatus({ candidateId, gradingEventId, status });
    revalidatePath(`/gradings/${gradingEventId}`);
    return { ok: status === "confirmed" ? "Confirmed." : "Updated." };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Complete the event. The decisions arrive as `decision:<candidateId>` fields so
 * one form carries the whole event-day checklist, and the server recomputes what
 * each promotion means from the live enrollment rows.
 */
export async function completeEventAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { school, user } = await requireCan("complete_grading");
  const gradingEventId = String(formData.get("gradingEventId") ?? "");

  let recorded: number;
  try {
    const candidates = await listCandidates(gradingEventId);
    const decisions: Decision[] = [];
    for (const candidate of candidates) {
      const raw = formData.get(`decision:${candidate.candidateId}`);
      if (!raw) continue;
      const decision = String(raw);
      if (decision === "promote" || decision === "hold_back" || decision === "no_show") {
        decisions.push({ candidateId: candidate.candidateId, decision });
      }
    }
    if (decisions.length === 0) {
      return { error: "Mark at least one candidate before recording the event." };
    }
    const result = await completeEvent({
      gradingEventId,
      schoolId: school.id,
      gradedBy: user.id,
      decisions,
    });
    recorded = result.promotions;
  } catch (err) {
    return fail(err);
  }
  // Outside the try: `redirect()` throws, and catching it would turn a recorded
  // grading event into an error message.
  revalidatePath("/gradings");
  revalidatePath("/roster");
  redirect(`/gradings/${gradingEventId}?recorded=${recorded}`);
}
