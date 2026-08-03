/**
 * src/lib/clients.ts
 *
 * The client list — deliberately not a chart.
 *
 * A row holds a clinician-chosen display label ("J.R.", "Weds 4pm couple"), a
 * modality, a default template, and the recording-consent state. No name, no DOB,
 * no address, no diagnosis: the product does not need them, so it does not store
 * them, and a breach cannot leak what was never collected (README risk 1).
 *
 * Recording consent is a first-class field rather than a checkbox in settings
 * because two-party-consent states make session recording legally sensitive
 * (README risk 3). `none` blocks the Record path and never blocks Shorthand.
 */

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  sessions,
  type Client,
  type Modality,
  type RecordingConsent,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";

export class ClientError extends Error {}

export interface ClientInput {
  displayLabel: string;
  modality: Modality;
  defaultTemplateId?: string | null;
  recordingConsent: RecordingConsent;
}

export interface ClientWithCounts extends Client {
  sessionCount: number;
  lastSessionAt: Date | null;
}

export async function listClients(
  practiceId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<ClientWithCounts[]> {
  const db = getDb();
  const rows = await db
    .select({
      client: clients,
      sessionCount: sql<number>`count(${sessions.id})::int`,
      lastSessionAt: sql<Date | null>`max(${sessions.heldAt})`,
    })
    .from(clients)
    .leftJoin(sessions, eq(sessions.clientId, clients.id))
    .where(
      and(
        eq(clients.practiceId, practiceId),
        opts.includeArchived ? undefined : eq(clients.status, "active"),
      ),
    )
    .groupBy(clients.id)
    .orderBy(desc(sql`max(${sessions.heldAt})`), asc(clients.displayLabel));

  return rows.map((r) => ({
    ...r.client,
    sessionCount: r.sessionCount,
    lastSessionAt: r.lastSessionAt ? new Date(r.lastSessionAt) : null,
  }));
}

export async function getClient(
  practiceId: string,
  clientId: string,
): Promise<Client | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.practiceId, practiceId)));
  return row ?? null;
}

export async function createClient(
  practiceId: string,
  clinicianId: string,
  input: ClientInput,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<Client> {
  const label = input.displayLabel.trim();
  if (!label) throw new ClientError("Enter a display label");
  if (label.length > 40) {
    throw new ClientError("Keep the label short — initials or a slot, not a full name");
  }

  const db = getDb();
  const [row] = await db
    .insert(clients)
    .values({
      practiceId,
      clinicianId,
      displayLabel: label,
      modality: input.modality,
      defaultTemplateId: input.defaultTemplateId ?? null,
      recordingConsent: input.recordingConsent,
      consentNotedAt: input.recordingConsent === "none" ? null : new Date(),
    })
    .returning();

  await recordAudit({
    practiceId,
    actorId: clinicianId,
    action: "created",
    targetKind: "client",
    targetId: row.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { modality: row.modality, reason: "client_created" },
  });

  return row;
}

export async function updateClient(
  practiceId: string,
  clientId: string,
  actorId: string,
  input: Partial<ClientInput> & { status?: "active" | "archived" },
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<Client> {
  const existing = await getClient(practiceId, clientId);
  if (!existing) throw new ClientError("That client no longer exists");

  const consentChanged =
    input.recordingConsent !== undefined &&
    input.recordingConsent !== existing.recordingConsent;

  const db = getDb();
  const [row] = await db
    .update(clients)
    .set({
      displayLabel: input.displayLabel?.trim() || existing.displayLabel,
      modality: input.modality ?? existing.modality,
      defaultTemplateId:
        input.defaultTemplateId === undefined
          ? existing.defaultTemplateId
          : input.defaultTemplateId,
      recordingConsent: input.recordingConsent ?? existing.recordingConsent,
      // The consent timestamp moves only when the consent state itself moves —
      // it is evidence of when consent was obtained, not of when a form was saved.
      consentNotedAt: consentChanged
        ? input.recordingConsent === "none"
          ? null
          : new Date()
        : existing.consentNotedAt,
      status: input.status ?? existing.status,
      updatedAt: new Date(),
    })
    .where(eq(clients.id, clientId))
    .returning();

  await recordAudit({
    practiceId,
    actorId,
    action: "edited",
    targetKind: "client",
    targetId: clientId,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: {
      modality: row.modality,
      status: row.status,
      reason: consentChanged ? "consent_changed" : "client_updated",
    },
  });

  return row;
}

/** The consent script the Capture screen offers when consent is missing. */
export const CONSENT_SCRIPT = `"Before we start, I'd like to record our session so I can write my note from it instead of from memory. The recording is stored encrypted, only I can open it, and it's deleted automatically — my current setting is {days} days. The note I write from it stays in your record. You can say no, or ask me to stop recording at any point, and it won't affect your care. Would that be alright with you?"`;

export function consentScript(retentionDays: number): string {
  return CONSENT_SCRIPT.replace("{days}", String(retentionDays));
}
