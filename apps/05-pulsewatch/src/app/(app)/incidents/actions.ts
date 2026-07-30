"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  acknowledgeIncident,
  createManualIncident,
  postIncidentUpdate,
  resolveManualIncident,
} from "@/lib/incidents";

export interface IncidentFormState {
  error?: string;
  ok?: boolean;
}

export async function createManualIncidentAction(
  _prev: IncidentFormState,
  form: FormData,
): Promise<IncidentFormState> {
  const { user, team } = await requireUser();
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  if (!title) return { error: "Give the incident a title" };
  if (!body) return { error: "Say what is happening" };

  try {
    await createManualIncident(team.id, title, body, user.id);
  } catch (err) {
    console.error("[incidents] manual create failed", err);
    return { error: "Could not post that incident" };
  }
  revalidatePath("/incidents");
  return { ok: true };
}

export async function acknowledgeAction(formData: FormData): Promise<void> {
  const { team } = await requireUser();
  const id = String(formData.get("id"));
  await acknowledgeIncident(id, team.id);
  revalidatePath(`/incidents/${id}`);
}

export async function resolveAction(formData: FormData): Promise<void> {
  const { team } = await requireUser();
  const id = String(formData.get("id"));
  await resolveManualIncident(id, team.id);
  revalidatePath(`/incidents/${id}`);
  revalidatePath("/incidents");
}

export async function postUpdateAction(formData: FormData): Promise<void> {
  const { user, team } = await requireUser();
  const id = String(formData.get("id"));
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  await postIncidentUpdate(id, team.id, body, user.id, "public");
  revalidatePath(`/incidents/${id}`);
}
