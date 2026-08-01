/**
 * src/lib/intakes.ts
 *
 * The intake lifecycle: send → open → answer → sign → complete, plus the
 * practice-side reads of a finished packet.
 *
 * Things worth knowing before editing this file:
 *
 *  - **The raw token is never persisted.** `sendIntake` returns it once, to be
 *    put in a link; the row stores an HMAC. Resolving a link hashes the token and
 *    looks up the hash, so a database dump cannot be replayed into a packet.
 *
 *  - **Every practice-side read of answers goes through `lib/phi.ts`,** so the
 *    audit event is not something a route can forget. `phi.test.ts` enforces it.
 *
 *  - **Signing snapshots the consent text.** `captureSignature` copies the
 *    consent as rendered from the *published version the patient was sent*, hashes
 *    it, and stores the copy. Editing the form later cannot change it.
 *
 *  - **Cross-practice access fails twice:** every query filters on `practice_id`,
 *    and the ciphertext is keyed to that practice's DEK, so even a leaked row
 *    fails GCM authentication under another practice's key.
 */

import { and, count, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  intakes,
  patients,
  signatureRecords,
  submissions,
  uploads,
  type FormBlock,
  type FormVersion,
  type Intake,
  type IntakeStatus,
  type Practice,
  type PracticeSettings,
  type ScoreSummary,
  type SignatureRecord,
  type Submission,
} from "@/db/schema";
import {
  blockFields,
  renderConsentText,
  safeConfig,
  screenerAnswers,
  screenerInstrument,
  sections,
  validateBlockAnswers,
  type AnswerMap,
} from "@/lib/blocks";
import { generateIntakeToken, hashIntakeToken, open as openEnvelope } from "@/lib/crypto";
import { env } from "@/lib/env";
import { appendAuditEvent } from "@/lib/audit";
import { practiceDek, readOwnPhi, readPhi, sealFor, type PhiActor } from "@/lib/phi";
import { scoreScreener } from "@/lib/screeners";
import {
  documentHash,
  validateSignatureInput,
  type SignatureInput,
} from "@/lib/signature";
import { cancelReminders, planReminders, scheduleReminders } from "@/lib/reminders";
import { settingsOf } from "@/lib/practices";

export class IntakeError extends Error {}

/* -------------------------------------------------------------------- send */

export interface SendIntakeInput {
  practice: Practice;
  patientId: string;
  formId: string;
  version: FormVersion;
  assignedUserId?: string | null;
  channelEmail: boolean;
  channelSms: boolean;
  actor: PhiActor;
  now?: Date;
}

export interface SendIntakeResult {
  intake: Intake;
  /** The only time this value exists outside a link. Do not log it. */
  rawToken: string;
  remindersScheduled: number;
}

export async function sendIntake(input: SendIntakeInput): Promise<SendIntakeResult> {
  const settings = settingsOf(input.practice);
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + settings.linkDays * 86_400_000);

  const db = getDb();
  // The patient must belong to this practice. Checked here rather than trusted
  // from the form post — a patient id is a guessable-shaped uuid in a hidden field.
  const [patient] = await db
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.id, input.patientId), eq(patients.practiceId, input.practice.id)));
  if (!patient) throw new IntakeError("That patient is not in this practice");
  if (input.version.practiceId !== input.practice.id) {
    throw new IntakeError("That form version is not in this practice");
  }

  const rawToken = generateIntakeToken();
  const [intake] = await db
    .insert(intakes)
    .values({
      practiceId: input.practice.id,
      patientId: input.patientId,
      formId: input.formId,
      formVersionId: input.version.id,
      tokenHash: hashIntakeToken(rawToken, env.intakeTokenSecret),
      assignedUserId: input.assignedUserId ?? null,
      channelEmail: input.channelEmail,
      channelSms: input.channelSms,
      sentAt: now,
      expiresAt,
      status: "sent",
    })
    .returning();

  const plans = planReminders({
    sentAt: now,
    expiresAt,
    settings,
    email: input.channelEmail,
    sms: input.channelSms,
  });
  const remindersScheduled = await scheduleReminders(input.practice.id, intake.id, plans);

  await appendAuditEvent({
    practiceId: input.practice.id,
    actorType: input.actor.type,
    actorId: input.actor.id,
    actorLabel: input.actor.label,
    action: "sent",
    targetType: "intake",
    targetId: intake.id,
    targetLabel: input.version.title,
    ip: input.actor.ip ?? null,
    metadata: {
      version: input.version.version,
      channel: input.channelSms ? (input.channelEmail ? "email+sms" : "sms") : "email",
      count: remindersScheduled,
    },
  });

  return { intake, rawToken, remindersScheduled };
}

/** Re-issue the link for an existing intake (patient lost the email). */
export async function reissueToken(
  practiceId: string,
  intakeId: string,
  actor: PhiActor,
): Promise<string> {
  const db = getDb();
  const rawToken = generateIntakeToken();
  const [row] = await db
    .update(intakes)
    .set({ tokenHash: hashIntakeToken(rawToken, env.intakeTokenSecret), updatedAt: new Date() })
    .where(and(eq(intakes.id, intakeId), eq(intakes.practiceId, practiceId)))
    .returning();
  if (!row) throw new IntakeError("That packet is not in this practice");
  await appendAuditEvent({
    practiceId,
    actorType: actor.type,
    actorId: actor.id,
    actorLabel: actor.label,
    action: "sent",
    targetType: "intake",
    targetId: intakeId,
    targetLabel: "new link",
    ip: actor.ip ?? null,
    metadata: { reason: "reissued" },
  });
  return rawToken;
}

/* ------------------------------------------------------------------ resolve */

export interface ResolvedIntake {
  intake: Intake;
  practice: Practice;
  version: FormVersion;
  submission: Submission | null;
}

/**
 * Resolve a raw link token. Returns null for anything that is not a live packet —
 * unknown token, wrong practice, expired link — because the patient-facing page
 * must not distinguish those cases. "This link is no longer active" is the whole
 * answer a stranger gets.
 */
export async function resolveIntakeToken(rawToken: string): Promise<
  | { ok: true; value: ResolvedIntake }
  | { ok: false; reason: "unknown" | "expired" }
> {
  const db = getDb();
  const tokenHash = hashIntakeToken(rawToken, env.intakeTokenSecret);
  const rows = await db.query.intakes.findMany({
    where: eq(intakes.tokenHash, tokenHash),
    with: { practice: true, formVersion: true, submission: true },
    limit: 1,
  });
  const row = rows[0];
  if (!row || !row.practice || !row.formVersion) return { ok: false, reason: "unknown" };
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };
  return {
    ok: true,
    value: {
      intake: row,
      practice: row.practice,
      version: row.formVersion,
      submission: row.submission ?? null,
    },
  };
}

/** Mark a packet started the first time the patient opens it. */
export async function markStarted(intake: Intake, ip: string | null): Promise<Intake> {
  if (intake.status !== "sent") return intake;
  const db = getDb();
  const [row] = await db
    .update(intakes)
    .set({ status: "started", startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(intakes.id, intake.id), eq(intakes.status, "sent")))
    .returning();
  await appendAuditEvent({
    practiceId: intake.practiceId,
    actorType: "patient",
    actorId: intake.id,
    actorLabel: "patient (own packet)",
    action: "edited",
    targetType: "intake",
    targetId: intake.id,
    targetLabel: "packet started",
    ip,
    metadata: { status: "started" },
  });
  return row ?? intake;
}

/* ------------------------------------------------------------------ answers */

/**
 * Refuse a mismatched (practice, intake) pair before anything else happens.
 *
 * Found by the integration test: passing practice B's row alongside practice A's
 * intake failed at the cipher, which is the right *outcome* — but only after
 * `readPhi`'s audit hook had already written a row into practice B's ledger
 * referencing practice A's intake id. One tenant's audit log must not accumulate
 * another tenant's identifiers, so the pair is checked first and the attempt never
 * reaches the crypto or the log.
 */
function assertSameTenant(resolved: ResolvedIntake): void {
  if (resolved.intake.practiceId !== resolved.practice.id) {
    throw new IntakeError("That packet does not belong to this practice");
  }
}

/** The patient's own answers, decrypted for their own resume. Audited. */
export async function loadAnswersForPatient(resolved: ResolvedIntake, ip: string | null): Promise<AnswerMap> {
  assertSameTenant(resolved);
  if (!resolved.submission) return {};
  const submission = resolved.submission;
  return readOwnPhi(resolved.practice, resolved.intake.id, ip, (unseal) => {
    const json = unseal(submission.answersEnc);
    return json ? (JSON.parse(json) as AnswerMap) : {};
  });
}

/** Raw answers without an audit event — internal use only (scoring, export). */
function decryptAnswers(practice: Pick<Practice, "id" | "dekWrapped">, submission: Submission): AnswerMap {
  const dek = practiceDek(practice);
  return JSON.parse(openEnvelope(submission.answersEnc, dek).toString("utf8")) as AnswerMap;
}

/**
 * Save one section's answers.
 *
 * Merge-then-replace, because a patient who backs up two screens and edits an
 * answer must not lose the ones after it. Screener totals are recomputed over the
 * whole merged set, so `score_summary` is always consistent with the ciphertext.
 */
export async function saveSection(input: {
  resolved: ResolvedIntake;
  sectionIndex: number;
  answers: AnswerMap;
  ip: string | null;
}): Promise<{ problems: string[]; answers: AnswerMap }> {
  const { resolved } = input;
  assertSameTenant(resolved);
  const blocks = resolved.version.blocks;
  const allSections = sections(blocks);
  const section = allSections[input.sectionIndex];
  if (!section) throw new IntakeError("That section does not exist in this packet");

  const existing = resolved.submission ? decryptAnswers(resolved.practice, resolved.submission) : {};

  // Only fields belonging to this section may be written by this post.
  const permitted = new Set(section.blocks.flatMap((b) => blockFields(b).map((f) => f.name)));
  const merged: AnswerMap = { ...existing };
  for (const [key, value] of Object.entries(input.answers)) {
    if (permitted.has(key)) merged[key] = value;
  }

  const problems = section.blocks.flatMap((b) => validateBlockAnswers(b, merged));

  const scoreSummary = computeScores(blocks, merged);
  const answersEnc = sealFor(resolved.practice, JSON.stringify(merged));

  const db = getDb();
  await db
    .insert(submissions)
    .values({
      practiceId: resolved.practice.id,
      intakeId: resolved.intake.id,
      answersEnc,
      scoreSummary,
    })
    .onConflictDoUpdate({
      target: submissions.intakeId,
      set: { answersEnc, scoreSummary, updatedAt: new Date() },
    });

  if (!problems.length) {
    // Only advance the resume pointer when the section actually validated.
    await db
      .update(intakes)
      .set({
        sectionIndex: Math.max(resolved.intake.sectionIndex, input.sectionIndex + 1),
        updatedAt: new Date(),
      })
      .where(eq(intakes.id, resolved.intake.id));
  }

  await appendAuditEvent({
    practiceId: resolved.practice.id,
    actorType: "patient",
    actorId: resolved.intake.id,
    actorLabel: "patient (own packet)",
    action: "edited",
    targetType: "intake",
    targetId: resolved.intake.id,
    targetLabel: "section saved",
    ip: input.ip,
    metadata: {
      section: input.sectionIndex + 1,
      sections: allSections.length,
      result: problems.length ? "invalid" : "saved",
    },
  });

  return { problems, answers: merged };
}

/** Screener totals over the whole answer set. Totals and severity only. */
export function computeScores(blocks: FormBlock[], answers: AnswerMap): ScoreSummary {
  const summary: ScoreSummary = {};
  for (const block of blocks) {
    const instrument = screenerInstrument(block);
    if (!instrument) continue;
    const items = screenerAnswers(block, answers);
    if (items.every((v) => v === "")) continue;
    const result = scoreScreener(instrument, items);
    summary[block.key] = {
      total: result.total,
      severity: result.severity,
      flagged: result.flagged,
    };
  }
  return summary;
}

/* ---------------------------------------------------------------- signature */

export interface CaptureSignatureInput {
  resolved: ResolvedIntake;
  /** The signature block's key. */
  blockKey: string;
  signature: Omit<SignatureInput, "allowDrawn">;
  ip: string | null;
  userAgent: string | null;
  now?: Date;
}

/**
 * Capture a signature for one consent block.
 *
 * The consent text is rendered from the **version the patient was sent**, copied
 * onto the row, and hashed from that copy. Nothing here reads the mutable `forms`
 * row, which is the entire point.
 */
export async function captureSignature(
  input: CaptureSignatureInput,
): Promise<{ problems: string[]; record?: SignatureRecord }> {
  const { resolved } = input;
  assertSameTenant(resolved);
  const blocks = resolved.version.blocks;
  const signatureBlock = blocks.find((b) => b.key === input.blockKey && b.kind === "signature");
  if (!signatureBlock) throw new IntakeError("That signature block is not in this packet");
  const cfg = safeConfig("signature", signatureBlock.config);
  if (!cfg) throw new IntakeError("That signature block is misconfigured");

  const consentBlock = blocks.find((b) => b.key === cfg.consentBlockKey && b.kind === "consent");
  if (!consentBlock) throw new IntakeError("The consent text for that signature is missing");

  const problems = validateSignatureInput({ ...input.signature, allowDrawn: cfg.allowDrawn });
  if (problems.length) return { problems };

  const now = input.now ?? new Date();
  const consentText = renderConsentText(consentBlock);
  const hash = documentHash({
    formTitle: resolved.version.title,
    formVersion: resolved.version.version,
    consentText,
    disclosure: cfg.disclosure,
  });

  const db = getDb();

  // A signature is written once. Re-signing the same block is refused rather
  // than overwritten: two attempts is a fact, and the first one is evidence.
  const [existing] = await db
    .select({ id: signatureRecords.id })
    .from(signatureRecords)
    .where(
      and(
        eq(signatureRecords.intakeId, resolved.intake.id),
        eq(signatureRecords.blockKey, input.blockKey),
      ),
    );
  if (existing) return { problems: ["This consent has already been signed."] };

  const [record] = await db
    .insert(signatureRecords)
    .values({
      practiceId: resolved.practice.id,
      intakeId: resolved.intake.id,
      blockKey: input.blockKey,
      kind: input.signature.kind,
      signaturePayloadEnc: sealFor(resolved.practice, input.signature.payload),
      signedNameEnc: sealFor(resolved.practice, input.signature.signedName.trim()),
      signedText: consentText,
      disclosureText: cfg.disclosure,
      disclosureAcceptedAt: now,
      documentHash: hash,
      formVersionId: resolved.version.id,
      formTitle: resolved.version.title,
      formVersion: resolved.version.version,
      signedAt: now,
      ip: input.ip,
      userAgent: input.userAgent?.slice(0, 400) ?? null,
    })
    .returning();

  await appendAuditEvent({
    practiceId: resolved.practice.id,
    actorType: "patient",
    actorId: resolved.intake.id,
    actorLabel: "patient (own packet)",
    action: "signed",
    targetType: "intake",
    targetId: resolved.intake.id,
    targetLabel: consentBlock.key,
    ip: input.ip,
    metadata: { kind: input.signature.kind, version: resolved.version.version },
  });

  return { problems: [], record };
}

export async function signaturesFor(intakeId: string): Promise<SignatureRecord[]> {
  const db = getDb();
  return db
    .select()
    .from(signatureRecords)
    .where(eq(signatureRecords.intakeId, intakeId))
    .orderBy(signatureRecords.signedAt);
}

/* --------------------------------------------------------------- completion */

export interface CompletionState {
  /** Fields still required and empty, by section index. */
  missingSections: number[];
  /** Consent blocks with no signature yet. */
  unsignedBlocks: string[];
  complete: boolean;
}

/** Is the packet done? Recomputed from the answers, never trusted from a flag. */
export function completionState(
  blocks: FormBlock[],
  answers: AnswerMap,
  signedBlockKeys: string[],
): CompletionState {
  const all = sections(blocks);
  const missingSections: number[] = [];
  for (const section of all) {
    const problems = section.blocks
      .filter((b) => b.kind !== "signature")
      .flatMap((b) => validateBlockAnswers(b, answers));
    if (problems.length) missingSections.push(section.index);
  }
  const unsignedBlocks = blocks
    .filter((b) => b.kind === "signature" && !signedBlockKeys.includes(b.key))
    .map((b) => b.key);
  return {
    missingSections,
    unsignedBlocks,
    complete: missingSections.length === 0 && unsignedBlocks.length === 0,
  };
}

/**
 * Finish the packet: flip status, stop the ladder, record it.
 *
 * `signed` rather than `completed` when every signature block is signed — which
 * is always, since the flow will not finish otherwise. `completed` remains a real
 * state for a packet whose form has no signature block at all.
 */
export async function completeIntake(
  resolved: ResolvedIntake,
  ip: string | null,
): Promise<{ status: IntakeStatus; flagged: boolean }> {
  assertSameTenant(resolved);
  const db = getDb();
  const answers = resolved.submission ? decryptAnswers(resolved.practice, resolved.submission) : {};
  const signed = await signaturesFor(resolved.intake.id);
  const state = completionState(
    resolved.version.blocks,
    answers,
    signed.map((s) => s.blockKey),
  );
  if (!state.complete) throw new IntakeError("The packet is not finished yet");

  const hasSignatureBlock = resolved.version.blocks.some((b) => b.kind === "signature");
  const status: IntakeStatus = hasSignatureBlock ? "signed" : "completed";
  const now = new Date();

  await db
    .update(intakes)
    .set({
      status,
      completedAt: now,
      signedAt: hasSignatureBlock ? now : null,
      updatedAt: now,
    })
    .where(eq(intakes.id, resolved.intake.id));

  await db
    .update(submissions)
    .set({ completedAt: now, updatedAt: now })
    .where(eq(submissions.intakeId, resolved.intake.id));

  // Stop-on-complete. Not "the sweep will notice tomorrow" — now.
  await cancelReminders(resolved.intake.id, "completed");

  const scores = computeScores(resolved.version.blocks, answers);
  const flagged = Object.values(scores).some((s) => s.flagged);

  await appendAuditEvent({
    practiceId: resolved.practice.id,
    actorType: "patient",
    actorId: resolved.intake.id,
    actorLabel: "patient (own packet)",
    action: "edited",
    targetType: "intake",
    targetId: resolved.intake.id,
    targetLabel: "packet completed",
    ip,
    metadata: { status, flagged },
  });

  return { status, flagged };
}

/* -------------------------------------------------------------- board reads */

export interface BoardRow {
  intake: Intake;
  patientId: string;
  formTitle: string;
  formVersion: number;
  scoreSummary: ScoreSummary;
}

export async function listIntakes(
  practiceId: string,
  opts: { status?: IntakeStatus[]; limit?: number } = {},
): Promise<BoardRow[]> {
  const db = getDb();
  const rows = await db.query.intakes.findMany({
    where: opts.status?.length
      ? and(eq(intakes.practiceId, practiceId), inArray(intakes.status, opts.status))
      : eq(intakes.practiceId, practiceId),
    with: { formVersion: true, submission: true },
    orderBy: [desc(intakes.sentAt)],
    limit: opts.limit ?? 100,
  });
  return rows.map((row) => ({
    intake: row,
    patientId: row.patientId,
    formTitle: row.formVersion?.title ?? "Packet",
    formVersion: row.formVersion?.version ?? 0,
    scoreSummary: row.submission?.scoreSummary ?? {},
  }));
}

export async function getIntake(practiceId: string, intakeId: string): Promise<ResolvedIntake | null> {
  const db = getDb();
  const rows = await db.query.intakes.findMany({
    where: and(eq(intakes.id, intakeId), eq(intakes.practiceId, practiceId)),
    with: { practice: true, formVersion: true, submission: true },
    limit: 1,
  });
  const row = rows[0];
  if (!row || !row.practice || !row.formVersion) return null;
  return {
    intake: row,
    practice: row.practice,
    version: row.formVersion,
    submission: row.submission ?? null,
  };
}

export interface PacketView {
  answers: AnswerMap;
  signatures: { record: SignatureRecord; signedName: string; payload: string }[];
}

/**
 * A staff read of a finished packet — the one place answers become readable at
 * the practice, and therefore always an audited disclosure.
 */
export async function readPacket(
  resolved: ResolvedIntake,
  actor: PhiActor,
): Promise<PacketView> {
  assertSameTenant(resolved);
  const signatures = await signaturesFor(resolved.intake.id);
  const submission = resolved.submission;
  return readPhi(
    resolved.practice,
    actor,
    {
      targetType: "intake",
      targetId: resolved.intake.id,
      targetLabel: "packet",
      metadata: { version: resolved.version.version, count: signatures.length },
    },
    (unseal) => ({
      answers: submission
        ? (JSON.parse(unseal(submission.answersEnc) ?? "{}") as AnswerMap)
        : {},
      signatures: signatures.map((record) => ({
        record,
        signedName: unseal(record.signedNameEnc) ?? "",
        payload: unseal(record.signaturePayloadEnc) ?? "",
      })),
    }),
  );
}

export async function uploadsFor(practiceId: string, intakeId: string) {
  const db = getDb();
  return db
    .select()
    .from(uploads)
    .where(and(eq(uploads.intakeId, intakeId), eq(uploads.practiceId, practiceId)));
}

/** Packets for one patient, newest first — the "who touched this record" scope. */
export async function intakeIdsForPatient(practiceId: string, patientId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ id: intakes.id })
    .from(intakes)
    .where(and(eq(intakes.practiceId, practiceId), eq(intakes.patientId, patientId)));
  return rows.map((r) => r.id);
}

/* ----------------------------------------------------------------- sweeping */

/**
 * Roll links that have passed their expiry into the `expired` state and stop
 * their reminders. Idempotent, and safe to run at any frequency: it works from
 * current state, not from a cursor.
 */
export async function expireStaleIntakes(limit = 200): Promise<number> {
  const db = getDb();
  const stale = await db
    .select({ id: intakes.id })
    .from(intakes)
    .where(
      and(
        inArray(intakes.status, ["sent", "started"]),
        // Postgres compares the timestamps. A JS Date here would truncate to
        // milliseconds and disagree with a microsecond timestamptz.
        lte(intakes.expiresAt, sql`now()`),
      ),
    )
    .limit(limit);
  if (!stale.length) return 0;
  const ids = stale.map((r) => r.id);
  await db
    .update(intakes)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(inArray(intakes.id, ids), ne(intakes.status, "expired")));
  for (const id of ids) await cancelReminders(id, "expired");
  return ids.length;
}

/**
 * Retention sweep: hard-delete packets past the practice's retention window, and
 * log what went, by count and id — never by content. The audit rows outlive the
 * data they describe, which is the whole reason they are in a separate table.
 */
export async function retentionSweep(
  practiceId: string,
  settings: PracticeSettings,
): Promise<number> {
  const db = getDb();
  const doomed = await db
    .select({ id: intakes.id })
    .from(intakes)
    .where(
      and(
        eq(intakes.practiceId, practiceId),
        // Postgres computes the cutoff. `now() - 7 years` in the database beats a
        // JS `365 * 7` day approximation that drifts past two leap years.
        lte(intakes.sentAt, sql`now() - make_interval(years => ${settings.retentionYears})`),
      ),
    )
    .limit(200);
  if (!doomed.length) return 0;
  const ids = doomed.map((r) => r.id);
  // Cascades take submissions, signatures, uploads and reminders with them.
  await db.delete(intakes).where(and(eq(intakes.practiceId, practiceId), inArray(intakes.id, ids)));
  await appendAuditEvent({
    practiceId,
    actorType: "system",
    actorId: "cron",
    actorLabel: "retention sweep",
    action: "deleted",
    targetType: "intake",
    targetId: null,
    targetLabel: "retention window reached",
    metadata: { count: ids.length, reason: `older than ${settings.retentionYears}y` },
  });
  return ids.length;
}

/** Rows the board needs counted by status, for the chip row. */
export async function statusCounts(practiceId: string): Promise<Record<string, number>> {
  const db = getDb();
  const rows = await db
    .select({ status: intakes.status, n: count() })
    .from(intakes)
    .where(eq(intakes.practiceId, practiceId))
    .groupBy(intakes.status);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}

/** Packets sent in the last N days — used by the cron summary. */
export async function recentlySent(practiceId: string, days: number): Promise<number> {
  const db = getDb();
  const since = new Date(Date.now() - days * 86_400_000);
  const [row] = await db
    .select({ n: count() })
    .from(intakes)
    .where(and(eq(intakes.practiceId, practiceId), gte(intakes.sentAt, since)));
  return Number(row?.n ?? 0);
}

/** Reassign a packet to a different clinician. Audited like any other edit. */
export async function assignIntake(
  practiceId: string,
  intakeId: string,
  assignedUserId: string | null,
  actor: PhiActor,
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .update(intakes)
    .set({ assignedUserId, updatedAt: new Date() })
    .where(and(eq(intakes.id, intakeId), eq(intakes.practiceId, practiceId)))
    .returning({ id: intakes.id });
  if (!row) throw new IntakeError("That packet is not in this practice");
  await appendAuditEvent({
    practiceId,
    actorType: actor.type,
    actorId: actor.id,
    actorLabel: actor.label,
    action: "edited",
    targetType: "intake",
    targetId: intakeId,
    targetLabel: "clinician assignment",
    ip: actor.ip ?? null,
    metadata: { result: assignedUserId ? "assigned" : "unassigned" },
  });
}
