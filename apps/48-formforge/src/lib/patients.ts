/**
 * src/lib/patients.ts
 *
 * The patient directory. Deliberately minimal: a name, contact details, a date of
 * birth, and who they are assigned to. Everything clinical lives in a submission.
 *
 * Every identifying column is ciphertext. Two consequences shape this file:
 *
 *  - **Lookup cannot use SQL on the name.** A keyed blind index
 *    (`patients.name_key`) stands in, which is what makes "send to Dana Okonkwo
 *    again" a single indexed query instead of decrypting the whole table.
 *
 *  - **Reading a name is a disclosure**, so it goes through `readPhi` and lands
 *    in the audit log. The status board therefore decrypts in one batched call
 *    per screen with a `count` in the metadata, rather than one event per row —
 *    an auditor wants "Dana opened the board and saw 14 names", not 14 rows.
 */

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { patients, type Patient, type Practice } from "@/db/schema";
import { patientNameKey } from "@/lib/crypto";
import { env } from "@/lib/env";
import { readPhi, sealFor, type PhiActor } from "@/lib/phi";
import { appendAuditEvent } from "@/lib/audit";

export class PatientError extends Error {}

export interface PatientInput {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  dob?: string | null;
  assignedUserId?: string | null;
}

export interface PatientIdentity {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  dob: string | null;
  assignedUserId: string | null;
  smsOptOut: boolean;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Create or update a patient by name.
 *
 * Matching on the blind index means "Dana Okonkwo" resolves to the same row on
 * the second visit. Two different people with the same name in one practice are
 * a real possibility, so the caller can force a new row — but the default is to
 * reuse, because a duplicated patient splits a records request in half.
 */
export async function upsertPatient(
  practice: Pick<Practice, "id" | "dekWrapped">,
  input: PatientInput,
  actor: PhiActor,
): Promise<{ patient: Patient; created: boolean }> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) throw new PatientError("Enter the patient's first and last name");
  if (input.email && !EMAIL_RE.test(input.email.trim())) {
    throw new PatientError("That email address does not look right");
  }
  if (input.dob && !/^\d{4}-\d{2}-\d{2}$/.test(input.dob.trim())) {
    throw new PatientError("Date of birth needs to be YYYY-MM-DD");
  }

  const db = getDb();
  const nameKey = patientNameKey(firstName, lastName, env.intakeTokenSecret);

  const enc = (value?: string | null) =>
    value && value.trim() ? sealFor(practice, value.trim()) : null;

  const [existing] = await db
    .select()
    .from(patients)
    .where(and(eq(patients.practiceId, practice.id), eq(patients.nameKey, nameKey)));

  if (existing) {
    const [updated] = await db
      .update(patients)
      .set({
        // Only overwrite contact details when new ones were supplied: sending a
        // second packet without retyping the phone number must not erase it.
        emailEnc: enc(input.email) ?? existing.emailEnc,
        phoneEnc: enc(input.phone) ?? existing.phoneEnc,
        dobEnc: enc(input.dob) ?? existing.dobEnc,
        assignedUserId: input.assignedUserId ?? existing.assignedUserId,
        updatedAt: new Date(),
      })
      .where(and(eq(patients.id, existing.id), eq(patients.practiceId, practice.id)))
      .returning();
    await appendAuditEvent({
      practiceId: practice.id,
      actorType: actor.type,
      actorId: actor.id,
      actorLabel: actor.label,
      action: "edited",
      targetType: "patient",
      targetId: updated.id,
      targetLabel: "patient record",
      ip: actor.ip ?? null,
      metadata: { result: "updated" },
    });
    return { patient: updated, created: false };
  }

  const [created] = await db
    .insert(patients)
    .values({
      practiceId: practice.id,
      firstNameEnc: sealFor(practice, firstName),
      lastNameEnc: sealFor(practice, lastName),
      emailEnc: enc(input.email),
      phoneEnc: enc(input.phone),
      dobEnc: enc(input.dob),
      nameKey,
      assignedUserId: input.assignedUserId ?? null,
    })
    .returning();

  await appendAuditEvent({
    practiceId: practice.id,
    actorType: actor.type,
    actorId: actor.id,
    actorLabel: actor.label,
    action: "edited",
    targetType: "patient",
    targetId: created.id,
    targetLabel: "patient record",
    ip: actor.ip ?? null,
    metadata: { result: "created" },
  });

  return { patient: created, created: true };
}

/**
 * One patient's identity, decrypted and audited.
 *
 * The practice id is part of the WHERE clause *and* the DEK belongs to that
 * practice, so a cross-practice id gets nothing twice over: no row, and even if
 * a row leaked, the wrong key fails GCM authentication.
 */
export async function getPatientIdentity(
  practice: Pick<Practice, "id" | "dekWrapped">,
  patientId: string,
  actor: PhiActor,
): Promise<PatientIdentity | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.practiceId, practice.id)));
  if (!row) return null;
  return readPhi(
    practice,
    actor,
    { targetType: "patient", targetId: row.id, targetLabel: "patient record" },
    (unseal) => identityFrom(row, unseal),
  );
}

/** Identities for a set of ids, as one audited batch read. */
export async function getPatientIdentities(
  practice: Pick<Practice, "id" | "dekWrapped">,
  patientIds: string[],
  actor: PhiActor,
  context: "status board" | "patient directory" | "export" | "packet",
): Promise<Map<string, PatientIdentity>> {
  const out = new Map<string, PatientIdentity>();
  if (!patientIds.length) return out;
  const db = getDb();
  const rows = await db
    .select()
    .from(patients)
    .where(and(eq(patients.practiceId, practice.id), inArray(patients.id, patientIds)));
  if (!rows.length) return out;

  await readPhi(
    practice,
    actor,
    {
      targetType: "patient",
      targetId: null,
      targetLabel: context,
      metadata: { count: rows.length, scope: context },
    },
    (unseal) => {
      for (const row of rows) out.set(row.id, identityFrom(row, unseal));
    },
  );
  return out;
}

/** Whole directory for a practice, audited once. */
export async function listPatients(
  practice: Pick<Practice, "id" | "dekWrapped">,
  actor: PhiActor,
): Promise<PatientIdentity[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(patients)
    .where(eq(patients.practiceId, practice.id))
    .orderBy(patients.createdAt);
  if (!rows.length) return [];
  const identities = await readPhi(
    practice,
    actor,
    {
      targetType: "patient",
      targetId: null,
      targetLabel: "patient directory",
      metadata: { count: rows.length, scope: "patient directory" },
    },
    (unseal) => rows.map((row) => identityFrom(row, unseal)),
  );
  return identities.sort((a, b) => a.fullName.localeCompare(b.fullName));
}

function identityFrom(
  row: Patient,
  unseal: (c: Buffer | null | undefined) => string | null,
): PatientIdentity {
  const firstName = unseal(row.firstNameEnc) ?? "";
  const lastName = unseal(row.lastNameEnc) ?? "";
  return {
    id: row.id,
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim(),
    email: unseal(row.emailEnc),
    phone: unseal(row.phoneEnc),
    dob: unseal(row.dobEnc),
    assignedUserId: row.assignedUserId,
    smsOptOut: row.smsOptOut,
  };
}

/** Twilio STOP handling — an opt-out that outlives any one packet. */
export async function setSmsOptOut(practiceId: string, patientId: string, optOut: boolean): Promise<void> {
  const db = getDb();
  await db
    .update(patients)
    .set({ smsOptOut: optOut, updatedAt: new Date() })
    .where(and(eq(patients.id, patientId), eq(patients.practiceId, practiceId)));
}

export async function assignPatient(
  practiceId: string,
  patientId: string,
  userId: string | null,
): Promise<void> {
  const db = getDb();
  await db
    .update(patients)
    .set({ assignedUserId: userId, updatedAt: new Date() })
    .where(and(eq(patients.id, patientId), eq(patients.practiceId, practiceId)));
}
