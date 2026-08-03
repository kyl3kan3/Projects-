"use server";

import { revalidatePath } from "next/cache";
import { requireStylist } from "@/lib/auth";
import { failed, field, succeeded, type FormState } from "@/lib/forms";
import { featureAllowed, type Billable } from "@/lib/plans";
import { clientById, saveClientNotes, setSmsConsent } from "@/server/clients";
import { addToWaitlist, removeFromWaitlist } from "@/server/waitlist";
import { cadencesForClient, sendDueNudges } from "@/server/cadence";

export type NotesValues = { notes: string };

export async function saveNotesAction(
  _prev: FormState<NotesValues>,
  formData: FormData,
): Promise<FormState<NotesValues>> {
  const { stylist } = await requireStylist();
  const clientId = field(formData, "clientId");
  const values: NotesValues = { notes: String(formData.get("notes") ?? "") };

  const gate = featureAllowed(stylist as Billable, "client_notes");
  if (!gate.ok) return failed(gate.reason, values);

  const client = await clientById(clientId, stylist.id);
  if (!client) return failed("That client is not in your book.", values);

  await saveClientNotes({ clientId, stylistId: stylist.id, notes: values.notes });
  revalidatePath(`/clients/${clientId}`);
  return succeeded("Saved.", values);
}

export type ClientActionValues = Record<string, string>;

export async function setConsentAction(
  _prev: FormState<ClientActionValues>,
  formData: FormData,
): Promise<FormState<ClientActionValues>> {
  const { user, stylist } = await requireStylist();
  const clientId = field(formData, "clientId");
  const consent = field(formData, "consent") === "on";
  const result = await setSmsConsent({
    clientId,
    stylistId: stylist.id,
    consent,
    userId: user.id,
  });
  if (!result.ok) return failed(result.message, {});
  revalidatePath(`/clients/${clientId}`);
  return succeeded(consent ? "Texts are on for this client." : "Texts are off.", {});
}

/**
 * Nudge now — the manual version of the nightly scan, for one client.
 *
 * It runs the same `sendDueNudges` the tick runs rather than a shortcut, so the caps,
 * quiet hours and consent rules all still apply. A "send anyway" button would be the one
 * that gets a stylist's number blocked, and the honest failure ("quiet hours where you
 * are") is more useful than a text at 11pm.
 */
export async function nudgeNowAction(
  _prev: FormState<ClientActionValues>,
  formData: FormData,
): Promise<FormState<ClientActionValues>> {
  const { stylist } = await requireStylist();
  const clientId = field(formData, "clientId");
  const gate = featureAllowed(stylist as Billable, "cadence_nudges");
  if (!gate.ok) return failed(gate.reason, {});

  const client = await clientById(clientId, stylist.id);
  if (!client) return failed("That client is not in your book.", {});
  const cadences = await cadencesForClient(clientId);
  if (cadences.length === 0) {
    return failed(
      "No rhythm for this client yet — they need two completed visits of the same service, or an imported last visit.",
      {},
    );
  }

  const report = await sendDueNudges({ stylist, limit: 200 });
  revalidatePath(`/clients/${clientId}`);
  if (report.sent > 0) {
    return succeeded(`Sent ${report.sent} ${report.sent === 1 ? "nudge" : "nudges"}.`, {});
  }
  const mine = report.skipped[0];
  return failed(mine ? `Nothing sent — ${mine.detail}` : "Nothing was due.", {});
}

export async function addWaitlistAction(
  _prev: FormState<ClientActionValues>,
  formData: FormData,
): Promise<FormState<ClientActionValues>> {
  const { stylist } = await requireStylist();
  const clientId = field(formData, "clientId");
  const serviceId = field(formData, "serviceId");
  const partOfDayRaw = field(formData, "partOfDay");
  const weekdays = formData
    .getAll("weekdays")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);

  const gate = featureAllowed(stylist as Billable, "waitlist");
  if (!gate.ok) return failed(gate.reason, {});

  const client = await clientById(clientId, stylist.id);
  if (!client) return failed("That client is not in your book.", {});
  if (!serviceId) return failed("Pick which service they are waiting for.", {});

  const result = await addToWaitlist({
    stylistId: stylist.id,
    clientId,
    serviceId,
    weekdays,
    partOfDay:
      partOfDayRaw === "morning" || partOfDayRaw === "afternoon" || partOfDayRaw === "evening"
        ? partOfDayRaw
        : undefined,
  });
  if (!result.ok) return failed(result.message, {});
  revalidatePath(`/clients/${clientId}`);
  return succeeded("On the waitlist. They get the first matching cancellation.", {});
}

export async function removeWaitlistAction(
  _prev: FormState<ClientActionValues>,
  formData: FormData,
): Promise<FormState<ClientActionValues>> {
  const { stylist } = await requireStylist();
  const entryId = field(formData, "entryId");
  const clientId = field(formData, "clientId");
  await removeFromWaitlist(entryId, stylist.id);
  revalidatePath(`/clients/${clientId}`);
  return succeeded("Off the waitlist.", {});
}
