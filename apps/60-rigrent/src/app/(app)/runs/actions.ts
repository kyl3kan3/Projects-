"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { renderRunSheet } from "@/lib/documents";
import { field, formError, formOk, snapshot, type FormState } from "@/lib/form";
import { canUseRuns, entitlements } from "@/lib/plans";
import {
  addStop,
  createRun,
  moveStop,
  removeStop,
  setRunDriver,
  setRunStatus,
} from "@/lib/runs";

export async function createRunAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = snapshot(form);
  let runId: string;
  try {
    const { account, user } = await requireSession();
    const gate = canUseRuns(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "Runs are not on this plan.", values);
    const run = await createRun({
      accountId: account.id,
      kind: field(form, "kind") === "pickup" ? "pickup" : "delivery",
      runOn: field(form, "runOn"),
      truckLabel: field(form, "truckLabel") || null,
      driverUserId: field(form, "driverUserId") || null,
      actor: user.email,
    });
    runId = run.id;
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not create the run.", values);
  }
  revalidatePath("/runs");
  redirect(`/runs/${runId}`);
}

export async function addStopAction(_prev: FormState, form: FormData): Promise<FormState> {
  const runId = field(form, "runId");
  try {
    const { account, user } = await requireSession();
    const gate = canUseRuns(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "Runs are not on this plan.");
    await addStop({
      accountId: account.id,
      runId,
      orderId: field(form, "orderId"),
      actor: user.email,
    });
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not add the stop.");
  }
  revalidatePath(`/runs/${runId}`);
  return formOk("Stop added — the load list re-aggregated.");
}

export async function removeStopAction(_prev: FormState, form: FormData): Promise<FormState> {
  const runId = field(form, "runId");
  try {
    const { account } = await requireSession();
    const gate = canUseRuns(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "Runs are not on this plan.");
    await removeStop({ accountId: account.id, runId, orderId: field(form, "orderId") });
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not remove the stop.");
  }
  revalidatePath(`/runs/${runId}`);
  return formOk("Stop removed.");
}

export async function moveStopAction(_prev: FormState, form: FormData): Promise<FormState> {
  const runId = field(form, "runId");
  try {
    const { account } = await requireSession();
    const gate = canUseRuns(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "Runs are not on this plan.");
    await moveStop({
      accountId: account.id,
      runId,
      orderId: field(form, "orderId"),
      direction: field(form, "direction") === "up" ? "up" : "down",
    });
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not reorder the stops.");
  }
  revalidatePath(`/runs/${runId}`);
  return formOk("Route updated.");
}

export async function setRunStatusAction(_prev: FormState, form: FormData): Promise<FormState> {
  const runId = field(form, "runId");
  try {
    const { account, user } = await requireSession();
    const gate = canUseRuns(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "Runs are not on this plan.");
    const status = field(form, "status");
    if (status !== "planned" && status !== "loaded" && status !== "out" && status !== "done") {
      return formError("Unknown run status.");
    }
    await setRunStatus({ accountId: account.id, runId, status, actor: user.email });
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not update the run.");
  }
  revalidatePath(`/runs/${runId}`);
  revalidatePath("/runs");
  return formOk("Run updated.");
}

export async function setRunDriverAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = snapshot(form);
  const runId = field(form, "runId");
  try {
    const { account } = await requireSession();
    const gate = canUseRuns(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "Runs are not on this plan.", values);
    await setRunDriver({
      accountId: account.id,
      runId,
      driverUserId: field(form, "driverUserId") || null,
      truckLabel: field(form, "truckLabel") || null,
    });
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not assign the run.", values);
  }
  revalidatePath(`/runs/${runId}`);
  return formOk("Assigned.", values);
}

/**
 * Render the run sheet PDF. A POST, not a link: `next/link` prefetches on hover,
 * and this writes a new object to storage and a key onto the run — a side effect
 * a mouse passing over a menu should not perform.
 */
export async function renderRunSheetAction(_prev: FormState, form: FormData): Promise<FormState> {
  const runId = field(form, "runId");
  try {
    const { account } = await requireSession();
    const gate = canUseRuns(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "Runs are not on this plan.");
    const result = await renderRunSheet(account.id, runId);
    if (!result) return formError("That run is not in this account.");
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not render the run sheet.");
  }
  revalidatePath(`/runs/${runId}`);
  return formOk("Run sheet rendered — the download link is below.");
}
