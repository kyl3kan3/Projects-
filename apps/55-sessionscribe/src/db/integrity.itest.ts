/**
 * src/db/integrity.itest.ts — `npm run test:db`
 *
 * The invariants that only a real database can prove. Kept out of `npm test` (it
 * needs a live Postgres), but it is the suite that actually demonstrates the
 * product's claims rather than describing them:
 *
 *  - the pipeline turns a capture into a reviewable draft, with usage counted and
 *    the work audited;
 *  - signing writes a version, a signature and the status flips in one go;
 *  - a signed note cannot be edited, in the code *or* in the database;
 *  - an amendment produces a new signed version and leaves the old one byte-identical;
 *  - the retention purge deletes media, keeps the row, audits the deletion, and is
 *    idempotent.
 */

import "@/lib/load-env";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import {
  audioArtifacts,
  auditEvents,
  clients,
  notes,
  noteVersions,
  practices,
  sessions,
  signatures,
  templates,
  transcripts,
  usageCounters,
  users,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { ensureBuiltinTemplates } from "@/lib/templates";
import { runPipelineTick } from "@/lib/pipeline";
import { captureSession } from "@/lib/sessions";
import { amendNote, signNote, SignedNoteError, versionChain } from "@/lib/signing";
import { saveSection, NoteEditError } from "@/lib/notes";
import { purgeExpiredArtifacts } from "@/lib/retention";
import { fixtureTranscript } from "@/lib/transcription";

const db = getDb();

let practiceId: string;
let userId: string;
let clientId: string;
let generalTemplateId: string;

before(async () => {
  await ensureBuiltinTemplates();
  const [template] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.modality, "general"), eq(templates.format, "soap")));
  generalTemplateId = template.id;

  const [practice] = await db
    .insert(practices)
    .values({
      name: `itest ${Date.now()}`,
      plan: "caseload",
      trialEndsAt: new Date(Date.now() + 86_400_000),
      baaAcceptedAt: new Date(),
      retentionDays: 30,
      timezone: "America/New_York",
      settings: { notifyOnDraftReady: false },
    })
    .returning();
  practiceId = practice.id;

  const [user] = await db
    .insert(users)
    .values({
      practiceId,
      email: `itest-${Date.now()}@example.test`,
      passwordHash: await hashPassword("itest-password-1234"),
      name: "Itest Clinician",
      credentials: "LCSW #000001",
      role: "admin",
      defaultFormat: "soap",
    })
    .returning();
  userId = user.id;

  const [client] = await db
    .insert(clients)
    .values({
      practiceId,
      clinicianId: userId,
      displayLabel: "I.T.",
      modality: "cbt",
      recordingConsent: "written",
      consentNotedAt: new Date(),
    })
    .returning();
  clientId = client.id;
});

after(async () => {
  await closeDb();
});

async function practiceCtx() {
  const [practice] = await db.select().from(practices).where(eq(practices.id, practiceId));
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return { practice, user };
}

describe("append-only tables are enforced by the database", () => {
  it("refuses to update or delete an audit event", async () => {
    const [event] = await db
      .insert(auditEvents)
      .values({
        practiceId,
        actorKind: "system",
        action: "viewed",
        targetKind: "practice",
        targetId: practiceId,
      })
      .returning();

    await assert.rejects(
      () => db.update(auditEvents).set({ action: "signed" }).where(eq(auditEvents.id, event.id)),
      /append-only/,
    );
    await assert.rejects(
      () => db.delete(auditEvents).where(eq(auditEvents.id, event.id)),
      /append-only/,
    );
  });
});

describe("capture to signed record, end to end", () => {
  let noteId: string;
  let sessionId: string;

  it("captures a shorthand session and drafts it", async () => {
    const ctx = await practiceCtx();
    const result = await captureSession(ctx, {
      clientId,
      captureKind: "shorthand",
      shorthandText:
        "reviewed exposure hierarchy step 3, client rated 4/10 at rest and 7/10 in the car park, HW step 4 twice with thought record",
      durationMinutes: 50,
    });
    noteId = result.noteId;
    sessionId = result.sessionId;

    const tick = await runPipelineTick({ sessionIds: [sessionId], skipPurge: true });
    assert.equal(tick.drafted, 1, "the tick should draft exactly this session");

    const [note] = await db.select().from(notes).where(eq(notes.id, noteId));
    assert.equal(note.status, "draft");
    assert.equal(note.currentVersion, 1, "the machine draft is version 1");
    assert.ok(note.sections.length >= 3, "every template section is present");
    assert.ok(note.sections.some((s) => s.text.length > 0));
    assert.ok(note.draftGeneratedAt);

    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    assert.equal(session.status, "ready");
    assert.equal(session.failureReason, null);
    assert.equal(session.leaseUntil, null, "the lease is released when work completes");

    const [counter] = await db
      .select()
      .from(usageCounters)
      .where(eq(usageCounters.practiceId, practiceId));
    assert.equal(counter.notesDrafted, 1, "the meter counts a produced draft");

    const drafted = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.practiceId, practiceId), eq(auditEvents.action, "drafted")));
    assert.equal(drafted.length, 1);
    assert.equal(drafted[0].actorKind, "system");
    // The audit metadata carries counts and ids, never note text.
    assert.equal(JSON.stringify(drafted[0].metadata).includes("exposure"), false);
  });

  it("keeps the pristine draft as an immutable version 1", async () => {
    const [version] = await db
      .select()
      .from(noteVersions)
      .where(and(eq(noteVersions.noteId, noteId), eq(noteVersions.version, 1)));
    assert.equal(version.reason, "draft");
    await assert.rejects(
      () =>
        db
          .update(noteVersions)
          .set({ sections: [] })
          .where(eq(noteVersions.id, version.id)),
      /append-only/,
    );
  });

  it("accepts an edit before signing", async () => {
    const note = await saveSection(
      practiceId,
      noteId,
      "plan",
      "Step 4 of the hierarchy twice this week, with a thought record each time.",
      userId,
    );
    const plan = note.sections.find((s) => s.key === "plan");
    assert.match(plan?.text ?? "", /Step 4 of the hierarchy/);
  });

  it("signs in one transaction: version, signature, statuses", async () => {
    const result = await signNote(noteId, userId, { ip: "203.0.113.7" });
    assert.equal(result.version, 2, "the signed version follows the draft");
    assert.equal(result.contentHash.length, 64);

    const [note] = await db.select().from(notes).where(eq(notes.id, noteId));
    assert.equal(note.status, "signed");
    assert.equal(note.currentVersion, 2);

    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    assert.equal(session.status, "signed");

    const rows = await db.select().from(signatures).where(eq(signatures.noteId, noteId));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].version, 2);
    assert.equal(rows[0].signerCredentials, "LCSW #000001");
    assert.equal(rows[0].contentHash, result.contentHash);

    const chain = await versionChain(noteId);
    assert.equal(chain.length, 2);
    assert.equal(chain.at(-1)?.intact, true, "the stored hash matches the stored content");

    const signedEvents = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.practiceId, practiceId), eq(auditEvents.action, "signed")));
    assert.equal(signedEvents.length, 1);
    assert.equal(signedEvents[0].ip, "203.0.113.7");
  });

  it("refuses every edit path once signed", async () => {
    await assert.rejects(
      () => saveSection(practiceId, noteId, "plan", "sneaky change", userId),
      SignedNoteError,
    );
    await assert.rejects(() => signNote(noteId, userId), SignedNoteError);
  });

  it("refuses to mutate a signature row even from SQL", async () => {
    await assert.rejects(
      () =>
        db
          .update(signatures)
          .set({ contentHash: "0".repeat(64) })
          .where(eq(signatures.noteId, noteId)),
      /append-only/,
    );
  });

  it("amends into a new signed version and leaves the old one untouched", async () => {
    const beforeV2 = await db
      .select()
      .from(noteVersions)
      .where(and(eq(noteVersions.noteId, noteId), eq(noteVersions.version, 2)));

    await amendNote(noteId, userId);
    const [amending] = await db.select().from(notes).where(eq(notes.id, noteId));
    assert.equal(amending.status, "amended", "an amendment is not a signed state");

    await saveSection(
      practiceId,
      noteId,
      "assessment",
      "Amended: corrected the rating recorded at rest to 4/10.",
      userId,
    );
    const second = await signNote(noteId, userId);
    assert.equal(second.version, 3);

    const chain = await versionChain(noteId);
    assert.equal(chain.length, 3);
    assert.equal(chain[2].version.reason, "amendment");
    assert.equal(chain[1].signature?.version, 2);
    assert.equal(chain[2].signature?.version, 3);
    assert.notEqual(chain[1].signature?.contentHash, chain[2].signature?.contentHash);
    assert.ok(chain.every((v) => v.intact));

    const afterV2 = await db
      .select()
      .from(noteVersions)
      .where(and(eq(noteVersions.noteId, noteId), eq(noteVersions.version, 2)));
    assert.deepEqual(
      afterV2[0].sections,
      beforeV2[0].sections,
      "the previously signed version is byte-identical after the amendment",
    );
  });

  it("keeps one note per session", async () => {
    await assert.rejects(
      () =>
        db.insert(notes).values({
          sessionId,
          clinicianId: userId,
          templateId: generalTemplateId,
          format: "soap",
          status: "draft",
          sections: [],
        }),
      /notes_session_unique|duplicate key/,
    );
  });
});

describe("the consent gate and the pipeline's failure path", () => {
  it("blocks recording without consent and never blocks shorthand", async () => {
    const ctx = await practiceCtx();
    const [noConsent] = await db
      .insert(clients)
      .values({
        practiceId,
        clinicianId: userId,
        displayLabel: "N.C.",
        modality: "general",
        recordingConsent: "none",
      })
      .returning();

    await assert.rejects(
      () => captureSession(ctx, { clientId: noConsent.id, captureKind: "recording" }),
      /no recording consent on file/i,
    );

    const shorthand = await captureSession(ctx, {
      clientId: noConsent.id,
      captureKind: "shorthand",
      shorthandText: "brief check-in, no recording, client declined taping",
    });
    assert.ok(shorthand.noteId);
  });

  it("fails a session whose audio never arrived, with a reason a person can act on", async () => {
    const ctx = await practiceCtx();
    const capture = await captureSession(ctx, {
      clientId,
      captureKind: "upload",
      mime: "audio/webm",
    });
    // No bytes are ever attached: the upload was interrupted.
    const tick = await runPipelineTick({ sessionIds: [capture.sessionId], skipPurge: true });
    assert.equal(tick.failed, 1);
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, capture.sessionId));
    assert.equal(session.status, "failed");
    assert.match(session.failureReason ?? "", /re-record, or write shorthand instead/);
    assert.equal(session.leaseUntil, null);
  });

  it("transcribes and drafts an uploaded file, and labels the fixture provider", async () => {
    const ctx = await practiceCtx();
    const capture = await captureSession(ctx, {
      clientId,
      captureKind: "upload",
      mime: "audio/webm",
    });
    await db
      .update(audioArtifacts)
      .set({ bytes: Buffer.alloc(64 * 1024, 7), byteSize: 64 * 1024, durationSeconds: 3_000 })
      .where(eq(audioArtifacts.sessionId, capture.sessionId));

    const tick = await runPipelineTick({ sessionIds: [capture.sessionId], skipPurge: true });
    assert.equal(tick.transcribed, 1);
    assert.equal(tick.drafted, 1);

    const [transcript] = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.sessionId, capture.sessionId));
    assert.equal(transcript.provider, "fixture", "an install with no ASR key says so");
    assert.ok(transcript.segments.length > 5);
    assert.ok(transcript.wordCount > 50);

    const [note] = await db.select().from(notes).where(eq(notes.id, capture.noteId));
    assert.match(note.model ?? "", /^fixture/);
    // Every cited span must exist in the transcript that was actually stored.
    for (const section of note.sections) {
      for (const sentence of section.sentences ?? []) {
        for (const span of sentence.sourceSpans) {
          assert.ok(
            transcript.segments.some(
              (seg) => seg.startMs < span.endMs && span.startMs < seg.endMs,
            ),
            "a citation must point at a real segment",
          );
        }
      }
    }
  });
});

describe("retention purges media and keeps the evidence", () => {
  it("deletes bytes, stamps the row, audits it, and is idempotent", async () => {
    const ctx = await practiceCtx();
    const capture = await captureSession(ctx, {
      clientId,
      captureKind: "upload",
      mime: "audio/webm",
    });
    await db
      .update(audioArtifacts)
      .set({
        bytes: Buffer.alloc(4096, 3),
        byteSize: 4096,
        // Backdated in SQL, so the comparison is Postgres's own clock.
        purgeAt: sql`now() - interval '1 day'`,
      })
      .where(eq(audioArtifacts.sessionId, capture.sessionId));
    await db.insert(transcripts).values({
      sessionId: capture.sessionId,
      provider: "fixture",
      segments: fixtureTranscript({
        audio: Buffer.alloc(2048),
        mime: "audio/webm",
        modality: "cbt",
        durationSeconds: 600,
      }).segments,
      wordCount: 120,
      purgeAt: sql`now() - interval '1 day'` as unknown as Date,
    });

    const first = await purgeExpiredArtifacts({ practiceId });
    assert.ok(first.audioPurged >= 1);
    assert.ok(first.transcriptsPurged >= 1);
    assert.equal(first.errors, 0);

    const [artifact] = await db
      .select()
      .from(audioArtifacts)
      .where(eq(audioArtifacts.sessionId, capture.sessionId));
    assert.ok(artifact, "the row survives the purge so the audit trail can point at it");
    assert.ok(artifact.purgedAt);
    assert.equal(artifact.bytes, null, "the bytes are gone");
    assert.equal(artifact.byteSize, 4096, "the size stays as evidence of what was deleted");

    const [transcript] = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.sessionId, capture.sessionId));
    assert.ok(transcript.purgedAt);
    assert.deepEqual(transcript.segments, []);

    const purges = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.practiceId, practiceId), eq(auditEvents.action, "purged")));
    assert.ok(purges.length >= 2);
    assert.ok(purges.every((p) => p.actorKind === "system"));

    const second = await purgeExpiredArtifacts({ practiceId });
    assert.equal(second.audioPurged, 0, "a second pass finds nothing left to do");
    assert.equal(second.transcriptsPurged, 0);
  });
});
