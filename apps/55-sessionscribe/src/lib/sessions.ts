/**
 * src/lib/sessions.ts
 *
 * Capture, and the queries the Today / Notes screens read.
 *
 * Capture is the one place where three gates meet, and all three are enforced
 * here rather than in the UI so the API cannot be talked past:
 *
 *  1. **Consent.** `capture_kind = 'recording'` requires the client's
 *     `recording_consent` to be something other than `none`. Upload is treated
 *     the same way — an uploaded file is still a recording of a person. Shorthand
 *     is never gated, because it is a first-class path and not a consolation.
 *  2. **The meter.** The 41st note on Solo is refused with an upgrade prompt.
 *     Nothing about reviewing, signing, amending or exporting an existing note is
 *     affected — see `lib/plans.canCapture`.
 *  3. **Plan features.** A modality template beyond `general` needs Caseload or
 *     the trial. The refusal names the plan rather than silently substituting a
 *     different template, which would put an unexpected note format in a chart.
 *
 * The note row is created at capture time, which is what makes "template picker
 * per client with a per-session override" a real feature: the choice is recorded
 * on the note before any drafting happens.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  audioArtifacts,
  clients,
  notes,
  sessions,
  templates,
  transcripts,
  type CaptureKind,
  type Client,
  type Note,
  type Practice,
  type Session,
  type Template,
  type User,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { canCapture, canUseModality, entitlement } from "@/lib/plans";
import { currentPeriodUsage } from "@/lib/usage";
import { purgeAtFor } from "@/lib/retention";
import { audioKey, signedUploadUrl, storageBackend } from "@/lib/storage";
import { listTemplates, resolveTemplate } from "@/lib/templates";
import { localDateKey } from "@/lib/format";
import { billingFacts } from "@/lib/billing";

export class CaptureError extends Error {
  constructor(
    message: string,
    readonly code:
      | "consent"
      | "note_limit"
      | "read_only"
      | "plan_feature"
      | "not_found"
      | "invalid" = "invalid",
  ) {
    super(message);
  }
}

export interface CaptureInput {
  clientId: string;
  captureKind: CaptureKind;
  heldAt?: Date;
  durationMinutes?: number | null;
  shorthandText?: string | null;
  /** Per-session template override; falls back to the client's default. */
  templateId?: string | null;
  mime?: string;
}

export interface CaptureResult {
  sessionId: string;
  noteId: string;
  artifactId: string | null;
  /** How the browser should deliver the bytes. */
  upload: null | { mode: "inline"; url: string } | { mode: "put"; url: string };
}

export async function captureSession(
  ctx: { practice: Practice; user: User },
  input: CaptureInput,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<CaptureResult> {
  const db = getDb();
  const now = new Date();

  const [client] = await db
    .select()
    .from(clients)
    .where(
      and(eq(clients.id, input.clientId), eq(clients.practiceId, ctx.practice.id)),
    );
  if (!client) throw new CaptureError("That client no longer exists", "not_found");

  if (input.captureKind !== "shorthand" && client.recordingConsent === "none") {
    throw new CaptureError(
      `${client.displayLabel} has no recording consent on file. Note consent on the client, or write shorthand instead — shorthand always works.`,
      "consent",
    );
  }

  if (input.captureKind === "shorthand" && !input.shorthandText?.trim()) {
    throw new CaptureError("Write a line or two of shorthand first", "invalid");
  }

  const ent = entitlement(billingFacts(ctx.practice), now);
  const usage = await currentPeriodUsage(ctx.practice.id, ctx.practice.timezone, now);
  const gate = canCapture(ent, usage.notesDrafted);
  if (!gate.allowed) {
    throw new CaptureError(gate.message ?? "Capture is unavailable", gate.reason);
  }

  const available = await listTemplates(ctx.practice.id);
  const template = resolveTemplate(available, {
    overrideId: input.templateId,
    clientDefaultId: client.defaultTemplateId,
    modality: client.modality,
    format: ctx.user.defaultFormat,
  });
  if (!template) {
    throw new CaptureError("No note template is available", "invalid");
  }
  if (!canUseModality(ent, template.modality)) {
    throw new CaptureError(
      `${template.name} is a Caseload feature. Solo covers SOAP and DAP in the general template; upgrade to use modality templates.`,
      "plan_feature",
    );
  }

  const heldAt = input.heldAt ?? now;

  const created = await db.transaction(async (tx) => {
    const [session] = await tx
      .insert(sessions)
      .values({
        clientId: client.id,
        clinicianId: ctx.user.id,
        heldAt,
        durationMinutes: input.durationMinutes ?? null,
        captureKind: input.captureKind,
        shorthandText: input.shorthandText?.trim() || null,
        status: "captured",
      })
      .returning();

    const [note] = await tx
      .insert(notes)
      .values({
        sessionId: session.id,
        clinicianId: ctx.user.id,
        templateId: template.id,
        format: template.format,
        status: "drafting",
        sections: [],
      })
      .returning();

    let artifactId: string | null = null;
    if (input.captureKind !== "shorthand") {
      const mime = input.mime || "audio/webm";
      const [artifact] = await tx
        .insert(audioArtifacts)
        .values({
          sessionId: session.id,
          storageKey: audioKey(session.id, mime),
          mime,
          purgeAt: purgeAtFor(ctx.practice),
        })
        .returning();
      artifactId = artifact.id;
    }

    return { session, note, artifactId };
  });

  await recordAudit({
    practiceId: ctx.practice.id,
    actorId: ctx.user.id,
    action: "created",
    targetKind: "session",
    targetId: created.session.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: {
      clientId: client.id,
      captureKind: input.captureKind,
      templateId: template.id,
      format: template.format,
      modality: template.modality,
      noteId: created.note.id,
    },
  });

  let upload: CaptureResult["upload"] = null;
  if (created.artifactId) {
    if (storageBackend() === "r2") {
      const [artifact] = await db
        .select()
        .from(audioArtifacts)
        .where(eq(audioArtifacts.id, created.artifactId));
      upload = {
        mode: "put",
        url: await signedUploadUrl(artifact.storageKey, artifact.mime),
      };
    } else {
      upload = { mode: "inline", url: `/api/sessions/${created.session.id}/audio` };
    }
  }

  return {
    sessionId: created.session.id,
    noteId: created.note.id,
    artifactId: created.artifactId,
    upload,
  };
}

/** Store uploaded bytes on the inline backend, or record the size for R2. */
export async function attachAudio(
  practiceId: string,
  sessionId: string,
  bytes: Buffer | null,
  info: { byteSize: number; durationSeconds?: number | null; mime?: string },
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ artifact: audioArtifacts })
    .from(audioArtifacts)
    .innerJoin(sessions, eq(sessions.id, audioArtifacts.sessionId))
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .where(and(eq(audioArtifacts.sessionId, sessionId), eq(clients.practiceId, practiceId)));
  if (!row) throw new CaptureError("That session has no audio slot", "not_found");

  await db
    .update(audioArtifacts)
    .set({
      bytes: bytes ?? undefined,
      byteSize: info.byteSize,
      durationSeconds: info.durationSeconds ?? null,
      mime: info.mime ?? row.artifact.mime,
    })
    .where(eq(audioArtifacts.id, row.artifact.id));

  if (info.durationSeconds) {
    await db
      .update(sessions)
      .set({
        durationMinutes: Math.max(1, Math.round(info.durationSeconds / 60)),
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId));
  }
}

/* ----------------------------------------------------------------- queries */

export interface SessionRow {
  session: Session;
  client: Pick<Client, "id" | "displayLabel" | "modality" | "recordingConsent">;
  note: Pick<
    Note,
    "id" | "status" | "format" | "draftGeneratedAt" | "model" | "currentVersion"
  > | null;
}

function rowShape() {
  return {
    session: sessions,
    client: {
      id: clients.id,
      displayLabel: clients.displayLabel,
      modality: clients.modality,
      recordingConsent: clients.recordingConsent,
    },
    note: {
      id: notes.id,
      status: notes.status,
      format: notes.format,
      draftGeneratedAt: notes.draftGeneratedAt,
      model: notes.model,
      currentVersion: notes.currentVersion,
    },
  };
}

/** Sessions held on one practice-local calendar day. */
export async function sessionsForDay(
  practiceId: string,
  timeZone: string,
  day: Date,
): Promise<SessionRow[]> {
  const db = getDb();
  const key = localDateKey(day, timeZone);
  const rows = await db
    .select(rowShape())
    .from(sessions)
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .leftJoin(notes, eq(notes.sessionId, sessions.id))
    .where(
      and(
        eq(clients.practiceId, practiceId),
        sql`to_char(${sessions.heldAt} at time zone ${timeZone}, 'YYYY-MM-DD') = ${key}`,
      ),
    )
    .orderBy(desc(sessions.heldAt));
  return rows as SessionRow[];
}

export type SessionFilter = "all" | "needs_review" | "signed" | "failed";

export async function listSessions(
  practiceId: string,
  filter: SessionFilter = "all",
  limit = 100,
): Promise<SessionRow[]> {
  const db = getDb();
  const conditions = [eq(clients.practiceId, practiceId)];
  if (filter === "needs_review") {
    conditions.push(inArray(notes.status, ["draft", "amended"]));
  } else if (filter === "signed") {
    conditions.push(eq(notes.status, "signed"));
  } else if (filter === "failed") {
    conditions.push(eq(sessions.status, "failed"));
  }
  const rows = await db
    .select(rowShape())
    .from(sessions)
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .leftJoin(notes, eq(notes.sessionId, sessions.id))
    .where(and(...conditions))
    .orderBy(desc(sessions.heldAt))
    .limit(limit);
  return rows as SessionRow[];
}

export async function sessionsForClient(
  practiceId: string,
  clientId: string,
): Promise<SessionRow[]> {
  const db = getDb();
  const rows = await db
    .select(rowShape())
    .from(sessions)
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .leftJoin(notes, eq(notes.sessionId, sessions.id))
    .where(and(eq(clients.practiceId, practiceId), eq(sessions.clientId, clientId)))
    .orderBy(desc(sessions.heldAt));
  return rows as SessionRow[];
}

/** Everything the review room needs, in one round trip. */
export interface NoteContext {
  session: Session;
  client: Client;
  note: Note;
  template: Template;
  transcript: typeof transcripts.$inferSelect | null;
  artifact: typeof audioArtifacts.$inferSelect | null;
}

export async function noteContext(
  practiceId: string,
  noteId: string,
): Promise<NoteContext | null> {
  const db = getDb();
  const [row] = await db
    .select({
      note: notes,
      session: sessions,
      client: clients,
      template: templates,
    })
    .from(notes)
    .innerJoin(sessions, eq(sessions.id, notes.sessionId))
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .innerJoin(templates, eq(templates.id, notes.templateId))
    .where(and(eq(notes.id, noteId), eq(clients.practiceId, practiceId)));
  if (!row) return null;

  const [transcript] = await db
    .select()
    .from(transcripts)
    .where(eq(transcripts.sessionId, row.session.id))
    .limit(1);
  const [artifact] = await db
    .select()
    .from(audioArtifacts)
    .where(eq(audioArtifacts.sessionId, row.session.id))
    .limit(1);

  return {
    note: row.note,
    session: row.session,
    client: row.client,
    template: row.template,
    transcript: transcript ?? null,
    artifact: artifact ?? null,
  };
}

/** Put a failed session back in the queue. Clears the reason and the budget. */
export async function retrySession(
  practiceId: string,
  sessionId: string,
  actorId: string,
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ session: sessions })
    .from(sessions)
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .where(and(eq(sessions.id, sessionId), eq(clients.practiceId, practiceId)));
  if (!row) throw new CaptureError("That session no longer exists", "not_found");
  if (row.session.status !== "failed") {
    throw new CaptureError("That session is not in a failed state", "invalid");
  }

  await db
    .update(sessions)
    .set({
      status: "captured",
      failureReason: null,
      attempts: 0,
      leaseUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, sessionId));

  await recordAudit({
    practiceId,
    actorId,
    action: "created",
    targetKind: "session",
    targetId: sessionId,
    metadata: { reason: "pipeline_retry" },
  });
}
