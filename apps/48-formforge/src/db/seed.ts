/**
 * src/db/seed.ts
 *
 * A demo practice with real-shaped data, for local development and screenshots.
 * Idempotent: running it twice reuses the practice rather than duplicating it.
 *
 * `npm run db:seed` — never point this at production. It creates a signed-in-able
 * account with a known password, which is the whole point and also the whole risk.
 */

import "@/lib/load-env";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { forms, intakes, patients, practices, users } from "@/db/schema";
import { generatePracticeDek } from "@/lib/crypto";
import { env } from "@/lib/env";
import { hashPassword } from "@/lib/auth";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { createFormFromTemplate, latestVersion, publishForm } from "@/lib/forms";
import { upsertPatient } from "@/lib/patients";
import { sendIntake, saveSection, resolveIntakeToken, captureSignature, completeIntake } from "@/lib/intakes";
import { sections } from "@/lib/blocks";
import { AGREEMENT_VERSION, agreementHash } from "@/lib/agreement";

const OWNER_EMAIL = "adaeze@riverbendcounseling.example";
const OWNER_PASSWORD = "demo-password-1234";

async function main(): Promise<void> {
  const db = getDb();

  const [existing] = await db.select().from(users).where(eq(users.email, OWNER_EMAIL));
  if (existing) {
    console.log(`[seed] practice already seeded — sign in as ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);
    await closeDb();
    return;
  }

  const dek = generatePracticeDek(env.masterKey);
  const [practice] = await db
    .insert(practices)
    .values({
      name: "Riverbend Counseling",
      plan: "group",
      trialEndsAt: new Date(Date.now() + 12 * 86_400_000),
      dekWrapped: dek.wrapped,
      dekKeyId: dek.keyId,
      settings: DEFAULT_SETTINGS,
      agreementAcceptedAt: new Date(),
      agreementVersion: AGREEMENT_VERSION,
      agreementSignerName: "Adaeze Osei",
      agreementTextHash: agreementHash(),
    })
    .returning();

  const [owner] = await db
    .insert(users)
    .values({
      practiceId: practice.id,
      email: OWNER_EMAIL,
      name: "Adaeze Osei",
      passwordHash: await hashPassword(OWNER_PASSWORD),
      role: "owner",
    })
    .returning();

  await db.insert(users).values({
    practiceId: practice.id,
    email: "dana@riverbendcounseling.example",
    name: "Dana Reyes",
    passwordHash: await hashPassword(OWNER_PASSWORD),
    role: "frontdesk",
  });

  const actor = { type: "user" as const, id: owner.id, label: "Adaeze Osei (owner)", ip: "198.51.100.24" };

  const form = await createFormFromTemplate(practice.id, "behavioral_health_v1", actor);
  await publishForm(practice.id, form.id, actor);
  const version = await latestVersion(practice.id, form.id);
  if (!version) throw new Error("[seed] publish produced no version");

  /* ---- three patients in three different states ---- */
  const people = [
    { first: "Dana", last: "Okonkwo", email: "dana.okonkwo@example.com", phone: "+1 303 555 0117", dob: "1988-04-12", state: "signed" },
    { first: "Marcus", last: "Villalobos", email: "marcus.v@example.com", phone: "+1 720 555 0143", dob: "1975-11-02", state: "started" },
    { first: "Priya", last: "Raghunathan", email: "priya.r@example.com", phone: "+1 415 555 0188", dob: "1996-02-27", state: "sent" },
  ] as const;

  for (const person of people) {
    const { patient } = await upsertPatient(
      practice,
      {
        firstName: person.first,
        lastName: person.last,
        email: person.email,
        phone: person.phone,
        dob: person.dob,
        assignedUserId: owner.id,
      },
      actor,
    );

    const sentAt =
      person.state === "sent" ? new Date(Date.now() - 6 * 3_600_000) : new Date(Date.now() - 7 * 86_400_000);

    const { rawToken } = await sendIntake({
      practice,
      patientId: patient.id,
      formId: form.id,
      version,
      assignedUserId: owner.id,
      channelEmail: true,
      channelSms: person.state !== "sent",
      actor,
      now: sentAt,
    });

    if (person.state === "sent") continue;

    const resolvedResult = await resolveIntakeToken(rawToken);
    if (!resolvedResult.ok) throw new Error("[seed] could not resolve a token it just minted");
    let resolved = resolvedResult.value;
    const all = sections(resolved.version.blocks);

    const answers = demoAnswers(person.first, person.last, person.email, person.phone, person.dob);
    const upTo = person.state === "signed" ? all.length : 3;

    for (let i = 0; i < upTo; i += 1) {
      const fresh = await resolveIntakeToken(rawToken);
      if (!fresh.ok) break;
      resolved = fresh.value;
      await saveSection({ resolved, sectionIndex: i, answers, ip: "73.92.1.8" });

      const signatureBlock = all[i].blocks.find((b) => b.kind === "signature");
      if (signatureBlock && person.state === "signed") {
        const latest = await resolveIntakeToken(rawToken);
        if (!latest.ok) break;
        await captureSignature({
          resolved: latest.value,
          blockKey: signatureBlock.key,
          signature: {
            kind: "typed",
            payload: `${person.first} ${person.last}`,
            signedName: `${person.first} ${person.last}`,
            disclosureAccepted: true,
          },
          ip: "73.92.1.8",
          userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
        });
      }
    }

    if (person.state === "signed") {
      const finished = await resolveIntakeToken(rawToken);
      if (finished.ok) await completeIntake(finished.value, "73.92.1.8");
    }
  }

  const [formCount] = await db.select({ id: forms.id }).from(forms).where(eq(forms.practiceId, practice.id));
  const patientRows = await db.select({ id: patients.id }).from(patients).where(eq(patients.practiceId, practice.id));
  const intakeRows = await db.select({ id: intakes.id }).from(intakes).where(eq(intakes.practiceId, practice.id));

  console.log(
    `[seed] Riverbend Counseling: ${formCount ? 1 : 0} packet, ${patientRows.length} patients, ${intakeRows.length} intakes`,
  );
  console.log(`[seed] sign in as ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);
  await closeDb();
}

function demoAnswers(
  first: string,
  last: string,
  email: string,
  phone: string,
  dob: string,
): Record<string, string> {
  return {
    "demographics.first_name": first,
    "demographics.last_name": last,
    "demographics.preferred_name": first,
    "demographics.dob": dob,
    "demographics.pronouns": "they/them",
    "demographics.phone": phone,
    "demographics.email": email,
    "demographics.address": "1180 Cottonwood Ave, Apt 4, Denver CO 80206",
    "demographics.emergency_name": "Ruth Okonkwo",
    "demographics.emergency_phone": "+1 303 555 0164",
    "demographics.emergency_relationship": "Sister",
    "insurance.self_pay": "no",
    "insurance.carrier": "Anthem Blue Cross Blue Shield",
    "insurance.member_id": "XQZ4471228890",
    "insurance.group_number": "0084412",
    "insurance.subscriber_name": `${first} ${last}`,
    "insurance.subscriber_relationship": "Self",
    "history.presenting_concern":
      "Panic attacks two or three times a week since March, worse on the mornings I have to present at work. I stopped driving on the highway in May.",
    "history.duration": "About five months",
    "history.prior_therapy": "yes",
    "history.prior_therapy_detail":
      "CBT for eight sessions in 2021. The breathing exercises helped; the homework sheets did not.",
    "history.medications": "Sertraline 50mg daily since June, prescribed by my GP",
    "history.medical_conditions": "Asthma, well controlled",
    "history.primary_care": "Dr. Amara Nwosu, Denver",
    "phq9.i1": "2",
    "phq9.i2": "2",
    "phq9.i3": "3",
    "phq9.i4": "2",
    "phq9.i5": "1",
    "phq9.i6": "2",
    "phq9.i7": "1",
    "phq9.i8": "1",
    "phq9.i9": "0",
    "gad7.i1": "3",
    "gad7.i2": "2",
    "gad7.i3": "2",
    "gad7.i4": "1",
    "gad7.i5": "1",
    "gad7.i6": "1",
    "gad7.i7": "1",
  };
}

main().catch(async (err) => {
  console.error("[seed] failed", err);
  await closeDb();
  process.exit(1);
});
