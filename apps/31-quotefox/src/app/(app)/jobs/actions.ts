"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOnboardedUser } from "@/lib/auth";
import { createJob, setJobStatus } from "@/lib/jobs";
import { setCaption, setNotes, startWalkthrough } from "@/lib/walkthroughs";
import type { JobStatus } from "@/db/schema";

export interface NewJobState {
  error?: string;
}

/**
 * Create the job and open the capture screen in one step.
 *
 * The walkthrough row is created here rather than on the capture screen because
 * the phone needs an id before it can register its first audio chunk, and a tech
 * standing in a driveway should not have to tap twice to start recording.
 */
export async function createJobAndCaptureAction(
  _prev: NewJobState,
  formData: FormData,
): Promise<NewJobState> {
  const { org, user } = await requireOnboardedUser();
  const result = await createJob(org, user.id, {
    customerName: String(formData.get("customerName") ?? ""),
    customerEmail: String(formData.get("customerEmail") ?? ""),
    customerPhone: String(formData.get("customerPhone") ?? ""),
    address: String(formData.get("address") ?? ""),
    title: String(formData.get("title") ?? ""),
  });
  if (!result.ok) return { error: result.error };
  const walkthrough = await startWalkthrough(org, user.id, result.job.id);
  redirect(`/jobs/${result.job.id}/capture?w=${walkthrough.id}`);
}

export async function startAnotherWalkthroughAction(jobId: string): Promise<void> {
  const { org, user } = await requireOnboardedUser();
  const walkthrough = await startWalkthrough(org, user.id, jobId);
  redirect(`/jobs/${jobId}/capture?w=${walkthrough.id}`);
}

export async function setJobStatusAction(jobId: string, status: JobStatus): Promise<void> {
  const { org, user } = await requireOnboardedUser();
  await setJobStatus(org.id, user.id, jobId, status);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
}

export async function saveNotesAction(walkthroughId: string, notes: string): Promise<void> {
  const { org } = await requireOnboardedUser();
  await setNotes(org.id, walkthroughId, notes);
}

export async function saveCaptionAction(mediaId: string, caption: string): Promise<void> {
  const { org } = await requireOnboardedUser();
  await setCaption(org.id, mediaId, caption);
}
