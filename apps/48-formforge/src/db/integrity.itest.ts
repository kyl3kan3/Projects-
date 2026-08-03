/**
 * src/db/integrity.itest.ts
 *
 * The guarantees this product is sold on, proven against a real Postgres by
 * attacking them. `npm run test:db` (needs DATABASE_URL, FIELD_ENCRYPTION_MASTER_KEY
 * and INTAKE_TOKEN_SECRET; run `npm run db:migrate` first).
 *
 * Kept out of `npm test` on purpose — the unit suite has to run with no database
 * anywhere, and a test that silently skips is a test that silently stops covering
 * anything. This file either runs against a database or fails loudly.
 *
 * What it proves, each by trying to break it:
 *
 *  1. PHI is ciphertext in the table, inspected with raw SQL, not through the ORM.
 *  2. A second practice's data key cannot open the first practice's rows.
 *  3. Cross-practice reads return nothing — by id, by token, by patient.
 *  4. UPDATE and DELETE on audit_events are refused by the database.
 *  5. A published form version cannot be edited, and a signature survives the form
 *     being rewritten twice.
 *  6. The reminder ladder fires each rung once and stops on completion.
 *  7. Every staff read of a packet appends a `viewed` audit row.
 *  8. Re-issuing a link retires the old token.
 *  9. The retention sweep deletes and records the deletion.
 */

import "@/lib/load-env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import {
  auditEvents,
  formVersions,
  forms,
  intakes,
  patients,
  practices,
  reminders,
  signatureRecords,
  submissions,
  users,
  type FormVersion,
  type Practice,
  type User,
} from "@/db/schema";
import { generatePracticeDek, open, unwrapDek } from "@/lib/crypto";
import { env } from "@/lib/env";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { hashPassword } from "@/lib/auth";
import { createFormFromTemplate, latestVersion, publishForm, saveDraft } from "@/lib/forms";
import { getPatientIdentity, upsertPatient } from "@/lib/patients";
import {
  captureSignature,
  completeIntake,
  getIntake,
  readPacket,
  reissueToken,
  resolveIntakeToken,
  retentionSweep,
  saveSection,
  sendIntake,
  signaturesFor,
} from "@/lib/intakes";
import { claimDueReminders } from "@/lib/reminders";
import { verifySignature } from "@/lib/signature";
import { forgetPracticeDek } from "@/lib/phi";
import { sections } from "@/lib/blocks";

const db = getDb();

interface Tenant {
  practice: Practice;
  user: User;
  actor: { type: "user"; id: string; label: string; ip: string };
}

async function makeTenant(name: string): Promise<Tenant> {
  const dek = generatePracticeDek(env.masterKey);
  const [practice] = await db
    .insert(practices)
    .values({
      name,
      plan: "group",
      dekWrapped: dek.wrapped,
      dekKeyId: dek.keyId,
      settings: DEFAULT_SETTINGS,
      trialEndsAt: new Date(Date.now() + 14 * 86_400_000),
    })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      practiceId: practice.id,
      email: `owner-${randomUUID()}@example.test`,
      name: `Owner of ${name}`,
      passwordHash: await hashPassword("integration-test-password"),
      role: "owner",
    })
    .returning();
  return {
    practice,
    user,
    actor: { type: "user", id: user.id, label: `${user.name} (owner)`, ip: "198.51.100.24" },
  };
}

let alpha: Tenant;
let beta: Tenant;
let alphaVersion: FormVersion;
let alphaFormId: string;
let alphaPatientId: string;
let alphaIntakeId: string;
let alphaToken: string;

const ANSWERS: Record<string, string> = {
  "demographics.first_name": "Dana",
  "demographics.last_name": "Okonkwo",
  "demographics.dob": "1988-04-12",
  "demographics.phone": "+1 303 555 0117",
  "demographics.email": "dana.okonkwo@example.com",
  "demographics.emergency_name": "Ruth Okonkwo",
  "demographics.emergency_phone": "+1 303 555 0164",
  "insurance.self_pay": "no",
  "history.presenting_concern": "Panic attacks since March, worse before work",
  "history.prior_therapy": "yes",
  ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`phq9.i${i + 1}`, "2"])),
  ...Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`gad7.i${i + 1}`, "1"])),
};

before(async () => {
  alpha = await makeTenant(`Riverbend Counseling ${randomUUID().slice(0, 8)}`);
  beta = await makeTenant(`Cedar Hill Psychology ${randomUUID().slice(0, 8)}`);

  const form = await createFormFromTemplate(alpha.practice.id, "behavioral_health_v1", alpha.actor);
  alphaFormId = form.id;
  await publishForm(alpha.practice.id, form.id, alpha.actor);
  const version = await latestVersion(alpha.practice.id, form.id);
  assert.ok(version, "publish produced no version");
  alphaVersion = version;

  const { patient } = await upsertPatient(
    alpha.practice,
    {
      firstName: "Dana",
      lastName: "Okonkwo",
      email: "dana.okonkwo@example.com",
      phone: "+1 303 555 0117",
      dob: "1988-04-12",
    },
    alpha.actor,
  );
  alphaPatientId = patient.id;

  const sent = await sendIntake({
    practice: alpha.practice,
    patientId: patient.id,
    formId: form.id,
    version,
    channelEmail: true,
    channelSms: true,
    actor: alpha.actor,
  });
  alphaIntakeId = sent.intake.id;
  alphaToken = sent.rawToken;

  // Fill every section and sign both consents, as the patient.
  const all = sections(version.blocks);
  for (let i = 0; i < all.length; i += 1) {
    const fresh = await resolveIntakeToken(alphaToken);
    assert.ok(fresh.ok);
    const { problems } = await saveSection({
      resolved: fresh.value,
      sectionIndex: i,
      answers: ANSWERS,
      ip: "73.92.1.8",
    });
    assert.deepEqual(problems, [], `section ${i} did not validate`);

    const signatureBlock = all[i].blocks.find((b) => b.kind === "signature");
    if (signatureBlock) {
      const latest = await resolveIntakeToken(alphaToken);
      assert.ok(latest.ok);
      const captured = await captureSignature({
        resolved: latest.value,
        blockKey: signatureBlock.key,
        signature: {
          kind: "typed",
          payload: "Dana Okonkwo",
          signedName: "Dana Okonkwo",
          disclosureAccepted: true,
        },
        ip: "73.92.1.8",
        userAgent: "Mozilla/5.0 (iPhone)",
      });
      assert.deepEqual(captured.problems, [], "signature was refused");
    }
  }
  const finished = await resolveIntakeToken(alphaToken);
  assert.ok(finished.ok);
  await completeIntake(finished.value, "73.92.1.8");
});

after(async () => {
  await closeDb();
});

/* ------------------------------------------------------------------ 1 and 2 */

describe("PHI at rest", () => {
  it("stores patient identifiers as ciphertext, checked with raw SQL", async () => {
    const rows = await db.execute<{ first: string; last: string; answers: string }>(
      sql`select
            encode(first_name_enc, 'escape') as first,
            encode(last_name_enc, 'escape') as last,
            (select encode(answers_enc, 'escape') from submissions s where s.intake_id = ${alphaIntakeId}) as answers
          from patients where id = ${alphaPatientId}`,
    );
    const row = rows[0] as unknown as { first: string; last: string; answers: string };
    assert.ok(row, "no patient row");
    // The plaintext must not appear anywhere in the stored bytes.
    for (const field of [row.first, row.last, row.answers]) {
      assert.ok(!field.includes("Okonkwo"), "a surname is readable in the database");
      assert.ok(!field.includes("Dana"), "a first name is readable in the database");
    }
    assert.ok(!row.answers.includes("Panic attacks"), "an answer is readable in the database");
    assert.ok(!row.answers.includes("1988-04-12"), "a date of birth is readable in the database");
    // ...and it is a FormForge envelope, not base64 or plain text.
    assert.ok(row.first.startsWith("FF1"), "the column is not an envelope");
  });

  it("keeps screener totals outside the ciphertext so the board can report them", async () => {
    const [row] = await db
      .select({ scores: submissions.scoreSummary })
      .from(submissions)
      .where(eq(submissions.intakeId, alphaIntakeId));
    assert.equal(row.scores.phq9.total, 18);
    assert.equal(row.scores.phq9.severity, "moderately_severe");
    assert.equal(row.scores.gad7.total, 7);
    // Item answers are not in there.
    assert.ok(!JSON.stringify(row.scores).includes("i1"));
  });

  it("refuses the second practice's data key on the first practice's rows", async () => {
    const [row] = await db.select().from(patients).where(eq(patients.id, alphaPatientId));
    const betaDek = unwrapDek(beta.practice.dekWrapped, env.masterKey);
    assert.throws(() => open(row.firstNameEnc, betaDek), /Authentication failed/);
    // And the right key still works, so the failure is the key and not the data.
    const alphaDek = unwrapDek(alpha.practice.dekWrapped, env.masterKey);
    assert.equal(open(row.firstNameEnc, alphaDek).toString("utf8"), "Dana");
  });

  it("refuses a wrong master key on the wrapped data key", () => {
    const wrong = "aa".repeat(32);
    assert.throws(() => unwrapDek(alpha.practice.dekWrapped, wrong), /Authentication failed/);
  });

  it("refuses a tampered ciphertext even with the right key", async () => {
    const [row] = await db.select().from(patients).where(eq(patients.id, alphaPatientId));
    const alphaDek = unwrapDek(alpha.practice.dekWrapped, env.masterKey);
    const tampered = Buffer.from(row.firstNameEnc);
    tampered[tampered.length - 3] ^= 0x01;
    assert.throws(() => open(tampered, alphaDek), /Authentication failed/);
  });
});

/* ----------------------------------------------------------------------- 3 */

describe("cross-practice isolation, by attack", () => {
  it("will not hand practice B a packet belonging to practice A", async () => {
    assert.equal(await getIntake(beta.practice.id, alphaIntakeId), null);
    assert.ok(await getIntake(alpha.practice.id, alphaIntakeId));
  });

  it("will not hand practice B a patient belonging to practice A", async () => {
    assert.equal(await getPatientIdentity(beta.practice, alphaPatientId, beta.actor), null);
  });

  it("will not let practice B decrypt practice A's packet even holding the row", async () => {
    const resolved = await getIntake(alpha.practice.id, alphaIntakeId);
    assert.ok(resolved);
    // The attack: swap in the other practice's record, keeping A's data. This is
    // what a mixed-up id in a hand-written query would look like.
    forgetPracticeDek();
    await assert.rejects(
      () => readPacket({ ...resolved, practice: beta.practice }, beta.actor),
      /does not belong to this practice/,
      "practice B decrypted practice A's answers",
    );
    // Refused before the cipher and before the audit hook, so nothing about
    // practice A ends up in practice B's ledger. Verified in the next test.
  });

  it("will not let practice B publish or edit practice A's form", async () => {
    await assert.rejects(
      () => saveDraft(beta.practice.id, alphaFormId, { title: "hijacked" }, beta.actor),
      /not in this practice/,
    );
    await assert.rejects(() => publishForm(beta.practice.id, alphaFormId, beta.actor), /not in this practice/);
    const [row] = await db.select({ title: forms.title }).from(forms).where(eq(forms.id, alphaFormId));
    assert.notEqual(row.title, "hijacked");
  });

  it("will not let practice B send a packet against practice A's version", async () => {
    const { patient } = await upsertPatient(
      beta.practice,
      { firstName: "Sam", lastName: "Nguyen" },
      beta.actor,
    );
    await assert.rejects(
      () =>
        sendIntake({
          practice: beta.practice,
          patientId: patient.id,
          formId: alphaFormId,
          version: alphaVersion,
          channelEmail: true,
          channelSms: false,
          actor: beta.actor,
        }),
      /not in this practice/,
    );
  });

  it("will not let practice B send to practice A's patient", async () => {
    const betaForm = await createFormFromTemplate(beta.practice.id, "dietitian_v1", beta.actor);
    await publishForm(beta.practice.id, betaForm.id, beta.actor);
    const betaVersion = await latestVersion(beta.practice.id, betaForm.id);
    assert.ok(betaVersion);
    await assert.rejects(
      () =>
        sendIntake({
          practice: beta.practice,
          patientId: alphaPatientId,
          formId: betaForm.id,
          version: betaVersion,
          channelEmail: true,
          channelSms: false,
          actor: beta.actor,
        }),
      /not in this practice/,
    );
  });

  it("keeps practice B's audit log free of practice A's events", async () => {
    const rows = await db
      .select({ targetId: auditEvents.targetId })
      .from(auditEvents)
      .where(eq(auditEvents.practiceId, beta.practice.id));
    assert.ok(!rows.some((r) => r.targetId === alphaIntakeId));
    assert.ok(!rows.some((r) => r.targetId === alphaPatientId));
  });
});

/* ----------------------------------------------------------------------- 4 */

describe("the audit log is append-only in the database", () => {
  it("refuses UPDATE", async () => {
    await assert.rejects(
      () =>
        db.execute(
          sql`update audit_events set actor_label = 'nobody' where practice_id = ${alpha.practice.id}`,
        ),
      /append-only/,
    );
  });

  it("refuses DELETE", async () => {
    await assert.rejects(
      () => db.execute(sql`delete from audit_events where practice_id = ${alpha.practice.id}`),
      /append-only/,
    );
  });

  it("refuses TRUNCATE", async () => {
    await assert.rejects(() => db.execute(sql`truncate audit_events`), /append-only/);
  });

  it("still accepts INSERT, or the log would be useless", async () => {
    const before = await countAudit(alpha.practice.id);
    await db.insert(auditEvents).values({
      practiceId: alpha.practice.id,
      actorType: "system",
      actorId: "integrity-test",
      actorLabel: "integrity test",
      action: "viewed",
      targetType: "practice",
      targetId: alpha.practice.id,
      targetLabel: "append check",
    });
    assert.equal(await countAudit(alpha.practice.id), before + 1);
  });
});

async function countAudit(practiceId: string): Promise<number> {
  const rows = await db
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(eq(auditEvents.practiceId, practiceId));
  return rows.length;
}

/* ----------------------------------------------------------------------- 5 */

describe("a signature is evidence, not a join", () => {
  it("refuses to update a published form version", async () => {
    await assert.rejects(
      () =>
        db.execute(
          sql`update form_versions set blocks = '[]'::jsonb where id = ${alphaVersion.id}`,
        ),
      /append-only/,
    );
  });

  it("refuses to delete a published form version", async () => {
    await assert.rejects(
      () => db.execute(sql`delete from form_versions where id = ${alphaVersion.id}`),
      /append-only/,
    );
  });

  it("refuses to update a signature record", async () => {
    const [signature] = await signaturesFor(alphaIntakeId);
    await assert.rejects(
      () =>
        db.execute(sql`update signature_records set signed_text = 'edited' where id = ${signature.id}`),
      /append-only/,
    );
  });

  it("keeps meaning what it meant after the form is rewritten twice", async () => {
    const before = await signaturesFor(alphaIntakeId);
    assert.equal(before.length, 2, "the packet should carry two signatures");
    const original = before.find((s) => s.blockKey === "sign_treatment");
    assert.ok(original);
    assert.equal(verifySignature(original).ok, true);
    const originalText = original.signedText;
    const originalHash = original.documentHash;

    // Rewrite the consent text and publish twice more.
    const form = await db.select().from(forms).where(eq(forms.id, alphaFormId));
    const blocks = form[0].blocks.map((b) =>
      b.kind === "consent" && b.key === "consent_treatment"
        ? {
            ...b,
            config: {
              ...b.config,
              body: "I agree to absolutely anything the practice decides, forever, including things not yet invented.",
            },
          }
        : b,
    );
    await saveDraft(alpha.practice.id, alphaFormId, { blocks }, alpha.actor);
    await publishForm(alpha.practice.id, alphaFormId, alpha.actor);
    await publishForm(alpha.practice.id, alphaFormId, alpha.actor);

    const after = await signaturesFor(alphaIntakeId);
    const still = after.find((s) => s.blockKey === "sign_treatment");
    assert.ok(still);
    assert.equal(still.signedText, originalText, "the signed text changed under the signature");
    assert.equal(still.documentHash, originalHash, "the document hash changed");
    assert.equal(verifySignature(still).ok, true, "the evidence no longer verifies");
    assert.ok(!still.signedText.includes("absolutely anything"));

    // The new version exists and says the new thing — both facts are true at once.
    const newest = await latestVersion(alpha.practice.id, alphaFormId);
    assert.ok(newest);
    assert.equal(newest.version, 3);
    const consent = newest.blocks.find((b) => b.key === "consent_treatment");
    assert.ok(String(consent?.config.body).includes("absolutely anything"));
    // And the intake still points at the version the patient actually saw.
    const [intakeRow] = await db
      .select({ versionId: intakes.formVersionId })
      .from(intakes)
      .where(eq(intakes.id, alphaIntakeId));
    assert.equal(intakeRow.versionId, alphaVersion.id);
  });

  it("records the IP, the user agent and the disclosure it was shown", async () => {
    const [signature] = await signaturesFor(alphaIntakeId);
    assert.equal(signature.ip, "73.92.1.8");
    assert.match(signature.userAgent ?? "", /iPhone/);
    assert.match(signature.disclosureText, /electronically/);
    assert.ok(signature.disclosureAcceptedAt instanceof Date);
  });
});

/* ----------------------------------------------------------------------- 6 */

describe("the reminder ladder", () => {
  it("materialised four rungs for an email+SMS send and cancelled them on completion", async () => {
    const rows = await db.select().from(reminders).where(eq(reminders.intakeId, alphaIntakeId));
    assert.equal(rows.length, 4, "expected three email rungs plus one SMS");
    assert.equal(rows.filter((r) => r.channel === "email").length, 3);
    assert.equal(rows.filter((r) => r.channel === "sms").length, 1);
    // The packet was completed in `before`, so nothing is left pending.
    assert.equal(rows.filter((r) => r.status === "pending").length, 0);
    assert.equal(rows.filter((r) => r.status === "cancelled").length, 4);
  });

  it("claims a due rung exactly once, however many ticks run", async () => {
    // Twenty days back, so every rung of the 48h/5d/10d ladder is in the past and
    // none of them can be "not due yet" while the assertions run.
    const { patient } = await upsertPatient(
      alpha.practice,
      { firstName: "Marcus", lastName: `Villalobos-${randomUUID().slice(0, 6)}` },
      alpha.actor,
    );
    const sent = await sendIntake({
      practice: alpha.practice,
      patientId: patient.id,
      formId: alphaFormId,
      version: alphaVersion,
      channelEmail: true,
      channelSms: false,
      actor: alpha.actor,
      now: new Date(Date.now() - 20 * 86_400_000),
    });
    const mine = await db
      .select({ id: reminders.id, scheduledFor: reminders.scheduledFor })
      .from(reminders)
      .where(eq(reminders.intakeId, sent.intake.id));
    assert.equal(mine.length, 3, "expected three email rungs");
    assert.ok(
      mine.every((r) => r.scheduledFor.getTime() < Date.now()),
      "all three rungs should already be due",
    );

    // Two overlapping ticks: the second must not see anything the first claimed.
    const first = await claimDueReminders(200);
    const second = await claimDueReminders(200);
    const firstIds = new Set(first.map((r) => r.id));
    for (const row of second) {
      assert.ok(!firstIds.has(row.id), "a rung was claimed by two ticks");
    }
    // Every rung of this intake was claimed exactly once, and none is left pending.
    const claimedHere = [...first, ...second].filter((r) => r.intakeId === sent.intake.id);
    assert.equal(claimedHere.length, 3, "not every due rung was claimed");
    assert.equal(new Set(claimedHere.map((r) => r.id)).size, 3, "a rung appeared twice");
    const after = await db
      .select({ status: reminders.status })
      .from(reminders)
      .where(eq(reminders.intakeId, sent.intake.id));
    assert.equal(after.filter((r) => r.status === "pending").length, 0);
    assert.equal(after.filter((r) => r.status === "sent").length, 3);
  });
});

/* ----------------------------------------------------------------------- 7 */

describe("no unaudited read of PHI", () => {
  it("appends a viewed row every time staff read a packet", async () => {
    const resolved = await getIntake(alpha.practice.id, alphaIntakeId);
    assert.ok(resolved);
    const before = await countViewed(alpha.practice.id, alphaIntakeId);
    await readPacket(resolved, alpha.actor);
    const after = await countViewed(alpha.practice.id, alphaIntakeId);
    assert.equal(after, before + 1, "reading a packet did not write an audit row");
  });

  it("records who, what, when and from where", async () => {
    const rows = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.practiceId, alpha.practice.id),
          eq(auditEvents.targetId, alphaIntakeId),
          eq(auditEvents.action, "viewed"),
        ),
      );
    const row = rows[0];
    assert.match(row.actorLabel, /owner/);
    assert.equal(row.ip, "198.51.100.24");
    assert.ok(row.createdAt instanceof Date);
    // ...and no PHI in the metadata.
    const meta = JSON.stringify(row.metadata ?? {});
    assert.ok(!meta.includes("Okonkwo"));
    assert.ok(!meta.includes("Dana"));
  });

  it("records the patient's own reads separately from a staff disclosure", async () => {
    const rows = await db
      .select({ actorType: auditEvents.actorType, actorLabel: auditEvents.actorLabel })
      .from(auditEvents)
      .where(and(eq(auditEvents.practiceId, alpha.practice.id), eq(auditEvents.targetId, alphaIntakeId)));
    assert.ok(rows.some((r) => r.actorType === "patient"));
    assert.ok(rows.some((r) => r.actorType === "user"));
  });

  it("records the signature as a signed event", async () => {
    const rows = await db
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(and(eq(auditEvents.practiceId, alpha.practice.id), eq(auditEvents.targetId, alphaIntakeId)));
    assert.ok(rows.some((r) => r.action === "signed"));
    assert.ok(rows.some((r) => r.action === "sent"));
  });
});

async function countViewed(practiceId: string, targetId: string): Promise<number> {
  const rows = await db
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.practiceId, practiceId),
        eq(auditEvents.targetId, targetId),
        eq(auditEvents.action, "viewed"),
      ),
    );
  return rows.length;
}

/* ----------------------------------------------------------------------- 8 */

describe("link tokens", () => {
  it("stores only a hash, so the table cannot be replayed", async () => {
    const [row] = await db
      .select({ tokenHash: intakes.tokenHash })
      .from(intakes)
      .where(eq(intakes.id, alphaIntakeId));
    assert.match(row.tokenHash, /^[0-9a-f]{64}$/);
    assert.notEqual(row.tokenHash, alphaToken);
    assert.ok(!row.tokenHash.includes(alphaToken));
  });

  it("retires the previous token when a link is re-issued", async () => {
    const { patient } = await upsertPatient(
      alpha.practice,
      { firstName: "Priya", lastName: `Raghunathan-${randomUUID().slice(0, 6)}`, email: "priya@example.com" },
      alpha.actor,
    );
    const sent = await sendIntake({
      practice: alpha.practice,
      patientId: patient.id,
      formId: alphaFormId,
      version: alphaVersion,
      channelEmail: true,
      channelSms: false,
      actor: alpha.actor,
    });
    const first = await resolveIntakeToken(sent.rawToken);
    assert.ok(first.ok);

    const replacement = await reissueToken(alpha.practice.id, sent.intake.id, alpha.actor);
    const oldAttempt = await resolveIntakeToken(sent.rawToken);
    assert.equal(oldAttempt.ok, false, "the old link still worked after re-issue");
    const newAttempt = await resolveIntakeToken(replacement);
    assert.equal(newAttempt.ok, true);
  });

  it("refuses a token that has expired, without saying why to a stranger", async () => {
    const { patient } = await upsertPatient(
      alpha.practice,
      { firstName: "Elena", lastName: `Marsh-${randomUUID().slice(0, 6)}` },
      alpha.actor,
    );
    const sent = await sendIntake({
      practice: alpha.practice,
      patientId: patient.id,
      formId: alphaFormId,
      version: alphaVersion,
      channelEmail: true,
      channelSms: false,
      actor: alpha.actor,
    });
    await db
      .update(intakes)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(intakes.id, sent.intake.id));
    const attempt = await resolveIntakeToken(sent.rawToken);
    assert.equal(attempt.ok, false);
    // A made-up token gets exactly the same shape of answer.
    const nonsense = await resolveIntakeToken("this-is-not-a-real-token");
    assert.equal(nonsense.ok, false);
  });

  it("dedupes a patient by the blind index rather than creating a second record", async () => {
    const before = await db
      .select({ id: patients.id })
      .from(patients)
      .where(eq(patients.practiceId, alpha.practice.id));
    const { patient, created } = await upsertPatient(
      alpha.practice,
      { firstName: "  dana  ", lastName: "OKONKWO", phone: "+1 303 555 9999" },
      alpha.actor,
    );
    assert.equal(created, false, "a second record was created for the same person");
    assert.equal(patient.id, alphaPatientId);
    const after = await db
      .select({ id: patients.id })
      .from(patients)
      .where(eq(patients.practiceId, alpha.practice.id));
    assert.equal(after.length, before.length);
  });
});

/* ----------------------------------------------------------------------- 9 */

describe("retention", () => {
  it("hard-deletes packets past the window and records the deletion by count", async () => {
    const { patient } = await upsertPatient(
      alpha.practice,
      { firstName: "Ancient", lastName: `Record-${randomUUID().slice(0, 6)}` },
      alpha.actor,
    );
    const old = await sendIntake({
      practice: alpha.practice,
      patientId: patient.id,
      formId: alphaFormId,
      version: alphaVersion,
      channelEmail: true,
      channelSms: false,
      actor: alpha.actor,
      now: new Date(Date.now() - 9 * 365 * 86_400_000),
    });
    // The link for a nine-year-old packet is long expired, so this reaches for the
    // row directly rather than through a token — which is what the sweep does too.
    const resolved = await getIntake(alpha.practice.id, old.intake.id);
    assert.ok(resolved);
    await saveSection({ resolved, sectionIndex: 0, answers: ANSWERS, ip: null });

    const auditBefore = await countAudit(alpha.practice.id);
    const deleted = await retentionSweep(alpha.practice.id, { ...DEFAULT_SETTINGS, retentionYears: 7 });
    assert.ok(deleted >= 1, "the sweep deleted nothing");

    const remaining = await db.select({ id: intakes.id }).from(intakes).where(eq(intakes.id, old.intake.id));
    assert.equal(remaining.length, 0, "the intake survived the sweep");
    const orphanSubmissions = await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(eq(submissions.intakeId, old.intake.id));
    assert.equal(orphanSubmissions.length, 0, "answers survived the sweep");

    // The audit log outlives what it describes.
    assert.ok(await countAudit(alpha.practice.id) > auditBefore);
    const deletions = await db
      .select({ metadata: auditEvents.metadata })
      .from(auditEvents)
      .where(and(eq(auditEvents.practiceId, alpha.practice.id), eq(auditEvents.action, "deleted")));
    assert.ok(deletions.length >= 1);
    assert.ok(Number(deletions[0].metadata?.count ?? 0) >= 1);
  });

  it("leaves a packet inside the window alone", async () => {
    const survivors = await db
      .select({ id: intakes.id })
      .from(intakes)
      .where(eq(intakes.id, alphaIntakeId));
    assert.equal(survivors.length, 1);
    const versions = await db
      .select({ id: formVersions.id })
      .from(formVersions)
      .where(eq(formVersions.id, alphaVersion.id));
    assert.equal(versions.length, 1, "the sweep took a form version with it");
    const signatures = await signaturesFor(alphaIntakeId);
    assert.equal(signatures.length, 2);
    const stillThere = await db
      .select({ id: signatureRecords.id })
      .from(signatureRecords)
      .where(eq(signatureRecords.intakeId, alphaIntakeId));
    assert.equal(stillThere.length, 2);
  });
});
