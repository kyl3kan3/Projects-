"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  ConnectionStringError,
  PlanLimitError,
  ValidationError,
  createConnection,
  deleteConnection,
  getConnection,
  policyFor,
  recheckConnection,
} from "@/lib/connections";
import { enqueueBackup, latestSnapshotFor, runBackupJob } from "@/lib/backups";
import { createDrill, runDrill } from "@/lib/drills";
import { PolicyError, updatePolicy } from "@/lib/policies";
import type { DrillFrequency, Frequency } from "@/db/schema";

export interface ConnectFormState {
  error?: string;
}

export async function connectDatabaseAction(
  _prev: ConnectFormState,
  form: FormData,
): Promise<ConnectFormState> {
  const { user, org } = await requireUser();

  let connectionId: string;
  try {
    const result = await createConnection({
      orgId: org.id,
      planId: org.plan,
      actorUserId: user.id,
      name: String(form.get("name") ?? ""),
      connectionString: String(form.get("connectionString") ?? ""),
    });
    connectionId = result.connection.id;
  } catch (err) {
    if (
      err instanceof PlanLimitError ||
      err instanceof ValidationError ||
      err instanceof ConnectionStringError
    ) {
      return { error: err.message };
    }
    console.error("[vault] connect failed", err);
    return { error: "Could not connect that database" };
  }

  revalidatePath("/vault");
  redirect(`/vault/${connectionId}?connected=1`);
}

/**
 * "Back up now" runs the job inline and awaits it, so the dashboard shows the
 * new checksum the moment the page comes back. On a serverless host this is
 * bounded by the function duration; a database too large for that is what the
 * scheduled path and the worker process are for (see DEPLOYING.md).
 */
export async function backupNowAction(form: FormData): Promise<void> {
  const { org } = await requireUser();
  const connectionId = String(form.get("connectionId"));
  const connection = await getConnection(connectionId, org.id);
  if (!connection) return;

  const policy = await policyFor(connectionId);
  const job = await enqueueBackup({
    orgId: org.id,
    connectionId,
    policyId: policy?.id ?? null,
    trigger: "manual",
  });
  if (job) await runBackupJob(job.id);

  revalidatePath("/vault");
  revalidatePath(`/vault/${connectionId}`);
  revalidatePath("/restore");
}

export async function recheckConnectionAction(form: FormData): Promise<void> {
  const { user, org } = await requireUser();
  const connectionId = String(form.get("connectionId"));
  const connection = await getConnection(connectionId, org.id);
  if (!connection) return;
  await recheckConnection(connection, user.id);
  revalidatePath(`/vault/${connectionId}`);
}

export async function deleteConnectionAction(form: FormData): Promise<void> {
  const { user, org } = await requireUser();
  await deleteConnection(String(form.get("connectionId")), org.id, user.id);
  revalidatePath("/vault");
  redirect("/vault");
}

export interface PolicyFormState {
  error?: string;
  saved?: boolean;
  clamped?: string[];
}

export async function savePolicyAction(
  _prev: PolicyFormState,
  form: FormData,
): Promise<PolicyFormState> {
  const { user, org } = await requireUser();
  const connectionId = String(form.get("connectionId"));

  try {
    const result = await updatePolicy({
      policyId: String(form.get("policyId")),
      orgId: org.id,
      planId: org.plan,
      actorUserId: user.id,
      frequency: (String(form.get("frequency") ?? "daily") as Frequency),
      hour: Number(form.get("hour") ?? 4),
      minute: Number(form.get("minute") ?? 0),
      timezone: String(form.get("timezone") ?? "UTC"),
      retentionDays: Number(form.get("retentionDays") ?? 30),
      drillFrequency: (String(form.get("drillFrequency") ?? "none") as DrillFrequency),
      storageTargetId: String(form.get("storageTargetId")),
      enabled: form.get("enabled") === "on",
    });
    revalidatePath(`/vault/${connectionId}`);
    revalidatePath("/vault");
    return { saved: true, clamped: result.clamped };
  } catch (err) {
    if (err instanceof PolicyError) return { error: err.message };
    console.error("[vault] policy save failed", err);
    return { error: "Could not save that policy" };
  }
}

/** Run a drill immediately against the latest snapshot. */
export async function drillNowAction(form: FormData): Promise<void> {
  const { org } = await requireUser();
  const connectionId = String(form.get("connectionId"));
  const connection = await getConnection(connectionId, org.id);
  if (!connection) return;

  const snapshot = await latestSnapshotFor(connectionId);
  if (!snapshot) return;

  const policy = await policyFor(connectionId);
  const drill = await createDrill({
    orgId: org.id,
    snapshot,
    policyId: policy?.id ?? null,
    trigger: "manual",
  });
  await runDrill(drill.id);

  revalidatePath("/drills");
  revalidatePath(`/vault/${connectionId}`);
}
