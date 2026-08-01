/**
 * src/lib/agreement.ts
 *
 * The data-protection agreement flow.
 *
 * Read this before touching the copy. FormForge is **pre-launch software**. It has
 * no executed Business Associate Agreement to offer, no signed subprocessor BAA
 * chain, and no completed security review. The MVP scope asks for a self-serve
 * agreement flow, so what is built is the flow — a versioned document, presented
 * in full, accepted by a named person, hashed and recorded exactly like a patient
 * consent — with the document itself labelled for what it is: a draft template,
 * not an agreement in force.
 *
 * Saying otherwise in this file would put a false compliance claim in front of a
 * buyer who is choosing this product *because* of compliance. The mechanism is
 * real and the paperwork is honest about not existing yet.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { practices, type Practice } from "@/db/schema";
import { sha256Hex } from "@/lib/crypto";
import { appendAuditEvent } from "@/lib/audit";
import type { PhiActor } from "@/lib/phi";

export const AGREEMENT_VERSION = "draft-2026-08";

export const AGREEMENT_TITLE = "Data protection agreement (draft template)";

export const AGREEMENT_NOTICE =
  "FormForge is pre-launch. This document is a draft template shown for review — it is not " +
  "executed, no Business Associate Agreement is in force, and FormForge is not currently offering " +
  "one. Do not put real patient information into this software.";

export interface AgreementSection {
  heading: string;
  body: string;
}

export const AGREEMENT_SECTIONS: AgreementSection[] = [
  {
    heading: "1. What this document is",
    body:
      "This is the draft text of the agreement FormForge intends to offer practices once the " +
      "product is generally available, its subprocessor agreements are executed, and an " +
      "independent security review is complete. Accepting it records that a named person at your " +
      "practice has read it. It does not create a Business Associate Agreement, and it does not " +
      "make either party liable to the other.",
  },
  {
    heading: "2. What FormForge does with the data you put in it",
    body:
      "Answers, patient identifiers, signature records and uploaded files are encrypted in the " +
      "application with AES-256-GCM before they are written, under a data key unique to your " +
      "practice. That key is stored only in wrapped form, under a master key FormForge holds " +
      "outside the database. A copy of the database on its own does not yield readable content.",
  },
  {
    heading: "3. Access and the audit trail",
    body:
      "Every read of patient content by a member of your staff, every export, every packet sent " +
      "and every signature is appended to an audit log that the application cannot modify or " +
      "delete — the database refuses UPDATE and DELETE on that table. You can read the log in the " +
      "product and export it as a CSV, and the export itself appears in the log.",
  },
  {
    heading: "4. Retention and deletion",
    body:
      "You choose a retention window per practice; the default is seven years from the date a " +
      "packet was sent. A daily sweep hard-deletes packets past that window along with their " +
      "answers, signatures and uploaded files, and records the deletion in the audit log by count, " +
      "never by content.",
  },
  {
    heading: "5. Subprocessors",
    body:
      "FormForge intends to run on Neon (database), AWS S3 with KMS (uploaded files), Vercel " +
      "(application hosting), Resend (email) and Twilio (SMS). Email and SMS are kept outside the " +
      "PHI boundary by construction: a message contains the patient's first name, your practice " +
      "name and a link, and nothing else. Agreements with these vendors are not yet executed, and " +
      "the current list is published in the product under Settings.",
  },
  {
    heading: "6. What is explicitly not claimed",
    body:
      "FormForge is not HIPAA certified — there is no such certification. It has no SOC 2 report, " +
      "no HITRUST certification, and no completed penetration test. It does not offer a signed BAA " +
      "today. Any of those statements changing will change this document's version number, and you " +
      "will be asked to review it again.",
  },
  {
    heading: "7. Your obligations if you use this software with real records",
    body:
      "Because no agreement is in force, using FormForge with protected health information would " +
      "leave your practice without the vendor agreement HIPAA requires for a business associate. " +
      "Use the product with test data until FormForge tells you, in writing and with a new version " +
      "of this document, that a BAA is available.",
  },
];

/** The canonical text — what gets hashed, and what is shown on screen. */
export function agreementText(): string {
  return [
    AGREEMENT_TITLE,
    `VERSION: ${AGREEMENT_VERSION}`,
    "",
    AGREEMENT_NOTICE,
    "",
    ...AGREEMENT_SECTIONS.map((s) => `${s.heading}\n${s.body}`),
  ].join("\n\n");
}

export function agreementHash(): string {
  return sha256Hex(agreementText());
}

export interface AgreementState {
  accepted: boolean;
  /** True when they accepted an older version than the current draft. */
  stale: boolean;
  acceptedAt: Date | null;
  signerName: string | null;
  version: string | null;
}

export function agreementState(practice: Practice): AgreementState {
  if (!practice.agreementAcceptedAt) {
    return { accepted: false, stale: false, acceptedAt: null, signerName: null, version: null };
  }
  return {
    accepted: true,
    stale: practice.agreementVersion !== AGREEMENT_VERSION,
    acceptedAt: practice.agreementAcceptedAt,
    signerName: practice.agreementSignerName,
    version: practice.agreementVersion,
  };
}

export class AgreementError extends Error {}

/** Record acceptance: who, when, which version, and a hash of the exact text. */
export async function acceptAgreement(
  practiceId: string,
  signerName: string,
  actor: PhiActor,
): Promise<void> {
  const name = signerName.trim();
  if (!/\S+\s+\S+/.test(name)) {
    throw new AgreementError("Type your full name — first and last — to record who reviewed this.");
  }
  const db = getDb();
  const hash = agreementHash();
  await db
    .update(practices)
    .set({
      agreementAcceptedAt: new Date(),
      agreementVersion: AGREEMENT_VERSION,
      agreementSignerName: name,
      agreementTextHash: hash,
      updatedAt: new Date(),
    })
    .where(eq(practices.id, practiceId));

  await appendAuditEvent({
    practiceId,
    actorType: actor.type,
    actorId: actor.id,
    actorLabel: actor.label,
    action: "signed",
    targetType: "practice",
    targetId: practiceId,
    targetLabel: "data protection agreement",
    ip: actor.ip ?? null,
    metadata: { version: AGREEMENT_VERSION, kind: "agreement" },
  });
}

/** The subprocessor list, rendered on the settings page. Status is stated plainly. */
export const SUBPROCESSORS = [
  { name: "Neon", role: "Postgres database (encrypted content)", status: "No agreement executed" },
  { name: "AWS (S3 + KMS)", role: "Uploaded files (encrypted before upload)", status: "No agreement executed" },
  { name: "Vercel", role: "Application hosting", status: "No agreement executed" },
  { name: "Resend", role: "Email — first name, practice name, link only", status: "No agreement executed" },
  { name: "Twilio", role: "SMS — first name, practice name, link only", status: "No agreement executed" },
  { name: "Stripe", role: "FormForge's own billing. No patient data.", status: "Not applicable" },
] as const;
