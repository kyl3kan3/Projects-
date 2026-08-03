/**
 * src/db/seed.ts — `npm run db:seed`
 *
 * A demo practice with plausible clinical data: one clinician, three clients with
 * different modalities and consent states, and one shorthand session already
 * captured. Every label is obviously fictional, which is the point — this is the
 * data a developer or a design partner should see on a fresh install, not lorem.
 *
 * Idempotent: re-running it reuses the practice if the email already exists.
 */

import "@/lib/load-env";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { clients, practices, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { ensureBuiltinTemplates } from "@/lib/templates";
import { TRIAL_DAYS } from "@/lib/plans";
import { captureSession } from "@/lib/sessions";
import { runPipelineTick } from "@/lib/pipeline";

const EMAIL = "dana@bayview.example";
const PASSWORD = "consulting-room-3pm";

async function main() {
  const db = getDb();
  await ensureBuiltinTemplates();

  const [existing] = await db.select().from(users).where(eq(users.email, EMAIL));
  if (existing) {
    console.log(`seed: ${EMAIL} already exists (practice ${existing.practiceId})`);
    await closeDb();
    return;
  }

  const now = new Date();
  const [practice] = await db
    .insert(practices)
    .values({
      name: "Bayview Counseling",
      plan: "solo",
      trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * 86_400_000),
      baaAcceptedAt: now,
      retentionDays: 30,
      timezone: "America/Los_Angeles",
      settings: { defaultFormat: "soap", notifyOnDraftReady: true },
    })
    .returning();

  const [clinician] = await db
    .insert(users)
    .values({
      practiceId: practice.id,
      email: EMAIL,
      passwordHash: await hashPassword(PASSWORD),
      name: "Dana Alvarez",
      credentials: "LMFT #114382",
      role: "admin",
      defaultFormat: "soap",
      signatureBlock: "Dana Alvarez, LMFT #114382",
    })
    .returning();

  const seeded = await db
    .insert(clients)
    .values([
    {
      practiceId: practice.id,
      clinicianId: clinician.id,
      displayLabel: "J.R.",
      modality: "cbt",
      recordingConsent: "written",
      consentNotedAt: new Date(now.getTime() - 40 * 86_400_000),
    },
    {
      practiceId: practice.id,
      clinicianId: clinician.id,
      displayLabel: "M.T.",
      modality: "emdr",
      recordingConsent: "verbal",
      consentNotedAt: new Date(now.getTime() - 12 * 86_400_000),
    },
    {
      practiceId: practice.id,
      clinicianId: clinician.id,
      displayLabel: "Weds 4pm couple",
      modality: "couples",
      recordingConsent: "none",
    },
    ])
    .returning();

  // One shorthand session, already drafted, so a fresh install opens on a real
  // review room instead of an empty queue. Shorthand rather than audio on
  // purpose: it needs no bytes, no consent, and no ASR provider, so the seed
  // behaves the same whether or not any keys are configured.
  const capture = await captureSession(
    { practice, user: clinician },
    {
      clientId: seeded[0].id,
      captureKind: "shorthand",
      heldAt: new Date(now.getTime() - 2 * 3_600_000),
      durationMinutes: 50,
      shorthandText:
        "Reviewed the thought record from last week. Client reported two panic " +
        "episodes, both at work, both after the 9am stand-up. Rated anxiety 7/10 " +
        "down from 9. Practised paced breathing in session. Homework: continue " +
        "the record, add a column for the physical cue that comes first.",
    },
  );
  await runPipelineTick({ sessionIds: [capture.sessionId], skipPurge: true });

  console.log(`seed: practice ${practice.id}`);
  console.log(`seed: one shorthand session drafted, note ${capture.noteId}`);
  console.log(`seed: sign in as ${EMAIL} / ${PASSWORD}`);
  await closeDb();
}

main().catch(async (err) => {
  console.error("seed failed", err);
  await closeDb();
  process.exit(1);
});
