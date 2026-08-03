"use server";

/**
 * Licence vault actions. Adding and renewing both re-plan the expiry ladder, which
 * is the only reason this vault beats the spreadsheet nobody updates.
 */

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { CREDENTIAL_KINDS } from "@/lib/credentials";
import { safeMessage } from "@/lib/errors";
import { parseIsoDate } from "@/lib/format";
import { createCredential, deleteCredential, renewCredential } from "@/lib/licenses";
import type { CredentialKind } from "@/db/schema";

export interface CredentialFormState {
  error: string | null;
  ok: string | null;
}

const CLEAN: CredentialFormState = { error: null, ok: null };

export async function addCredentialAction(
  _prev: CredentialFormState,
  formData: FormData,
): Promise<CredentialFormState> {
  const { user, org } = await requireUser();
  const kind = String(formData.get("kind") ?? "") as CredentialKind;
  if (!CREDENTIAL_KINDS.includes(kind)) return { error: "Choose what kind of paper this is", ok: null };

  const expiresAt = parseIsoDate(String(formData.get("expiresAt") ?? ""));
  if (!expiresAt) return { error: "Enter the expiry date", ok: null };

  try {
    await createCredential({
      organizationId: org.id,
      actorUserId: user.id,
      kind,
      issuingAuthority: String(formData.get("issuingAuthority") ?? ""),
      number: String(formData.get("number") ?? ""),
      holder: String(formData.get("holder") ?? ""),
      expiresAt,
      renewalUrl: String(formData.get("renewalUrl") ?? ""),
      assignedUserId: String(formData.get("assignedUserId") ?? "") || null,
      notes: String(formData.get("notes") ?? ""),
    });
  } catch (err) {
    return { error: safeMessage(err, "That credential could not be saved."), ok: null };
  }

  revalidatePath("/licenses");
  revalidatePath("/alerts");
  return { ...CLEAN, ok: "Saved — the T-60/T-30/T-7/T-1 notices are scheduled" };
}

export async function renewCredentialAction(
  _prev: CredentialFormState,
  formData: FormData,
): Promise<CredentialFormState> {
  const { user, org } = await requireUser();
  const newExpiresAt = parseIsoDate(String(formData.get("expiresAt") ?? ""));
  if (!newExpiresAt) return { error: "Enter the new expiry date", ok: null };

  try {
    await renewCredential({
      credentialId: String(formData.get("credentialId") ?? ""),
      organizationId: org.id,
      actorUserId: user.id,
      newExpiresAt,
    });
  } catch (err) {
    return { error: safeMessage(err, "That renewal could not be recorded."), ok: null };
  }

  revalidatePath("/licenses");
  revalidatePath("/alerts");
  return { ...CLEAN, ok: "Renewed — outstanding notices were re-planned against the new date" };
}

export async function deleteCredentialAction(formData: FormData): Promise<void> {
  const { org } = await requireUser();
  await deleteCredential({
    credentialId: String(formData.get("credentialId") ?? ""),
    organizationId: org.id,
  });
  revalidatePath("/licenses");
  revalidatePath("/alerts");
}
