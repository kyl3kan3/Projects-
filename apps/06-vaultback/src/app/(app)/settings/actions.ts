"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations, type PlanId } from "@/db/schema";
import { requireAdmin, requireUser } from "@/lib/auth";
import { createCheckoutSession, createPortalSession } from "@/lib/billing";
import {
  StorageTargetError,
  createTarget,
  deleteTarget,
  setDefaultTarget,
  verifyTarget,
} from "@/lib/storage-targets";

export interface SettingsFormState {
  error?: string;
  saved?: boolean;
}

export async function saveOrgAction(
  _prev: SettingsFormState,
  form: FormData,
): Promise<SettingsFormState> {
  const { org } = await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  const alertEmail = String(form.get("alertEmail") ?? "").trim();

  if (!name) return { error: "Give the workspace a name" };
  if (alertEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(alertEmail)) {
    return { error: "That alert address is not a valid email" };
  }

  const db = getDb();
  await db
    .update(organizations)
    .set({ name, alertEmail: alertEmail || null })
    .where(eq(organizations.id, org.id));

  revalidatePath("/settings");
  return { saved: true };
}

/* ---------------------------------------------------------------- storage --- */

export interface StorageFormState {
  error?: string;
  saved?: boolean;
}

export async function addStorageTargetAction(
  _prev: StorageFormState,
  form: FormData,
): Promise<StorageFormState> {
  const { user, org } = await requireAdmin();
  const kind = String(form.get("kind") ?? "byo_s3") as "byo_s3" | "byo_r2";

  try {
    await createTarget({
      orgId: org.id,
      actorUserId: user.id,
      name: String(form.get("name") ?? ""),
      kind,
      bucket: String(form.get("bucket") ?? ""),
      region: String(form.get("region") ?? ""),
      endpoint: String(form.get("endpoint") ?? ""),
      prefix: String(form.get("prefix") ?? ""),
      accessKeyId: String(form.get("accessKeyId") ?? ""),
      secretAccessKey: String(form.get("secretAccessKey") ?? ""),
      makeDefault: form.get("makeDefault") === "on",
    });
  } catch (err) {
    if (err instanceof StorageTargetError) return { error: err.message };
    console.error("[settings] add storage target failed", err);
    return { error: "Could not add that bucket" };
  }

  revalidatePath("/settings/storage");
  return { saved: true };
}

export async function verifyStorageTargetAction(form: FormData): Promise<void> {
  const { user, org } = await requireAdmin();
  await verifyTarget(String(form.get("targetId")), org.id, user.id);
  revalidatePath("/settings/storage");
}

export async function makeDefaultStorageAction(form: FormData): Promise<void> {
  const { user, org } = await requireAdmin();
  await setDefaultTarget(String(form.get("targetId")), org.id, user.id);
  revalidatePath("/settings/storage");
}

export async function deleteStorageTargetAction(form: FormData): Promise<void> {
  const { user, org } = await requireAdmin();
  await deleteTarget(String(form.get("targetId")), org.id, user.id);
  revalidatePath("/settings/storage");
}

/* ---------------------------------------------------------------- billing --- */

export async function upgradeAction(form: FormData): Promise<void> {
  const { user, org } = await requireAdmin();
  const planId = String(form.get("plan") ?? "startup") as PlanId;
  const url = await createCheckoutSession(org, user.email, planId);
  redirect(url);
}

export async function portalAction(): Promise<void> {
  const { user, org } = await requireAdmin();
  const url = await createPortalSession(org, user.email);
  redirect(url);
}

/* ----------------------------------------------------------------- report --- */

export async function generateReportAction(form: FormData): Promise<void> {
  await requireUser();
  const period = String(form.get("period") ?? "");
  redirect(`/api/reports/${period}`);
}
