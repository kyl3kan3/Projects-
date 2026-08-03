"use server";

/**
 * Job, checklist, application and inspection actions.
 *
 * Every exported function here is a public endpoint, so each one re-resolves the
 * session and re-scopes to the caller's organization — a job id in a form field is
 * not authorisation. Nothing is exported that no screen calls.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { checklistItems, jobs, permitApplications, permitChecklists, type VerificationState } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { regenerateChecklist, setItemState } from "@/lib/checklists";
import { appError, safeMessage } from "@/lib/errors";
import { createJob, getJob, setJobStatus, updateJobNotes } from "@/lib/jobs";
import { parseIsoDate } from "@/lib/format";
import { suggestJurisdictions } from "@/lib/jurisdictions";
import { isJobType } from "@/lib/taxonomy";
import {
  addInspection,
  createApplication,
  recordInspectionResult,
  transitionApplication,
} from "@/lib/tracker";
import type { ApplicationStatus } from "@/db/schema";

export interface FormState {
  error: string | null;
  ok?: string | null;
}

const CLEAN: FormState = { error: null, ok: null };

/* ------------------------------------------------------------------ *
 * Ownership guards
 * ------------------------------------------------------------------ */

async function assertJobOwned(jobId: string, organizationId: string): Promise<void> {
  const job = await getJob(jobId, organizationId);
  if (!job) throw appError("That job could not be found");
}

/** Resolve the job behind a checklist item, refusing anything another org owns. */
async function jobIdForItem(itemId: string, organizationId: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ jobId: jobs.id })
    .from(checklistItems)
    .innerJoin(permitChecklists, eq(permitChecklists.id, checklistItems.checklistId))
    .innerJoin(jobs, eq(jobs.id, permitChecklists.jobId))
    .where(and(eq(checklistItems.id, itemId), eq(jobs.organizationId, organizationId)));
  if (!row) throw appError("That checklist item could not be found");
  return row.jobId;
}

async function jobIdForApplication(applicationId: string, organizationId: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ jobId: jobs.id })
    .from(permitApplications)
    .innerJoin(jobs, eq(jobs.id, permitApplications.jobId))
    .where(and(eq(permitApplications.id, applicationId), eq(jobs.organizationId, organizationId)));
  if (!row) throw appError("That permit application could not be found");
  return row.jobId;
}

/* ------------------------------------------------------------------ *
 * Jobs
 * ------------------------------------------------------------------ */

export async function createJobAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireUser();
  const jobType = String(formData.get("jobType") ?? "");
  let jobId: string;

  try {
    if (!isJobType(jobType)) return { error: "Choose the job type" };
    const jurisdictionId = String(formData.get("jurisdictionId") ?? "");
    if (!jurisdictionId) return { error: "Confirm which jurisdiction this site is in" };

    const result = await createJob({
      organizationId: org.id,
      plan: org.plan,
      actorUserId: user.id,
      label: String(formData.get("label") ?? ""),
      siteAddress: String(formData.get("siteAddress") ?? ""),
      jurisdictionId,
      jobType,
      assignedUserId: String(formData.get("assignedUserId") ?? "") || null,
      notes: String(formData.get("notes") ?? "") || null,
    });
    jobId = result.job.id;
  } catch (err) {
    return { error: safeMessage(err, "That job could not be created.") };
  }

  revalidatePath("/jobs");
  redirect(`/jobs/${jobId}`);
}

export interface SuggestionView {
  id: string;
  name: string;
  departmentName: string;
  coverage: string;
  reason: string;
  confidence: "high" | "medium" | "low";
}

/**
 * Address -> candidate authorities, for the new-job form. Deliberately returns
 * candidates with the reason each one appeared: the office confirms, because a
 * mailing address inside a city's ZIP can still be permitted by the county.
 */
export async function suggestJurisdictionsAction(address: string): Promise<SuggestionView[]> {
  await requireUser();
  const suggestions = await suggestJurisdictions(address);
  return suggestions.map((s) => ({
    id: s.jurisdiction.id,
    name: s.jurisdiction.name,
    departmentName: s.jurisdiction.departmentName,
    coverage: s.jurisdiction.coverageStatus,
    reason: s.reason,
    confidence: s.confidence,
  }));
}

export async function updateJobNotesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { org } = await requireUser();
  const jobId = String(formData.get("jobId") ?? "");
  try {
    await assertJobOwned(jobId, org.id);
    await updateJobNotes({ jobId, organizationId: org.id, notes: String(formData.get("notes") ?? "") });
  } catch (err) {
    return { error: safeMessage(err, "Those notes could not be saved.") };
  }
  revalidatePath(`/jobs/${jobId}`);
  return { ...CLEAN, ok: "Notes saved" };
}

export async function closeJobAction(formData: FormData): Promise<void> {
  const { org } = await requireUser();
  const jobId = String(formData.get("jobId") ?? "");
  const status = String(formData.get("status") ?? "closed") === "active" ? "active" : "closed";
  await assertJobOwned(jobId, org.id);
  await setJobStatus({ jobId, organizationId: org.id, status });
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
}

/* ------------------------------------------------------------------ *
 * Checklist
 * ------------------------------------------------------------------ */

/** The stamp. Called from the row's ring, one item at a time. */
export async function setChecklistItemStateAction(
  itemId: string,
  state: VerificationState,
  naReason?: string,
): Promise<{ error: string | null }> {
  const { user, org } = await requireUser();
  try {
    const jobId = await jobIdForItem(itemId, org.id);
    await setItemState(itemId, state, user.id, naReason);
    revalidatePath(`/jobs/${jobId}`);
    return { error: null };
  } catch (err) {
    return { error: safeMessage(err, "That item could not be updated.") };
  }
}

export async function regenerateChecklistAction(formData: FormData): Promise<void> {
  const { org } = await requireUser();
  const jobId = String(formData.get("jobId") ?? "");
  await assertJobOwned(jobId, org.id);
  await regenerateChecklist(jobId);
  revalidatePath(`/jobs/${jobId}`);
}

/* ------------------------------------------------------------------ *
 * Permit applications and inspections
 * ------------------------------------------------------------------ */

export async function createApplicationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireUser();
  const jobId = String(formData.get("jobId") ?? "");
  try {
    await assertJobOwned(jobId, org.id);
    const permitName = String(formData.get("permitName") ?? "").trim();
    if (permitName.length < 3) return { error: "Name the permit as the jurisdiction names it" };
    await createApplication({
      jobId,
      permitName,
      refNumber: String(formData.get("refNumber") ?? ""),
      actor: user.name ?? user.email,
    });
  } catch (err) {
    return { error: safeMessage(err, "That application could not be added.") };
  }
  revalidatePath(`/jobs/${jobId}`);
  return { ...CLEAN, ok: "Application added" };
}

export async function transitionApplicationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, org } = await requireUser();
  const applicationId = String(formData.get("applicationId") ?? "");
  let jobId = "";
  try {
    jobId = await jobIdForApplication(applicationId, org.id);
    await transitionApplication({
      applicationId,
      to: String(formData.get("to") ?? "") as ApplicationStatus,
      actor: user.name ?? user.email,
      note: String(formData.get("note") ?? ""),
      refNumber: String(formData.get("refNumber") ?? ""),
    });
  } catch (err) {
    return { error: safeMessage(err, "That status could not be changed.") };
  }
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  return { ...CLEAN, ok: "Status updated" };
}

export async function addInspectionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { org } = await requireUser();
  const applicationId = String(formData.get("applicationId") ?? "");
  let jobId = "";
  try {
    jobId = await jobIdForApplication(applicationId, org.id);
    const inspectionType = String(formData.get("inspectionType") ?? "").trim();
    if (inspectionType.length < 3) return { error: "Name the inspection" };
    const scheduledFor = parseIsoDate(String(formData.get("scheduledFor") ?? ""));
    const leadTime = Number(formData.get("leadTimeDays") ?? "");
    await addInspection({
      applicationId,
      inspectionType,
      scheduledFor,
      contactNotes: String(formData.get("contactNotes") ?? ""),
      leadTimeDays: Number.isFinite(leadTime) && leadTime > 0 ? Math.floor(leadTime) : null,
    });
  } catch (err) {
    return { error: safeMessage(err, "That inspection could not be booked.") };
  }
  revalidatePath(`/jobs/${jobId}`);
  return { ...CLEAN, ok: "Inspection noted" };
}

export async function recordInspectionResultAction(formData: FormData): Promise<void> {
  const { org } = await requireUser();
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const applicationId = String(formData.get("applicationId") ?? "");
  const result = String(formData.get("result") ?? "passed") === "failed" ? "failed" : "passed";
  const jobId = await jobIdForApplication(applicationId, org.id);
  await recordInspectionResult({ inspectionId, result });
  revalidatePath(`/jobs/${jobId}`);
}
