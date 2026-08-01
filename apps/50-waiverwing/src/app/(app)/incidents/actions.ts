"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  createIncident,
  IncidentError,
  linkParticipant,
  setIncidentStatus,
  unlinkParticipant,
} from "@/lib/incidents";
import { featureAllowed } from "@/lib/plans";

export interface IncidentFormState {
  error?: string;
  ok?: string;
}

function gate(account: Parameters<typeof featureAllowed>[0]): string | null {
  return featureAllowed(account, "incidents")
    ? null
    : "Incident notes are part of Front Desk. Your waivers and participant records keep working.";
}

export async function createIncidentAction(
  _prev: IncidentFormState,
  form: FormData,
): Promise<IncidentFormState> {
  const { account, location, user } = await requireUser();
  const blocked = gate(account);
  if (blocked) return { error: blocked };

  const occurredRaw = String(form.get("occurredAt") ?? "");
  const occurredAt = occurredRaw ? new Date(occurredRaw) : new Date();

  let incidentId: string;
  try {
    const incident = await createIncident({
      accountId: account.id,
      locationId: location.id,
      occurredAt,
      title: String(form.get("title") ?? ""),
      description: String(form.get("description") ?? ""),
      whereText: String(form.get("whereText") ?? ""),
      loggedByUserId: user.id,
    });
    incidentId = incident.id;
  } catch (err) {
    if (err instanceof IncidentError) return { error: err.message };
    return { error: err instanceof Error ? err.message : "Could not log the incident" };
  }

  redirect(`/incidents/${incidentId}`);
}

export async function linkParticipantAction(
  _prev: IncidentFormState,
  form: FormData,
): Promise<IncidentFormState> {
  const { account, location } = await requireUser();
  const blocked = gate(account);
  if (blocked) return { error: blocked };

  const incidentId = String(form.get("incidentId") ?? "");
  const participantId = String(form.get("participantId") ?? "");
  const note = String(form.get("note") ?? "");
  if (!participantId) return { error: "Search for the person and pick them from the results." };

  try {
    const link = await linkParticipant(
      account.id,
      incidentId,
      participantId,
      note,
      location.timezone,
    );
    revalidatePath(`/incidents/${incidentId}`);
    return {
      ok: link.signatureId
        ? "Linked, with the waiver that was in force at the time of the incident."
        : "Linked. No waiver was in force when this happened — the file records that plainly.",
    };
  } catch (err) {
    if (err instanceof IncidentError) return { error: err.message };
    return { error: err instanceof Error ? err.message : "Could not link them" };
  }
}

export async function unlinkParticipantAction(form: FormData): Promise<void> {
  const { account } = await requireUser();
  const incidentId = String(form.get("incidentId") ?? "");
  await unlinkParticipant(account.id, incidentId, String(form.get("participantId") ?? ""));
  revalidatePath(`/incidents/${incidentId}`);
}

export async function setStatusAction(form: FormData): Promise<void> {
  const { account } = await requireUser();
  const incidentId = String(form.get("incidentId") ?? "");
  const status = String(form.get("status") ?? "open") === "closed" ? "closed" : "open";
  await setIncidentStatus(account.id, incidentId, status);
  revalidatePath(`/incidents/${incidentId}`);
  revalidatePath("/incidents");
}
