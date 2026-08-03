"use server";

import { revalidatePath } from "next/cache";
import { requirePractice } from "@/lib/auth";
import { ClientError, createClient, updateClient } from "@/lib/clients";
import { requestMeta } from "@/lib/request";
import type { Modality, RecordingConsent } from "@/db/schema";

export interface ClientFormState {
  error?: string;
  ok?: boolean;
}

function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

export async function createClientAction(
  _prev: ClientFormState,
  form: FormData,
): Promise<ClientFormState> {
  const { practice, user } = await requirePractice();
  const meta = await requestMeta();
  try {
    await createClient(
      practice.id,
      user.id,
      {
        displayLabel: str(form, "displayLabel"),
        modality: (str(form, "modality") || "general") as Modality,
        defaultTemplateId: str(form, "defaultTemplateId") || null,
        recordingConsent: (str(form, "recordingConsent") || "none") as RecordingConsent,
      },
      meta,
    );
  } catch (err) {
    if (err instanceof ClientError) return { error: err.message };
    console.error("[clients] create failed", err);
    return { error: "Could not add that client." };
  }
  revalidatePath("/clients");
  return { ok: true };
}

export async function updateClientAction(
  _prev: ClientFormState,
  form: FormData,
): Promise<ClientFormState> {
  const { practice, user } = await requirePractice();
  const meta = await requestMeta();
  const clientId = str(form, "clientId");
  try {
    await updateClient(
      practice.id,
      clientId,
      user.id,
      {
        displayLabel: str(form, "displayLabel"),
        modality: (str(form, "modality") || "general") as Modality,
        defaultTemplateId: str(form, "defaultTemplateId") || null,
        recordingConsent: (str(form, "recordingConsent") || "none") as RecordingConsent,
        status: str(form, "status") === "archived" ? "archived" : "active",
      },
      meta,
    );
  } catch (err) {
    if (err instanceof ClientError) return { error: err.message };
    console.error("[clients] update failed", err);
    return { error: "Could not save that client." };
  }
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  return { ok: true };
}
