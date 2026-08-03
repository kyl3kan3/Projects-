"use server";

/**
 * Every exported function here is a public endpoint. There are exactly two,
 * both called from the anomaly card and the detail screen, and both re-resolve
 * the caller's org rather than trusting anything the client sent.
 */

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth";
import { ackAnomaly, resolveAnomaly } from "@/lib/anomalies";

export interface ActionState {
  error?: string;
}

export async function ackAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("anomalyId") ?? "");
  if (!id) return { error: "Missing anomaly" };
  const { org, user } = await requireOrg();
  const result = await ackAnomaly(org, user, id);
  if (!result.ok) return { error: result.error ?? "Could not ack that anomaly" };
  revalidatePath("/anomalies");
  revalidatePath(`/anomalies/${id}`);
  revalidatePath("/watch");
  return {};
}

export async function resolveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("anomalyId") ?? "");
  if (!id) return { error: "Missing anomaly" };
  const { org } = await requireOrg();
  const result = await resolveAnomaly(org, id);
  if (!result.ok) return { error: result.error ?? "Could not resolve that anomaly" };
  revalidatePath("/anomalies");
  revalidatePath(`/anomalies/${id}`);
  revalidatePath("/watch");
  return {};
}
