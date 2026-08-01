/**
 * src/lib/incidents.ts
 *
 * Incident notes tied to waivers — the wedge feature. When something happens,
 * the operator builds the file where the waivers already live.
 *
 * The rule that makes it worth anything: linking a participant **snapshots the
 * signature that was in force at the moment the incident occurred**, not their
 * latest one. Somebody re-signing next week must not silently change what the
 * incident file says was covering them. That is tested.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  incidentParticipants,
  incidents,
  participants,
  signatures,
  users,
  type Incident,
  type IncidentParticipant,
  type Participant,
  type Signature,
} from "@/db/schema";
import { signatureValidAt } from "@/lib/minors";

export class IncidentError extends Error {}

export async function createIncident(input: {
  accountId: string;
  locationId: string;
  occurredAt: Date;
  title: string;
  description: string;
  whereText?: string | null;
  loggedByUserId?: string | null;
}): Promise<Incident> {
  if (!input.title.trim()) throw new IncidentError("Give the incident a one-line title.");
  if (!input.description.trim()) {
    throw new IncidentError("Describe what happened — this is the file an insurer will read.");
  }
  if (Number.isNaN(input.occurredAt.getTime())) {
    throw new IncidentError("Enter when it happened.");
  }

  const db = getDb();
  const [row] = await db
    .insert(incidents)
    .values({
      accountId: input.accountId,
      locationId: input.locationId,
      occurredAt: input.occurredAt,
      title: input.title.trim(),
      description: input.description.trim(),
      whereText: input.whereText?.trim() || null,
      loggedByUserId: input.loggedByUserId ?? null,
    })
    .returning();
  return row;
}

/**
 * The signature in force at an instant: the most recent one signed at or before
 * `at` that was still covering the participant then.
 *
 * "Still covering then" runs through the same `signatureValidAt` the check-in
 * screen uses, so a minor who had already turned 18 by the incident date is
 * correctly recorded as uncovered rather than credited with their guardian's
 * old waiver.
 */
export async function signatureInForce(
  participantId: string,
  at: Date,
  timeZone = "UTC",
): Promise<Signature | null> {
  const db = getDb();
  const [participant] = await db
    .select()
    .from(participants)
    .where(eq(participants.id, participantId));
  if (!participant) return null;

  const history = await db
    .select()
    .from(signatures)
    .where(eq(signatures.participantId, participantId))
    .orderBy(desc(signatures.signedAt));

  return history.find((s) => signatureValidAt(s, participant.dob, at, timeZone)) ?? null;
}

export interface IncidentLink {
  id: string;
  participantId: string;
  signatureId: string | null;
  note: string;
}

/**
 * Link a participant to an incident, snapshotting the waiver in force.
 *
 * A null `signatureId` is a real and useful answer: it records "no waiver was in
 * force when this happened", which is the honest thing for the file to say and
 * far better than quietly attaching a waiver signed afterwards.
 */
export async function linkParticipant(
  accountId: string,
  incidentId: string,
  participantId: string,
  note = "",
  timeZone = "UTC",
): Promise<IncidentLink> {
  const db = getDb();
  const [incident] = await db
    .select()
    .from(incidents)
    .where(and(eq(incidents.id, incidentId), eq(incidents.accountId, accountId)));
  if (!incident) throw new IncidentError("That incident does not exist.");
  if (incident.status === "closed") {
    throw new IncidentError("This incident is closed. Reopen it before changing who is linked.");
  }

  const inForce = await signatureInForce(participantId, incident.occurredAt, timeZone);

  const [row] = await db
    .insert(incidentParticipants)
    .values({
      incidentId,
      participantId,
      signatureId: inForce?.id ?? null,
      note: note.trim(),
    })
    .onConflictDoNothing({
      target: [incidentParticipants.incidentId, incidentParticipants.participantId],
    })
    .returning();

  if (row) {
    return {
      id: row.id,
      participantId: row.participantId,
      signatureId: row.signatureId,
      note: row.note,
    };
  }

  // Already linked. The existing snapshot stands — re-linking must not re-resolve
  // the waiver, or the file would drift every time someone tapped the button.
  const [existing] = await db
    .select()
    .from(incidentParticipants)
    .where(
      and(
        eq(incidentParticipants.incidentId, incidentId),
        eq(incidentParticipants.participantId, participantId),
      ),
    );
  return {
    id: existing.id,
    participantId: existing.participantId,
    signatureId: existing.signatureId,
    note: existing.note,
  };
}

export async function unlinkParticipant(
  accountId: string,
  incidentId: string,
  participantId: string,
): Promise<void> {
  const db = getDb();
  const [incident] = await db
    .select()
    .from(incidents)
    .where(and(eq(incidents.id, incidentId), eq(incidents.accountId, accountId)));
  if (!incident) throw new IncidentError("That incident does not exist.");
  await db
    .delete(incidentParticipants)
    .where(
      and(
        eq(incidentParticipants.incidentId, incidentId),
        eq(incidentParticipants.participantId, participantId),
      ),
    );
}

export async function setIncidentStatus(
  accountId: string,
  incidentId: string,
  status: "open" | "closed",
): Promise<void> {
  const db = getDb();
  await db
    .update(incidents)
    .set({ status, closedAt: status === "closed" ? new Date() : null })
    .where(and(eq(incidents.id, incidentId), eq(incidents.accountId, accountId)));
}

/* ------------------------------------------------------------ the file view */

export interface IncidentFileEntry {
  link: IncidentParticipant;
  participant: Participant;
  /** The waiver in force at occurred_at — or null, recorded honestly. */
  signature: Signature | null;
}

export interface IncidentFile {
  incident: Incident;
  loggedBy: string | null;
  entries: IncidentFileEntry[];
}

export async function incidentFile(
  accountId: string,
  incidentId: string,
): Promise<IncidentFile | null> {
  const db = getDb();
  const [incident] = await db
    .select()
    .from(incidents)
    .where(and(eq(incidents.id, incidentId), eq(incidents.accountId, accountId)));
  if (!incident) return null;

  const rows = await db
    .select({ link: incidentParticipants, participant: participants })
    .from(incidentParticipants)
    .innerJoin(participants, eq(participants.id, incidentParticipants.participantId))
    .where(eq(incidentParticipants.incidentId, incidentId))
    .orderBy(incidentParticipants.createdAt);

  const entries: IncidentFileEntry[] = [];
  for (const r of rows) {
    let signature: Signature | null = null;
    if (r.link.signatureId) {
      const [s] = await db.select().from(signatures).where(eq(signatures.id, r.link.signatureId));
      signature = s ?? null;
    }
    entries.push({ link: r.link, participant: r.participant, signature });
  }

  let loggedBy: string | null = null;
  if (incident.loggedByUserId) {
    const [u] = await db.select().from(users).where(eq(users.id, incident.loggedByUserId));
    loggedBy = u?.name ?? u?.email ?? null;
  }

  return { incident, loggedBy, entries };
}

export async function listIncidents(accountId: string): Promise<
  Array<Incident & { linkedCount: number }>
> {
  const db = getDb();
  const rows = await db
    .select()
    .from(incidents)
    .where(eq(incidents.accountId, accountId))
    .orderBy(desc(incidents.occurredAt));

  const out: Array<Incident & { linkedCount: number }> = [];
  for (const incident of rows) {
    const links = await db
      .select({ id: incidentParticipants.id })
      .from(incidentParticipants)
      .where(eq(incidentParticipants.incidentId, incident.id));
    out.push({ ...incident, linkedCount: links.length });
  }
  return out;
}
