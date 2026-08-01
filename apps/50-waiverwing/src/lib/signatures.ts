/**
 * src/lib/signatures.ts
 *
 * Signature capture and evidence — the record that has to hold up eighteen
 * months later.
 *
 * A signature row is written once and never updated. It carries its own copy of
 * the exact text agreed (`signedText`), the blocks that produced it, the
 * answers and per-clause initials given, the disclosure sentence and when it
 * was accepted, the signer's identity and — for a minor — the guardian and the
 * relationship, plus timestamp, IP, user agent, channel, and a SHA-256 over the
 * canonical rendering. Editing the waiver afterwards produces a new version and
 * touches none of it.
 *
 * The kiosk offline path hands us a client-generated `offlineKey`. Insert is
 * `onConflictDoNothing` against a unique index, so replaying a sync any number
 * of times produces exactly one row.
 */

import { and, count, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  participants,
  signatures,
  waiverVersions,
  type EmergencyContact,
  type Participant,
  type Signature,
  type SignatureKind,
  type SigningChannel,
  type WaiverVersion,
} from "@/db/schema";
import { checkGuardianSession, isMinor, MinorRuleError, coverageEndsAt } from "@/lib/minors";
import {
  clauseBlocks,
  clauseConfig,
  expiresAt,
  hashText,
  questionBlocks,
  questionConfig,
  renderVersionText,
  shortHash,
  signatureConfig,
} from "@/lib/waivers";
import { ageOn } from "@/lib/time";

export class SigningError extends Error {}

/* ------------------------------------------------------------ normalisation */

/** Lowercased and trimmed at write time so search needs no read-time tricks. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  return v ? v : null;
}

/** Digits only, so "(303) 555-0117" and "3035550117" are the same person. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const v = (raw ?? "").replace(/\D+/g, "");
  return v ? v : null;
}

export function displayName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`.trim();
}

/* ----------------------------------------------------------------- capture */

export interface SigningPerson {
  firstName: string;
  lastName: string;
  dob: string;
  email?: string | null;
  phone?: string | null;
  /** Guardian's relationship to this participant. Minors only. */
  relationship?: string;
  /** Per-participant answers layered over the shared ones (medical flags). */
  answers?: Record<string, string>;
}

export interface SigningRequest {
  accountId: string;
  locationId: string;
  /** Venue timezone — decides when a "this visit" waiver stops covering. */
  timeZone?: string;
  version: WaiverVersion;
  channel: SigningChannel;
  ip: string | null;
  userAgent: string | null;

  /** The adult doing the signing. In the adult flow they are the participant. */
  signer: SigningPerson;
  /** Non-empty means this is a guardian session. */
  minors?: SigningPerson[];

  answers: Record<string, string>;
  initials: Record<string, string>;
  signatureKind: SignatureKind;
  /** Typed: the typed name. Drawn: SVG path data. */
  signatureData: string;
  disclosureAccepted: boolean;

  /** Kiosk idempotency. One base key per session; rows get `:0`, `:1`, … */
  offlineKey?: string | null;
  capturedAt?: Date | null;
  signedAt?: Date;
}

export interface SigningResult {
  signatureIds: string[];
  participantIds: string[];
  /** True when every row already existed — a replayed offline sync. */
  deduped: boolean;
  signerParticipantId: string;
}

function requireInitials(version: WaiverVersion, initials: Record<string, string>): string[] {
  const problems: string[] = [];
  for (const b of clauseBlocks(version.bodyBlocks)) {
    const given = (initials[b.key] ?? "").trim();
    if (!given) {
      problems.push(`Initial the clause "${clauseConfig(b).prompt}".`);
    } else if (given.length < 2 || given.length > 6) {
      problems.push("Initials are 2 to 6 characters.");
    }
  }
  return problems;
}

function requireAnswers(version: WaiverVersion, answers: Record<string, string>): string[] {
  const problems: string[] = [];
  for (const b of questionBlocks(version.bodyBlocks)) {
    const c = questionConfig(b);
    const given = (answers[b.key] ?? "").trim();
    if (c.required && !given) problems.push(`"${c.label}" is required.`);
    if (given && c.kind === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(given)) {
      problems.push(`"${c.label}" needs a valid email address.`);
    }
    if (given && c.kind === "yes_no" && !["yes", "no"].includes(given.toLowerCase())) {
      problems.push(`"${c.label}" is a yes/no question.`);
    }
  }
  return problems;
}

/** Emergency contact and medical flags, pulled out of the answer set. */
function derivedFields(
  version: WaiverVersion,
  answers: Record<string, string>,
): { emergencyContact: EmergencyContact | null; flags: Record<string, string> } {
  const name = answers.emergency_name?.trim();
  const phone = answers.emergency_phone?.trim();
  const emergencyContact: EmergencyContact | null =
    name && phone
      ? {
          name,
          phone,
          relationship: answers.emergency_relationship?.trim() || "Not stated",
        }
      : null;

  const flags: Record<string, string> = {};
  for (const b of questionBlocks(version.bodyBlocks)) {
    const c = questionConfig(b);
    const given = (answers[b.key] ?? "").trim();
    if (c.medical && given) flags[c.label] = given;
  }
  return { emergencyContact, flags };
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * Find-or-create a participant. Matching is deliberately conservative: an exact
 * name plus a matching normalised email or phone. Two different people called
 * Sam Nguyen with different emails stay two records — a wrongly merged waiver
 * record is worse than a duplicate one.
 */
async function upsertParticipant(
  tx: Tx,
  accountId: string,
  person: {
    firstName: string;
    lastName: string;
    dob: string | null;
    email: string | null;
    phone: string | null;
    isMinor: boolean;
    guardianParticipantId?: string | null;
    emergencyContact: EmergencyContact | null;
    flags: Record<string, string>;
  },
): Promise<Participant> {
  const first = person.firstName.trim();
  const last = person.lastName.trim();
  const email = normalizeEmail(person.email);
  const phone = normalizePhone(person.phone);

  const candidates = await tx
    .select()
    .from(participants)
    .where(
      and(
        eq(participants.accountId, accountId),
        sql`lower(${participants.firstName}) = ${first.toLowerCase()}`,
        sql`lower(${participants.lastName}) = ${last.toLowerCase()}`,
      ),
    );

  const match =
    candidates.find((c) => email && c.email === email) ??
    candidates.find((c) => phone && c.phone === phone) ??
    // A minor has no contact details of their own; the DOB plus the guardian is
    // the identity, which is exactly how a family gets recognised on return.
    candidates.find(
      (c) =>
        person.isMinor &&
        person.dob !== null &&
        c.dob === person.dob &&
        (!person.guardianParticipantId ||
          c.guardianParticipantId === person.guardianParticipantId),
    ) ??
    null;

  if (match) {
    const [updated] = await tx
      .update(participants)
      .set({
        dob: person.dob ?? match.dob,
        email: email ?? match.email,
        phone: phone ?? match.phone,
        isMinor: person.isMinor,
        guardianParticipantId: person.guardianParticipantId ?? match.guardianParticipantId,
        emergencyContact: person.emergencyContact ?? match.emergencyContact,
        flags: { ...match.flags, ...person.flags },
        updatedAt: new Date(),
      })
      .where(eq(participants.id, match.id))
      .returning();
    return updated;
  }

  const [created] = await tx
    .insert(participants)
    .values({
      accountId,
      firstName: first,
      lastName: last,
      dob: person.dob,
      email,
      phone,
      isMinor: person.isMinor,
      guardianParticipantId: person.guardianParticipantId ?? null,
      emergencyContact: person.emergencyContact,
      flags: person.flags,
    })
    .returning();
  return created;
}

/**
 * Capture one signing session: an adult signing for themselves, or a guardian
 * signing for one or more minors in a single pass.
 *
 * Every row written here is self-contained evidence. The waiver version is read
 * once, rendered once, and that rendering is copied onto each row along with its
 * hash — recomputed here rather than trusted from the version row, so a
 * tampered `waiver_versions.text_hash` cannot launder a signature.
 */
export async function captureSigning(req: SigningRequest): Promise<SigningResult> {
  const db = getDb();
  const version = req.version;
  const tz = req.timeZone ?? "UTC";
  const signedAt = req.signedAt ?? new Date();
  const rule = version.minorRule;

  if (!req.disclosureAccepted) {
    throw new SigningError("Tick the consent box above the signature to continue.");
  }

  const sigConfig = signatureConfig(version.bodyBlocks);
  if (req.signatureKind === "drawn" && !sigConfig.allowDrawn) {
    throw new SigningError("This waiver only accepts a typed signature.");
  }
  if (!req.signatureData.trim()) {
    throw new SigningError(
      req.signatureKind === "drawn" ? "Draw your signature to continue." : "Type your full name to sign.",
    );
  }
  if (req.signatureKind === "typed" && req.signatureData.trim().length < 3) {
    throw new SigningError("Type your full name as your signature.");
  }

  const problems = [
    ...requireAnswers(version, req.answers),
    ...requireInitials(version, req.initials),
  ];
  if (!req.signer.firstName.trim() || !req.signer.lastName.trim()) {
    problems.push("Enter your first and last name.");
  }
  if (problems.length) throw new SigningError(problems.join(" "));

  const minorInputs = req.minors ?? [];
  const isGuardianSession = minorInputs.length > 0;

  const signerAge = req.signer.dob ? ageOn(req.signer.dob, signedAt, tz) : null;

  if (isGuardianSession) {
    const check = checkGuardianSession({
      guardian: req.signer,
      minors: minorInputs.map((m) => ({
        firstName: m.firstName,
        lastName: m.lastName,
        dob: m.dob,
        relationship: m.relationship,
      })),
      rule,
      signedAt,
      timeZone: tz,
    });
    if (check.problems.length) throw new MinorRuleError(check.problems.join(" "));
  } else {
    if (!req.signer.dob.trim()) throw new SigningError("Enter your date of birth.");
    if (signerAge === null) throw new SigningError("Enter your date of birth as YYYY-MM-DD.");
    if (signerAge < 0) throw new SigningError("That date of birth is in the future.");
    if (isMinor(req.signer.dob, rule, signedAt, tz)) {
      // The hard reject, in plain language, on the customer's own phone.
      throw new MinorRuleError(
        `You are under ${rule.ageOfMajority}, so you cannot sign this waiver yourself. ` +
          `A parent or legal guardian needs to sign for you — hand them this screen and choose "A parent or guardian is signing".`,
      );
    }
  }

  // One canonical rendering, hashed here. Everything below copies it.
  const signedText = renderVersionText({
    title: version.title,
    version: version.version,
    bodyBlocks: version.bodyBlocks,
    expiryRule: version.expiryRule,
    minorRule: version.minorRule,
  });
  const textHash = hashText(signedText);
  const expiry = expiresAt(version.expiryRule, signedAt, tz);
  const signerName = `${req.signer.firstName.trim()} ${req.signer.lastName.trim()}`;
  const sharedDerived = derivedFields(version, req.answers);

  const result = await db.transaction(async (tx) => {
    const signatureIds: string[] = [];
    const participantIds: string[] = [];
    let inserted = 0;
    let rowIndex = 0;

    const guardian = await upsertParticipant(tx, req.accountId, {
      firstName: req.signer.firstName,
      lastName: req.signer.lastName,
      dob: req.signer.dob || null,
      email: req.signer.email ?? null,
      phone: req.signer.phone ?? null,
      isMinor: false,
      emergencyContact: sharedDerived.emergencyContact,
      flags: isGuardianSession ? {} : sharedDerived.flags,
    });
    participantIds.push(guardian.id);

    const writeRow = async (input: {
      participant: Participant;
      minorAtSigning: boolean;
      participantAge: number | null;
      relationship: string | null;
      answers: Record<string, string>;
    }) => {
      const key = req.offlineKey ? `${req.offlineKey}:${rowIndex}` : null;
      rowIndex += 1;

      const values = {
        accountId: req.accountId,
        participantId: input.participant.id,
        waiverVersionId: version.id,
        waiverId: version.waiverId,
        locationId: req.locationId,
        waiverTitle: version.title,
        waiverVersion: version.version,
        signedText,
        signedBlocks: version.bodyBlocks,
        textHash,
        answers: input.answers,
        initials: req.initials,
        disclosureText: sigConfig.disclosure,
        disclosureAcceptedAt: signedAt,
        signerName,
        signedByParticipantId: input.minorAtSigning ? guardian.id : null,
        guardianRelationship: input.relationship,
        signerAgeYears: input.participantAge,
        minorAtSigning: input.minorAtSigning,
        ageOfMajorityAtSigning: rule.ageOfMajority,
        resignAtMajority: rule.resignAtMajority,
        signatureKind: req.signatureKind,
        signatureData: req.signatureData,
        signedAt,
        expiresAt: expiry,
        expiryRule: version.expiryRule,
        ip: req.ip,
        userAgent: req.userAgent,
        channel: req.channel,
        offlineKey: key,
        capturedAt: req.capturedAt ?? null,
      };

      const returned = await tx
        .insert(signatures)
        .values(values)
        .onConflictDoNothing({ target: signatures.offlineKey })
        .returning({ id: signatures.id });

      if (returned.length) {
        inserted += 1;
        signatureIds.push(returned[0].id);
        return;
      }
      // Conflict: this offline key already synced. Report the original row.
      const [existing] = await tx
        .select({ id: signatures.id })
        .from(signatures)
        .where(eq(signatures.offlineKey, key!));
      if (existing) signatureIds.push(existing.id);
    };

    if (isGuardianSession) {
      for (const m of minorInputs) {
        const answers = { ...req.answers, ...(m.answers ?? {}) };
        const derived = derivedFields(version, answers);
        const minor = await upsertParticipant(tx, req.accountId, {
          firstName: m.firstName,
          lastName: m.lastName,
          dob: m.dob,
          // COPPA-aware minimalism: a minor carries no contact details of
          // their own; the guardian's record holds those.
          email: null,
          phone: null,
          isMinor: true,
          guardianParticipantId: guardian.id,
          emergencyContact: derived.emergencyContact,
          flags: derived.flags,
        });
        participantIds.push(minor.id);
        await writeRow({
          participant: minor,
          minorAtSigning: true,
          participantAge: ageOn(m.dob, signedAt, tz),
          relationship: m.relationship?.trim() ?? null,
          answers,
        });
      }

      if (rule.guardianSignsForSelf) {
        await writeRow({
          participant: guardian,
          minorAtSigning: false,
          participantAge: signerAge,
          relationship: null,
          answers: req.answers,
        });
      }
    } else {
      await writeRow({
        participant: guardian,
        minorAtSigning: false,
        participantAge: signerAge,
        relationship: null,
        answers: req.answers,
      });
    }

    return {
      signatureIds,
      participantIds,
      deduped: inserted === 0 && signatureIds.length > 0,
      signerParticipantId: guardian.id,
    };
  });

  return result;
}

/* ------------------------------------------------------------------- reads */

export async function getSignature(id: string, accountId: string): Promise<Signature | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(signatures)
    .where(and(eq(signatures.id, id), eq(signatures.accountId, accountId)));
  return row ?? null;
}

export async function signatureHistory(participantId: string): Promise<Signature[]> {
  const db = getDb();
  return db
    .select()
    .from(signatures)
    .where(eq(signatures.participantId, participantId))
    .orderBy(desc(signatures.signedAt));
}

/** Signed waivers this calendar month — the soft-cap metric. */
export async function monthlyVolume(accountId: string, at: Date = new Date()): Promise<number> {
  const db = getDb();
  const start = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  const end = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
  const [row] = await db
    .select({ n: count() })
    .from(signatures)
    .where(
      and(
        eq(signatures.accountId, accountId),
        gte(signatures.signedAt, start),
        lte(signatures.signedAt, end),
      ),
    );
  return Number(row?.n ?? 0);
}

/**
 * Does the stored evidence still verify?
 *
 * Recomputes the hash over the text the signature carries. A mismatch means the
 * stored text was altered after the fact — which is the only way this can fail,
 * because the text is never re-derived from the waiver.
 */
export function verifySignatureEvidence(sig: Signature): {
  ok: boolean;
  computed: string;
} {
  const computed = hashText(sig.signedText);
  return { ok: computed === sig.textHash, computed };
}

/**
 * Does the signature still match the version row it points at? Divergence is
 * expected and fine after a waiver edit — a new version is published and old
 * signatures keep pointing at the old one. This exists for the audit view.
 */
export async function versionForSignature(sig: Signature): Promise<WaiverVersion | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(waiverVersions)
    .where(eq(waiverVersions.id, sig.waiverVersionId));
  return row ?? null;
}

/* --------------------------------------------------------------- evidence */

export interface EvidenceSummary {
  lines: string[];
  /** `SIGNED MAR 2 2026 · 09:41 · KIOSK · SHA-256 4B1E…9C77` (DESIGN.md). */
  monoLine: string;
  verified: boolean;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function stampDate(at: Date, timeZone = "UTC"): string {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts: Record<string, string> = {};
  for (const p of f.formatToParts(at)) if (p.type !== "literal") parts[p.type] = p.value;
  return `${MONTHS[Number(parts.month) - 1]} ${Number(parts.day)} ${parts.year} · ${parts.hour}:${parts.minute}`;
}

export function channelLabel(channel: SigningChannel): string {
  return channel === "qr" ? "QR" : channel === "kiosk" ? "KIOSK" : "LINK";
}

export function evidenceSummary(
  sig: Signature,
  participantDob: string | null,
  timeZone = "UTC",
): EvidenceSummary {
  const { ok } = verifySignatureEvidence(sig);
  const monoLine = `SIGNED ${stampDate(sig.signedAt, timeZone)} · ${channelLabel(
    sig.channel,
  )} · SHA-256 ${shortHash(sig.textHash)}`;

  const { endsAt, reason } = coverageEndsAt(sig, participantDob, timeZone);
  const lines = [
    `Waiver: ${sig.waiverTitle} (version ${sig.waiverVersion})`,
    `Signed at: ${sig.signedAt.toISOString()}`,
    `Signed by: ${sig.signerName}${
      sig.minorAtSigning ? ` — ${sig.guardianRelationship ?? "guardian"} of the participant` : ""
    }`,
    `Signature: ${sig.signatureKind === "drawn" ? "drawn on device" : `typed as "${sig.signatureData}"`}`,
    `Channel: ${channelLabel(sig.channel)}${sig.capturedAt ? " (captured offline, synced later)" : ""}`,
    `IP address: ${sig.ip ?? "not recorded"}`,
    `Device: ${sig.userAgent ?? "not recorded"}`,
    `Consent: "${sig.disclosureText}" accepted ${sig.disclosureAcceptedAt.toISOString()}`,
    `Waiver text SHA-256: ${sig.textHash}`,
    `Evidence check: ${ok ? "hash matches the stored text" : "MISMATCH — stored text has been altered"}`,
    `Coverage ends: ${
      endsAt === null
        ? "does not expire"
        : `${endsAt.toISOString()}${reason === "reached_majority" ? " (participant reaches the age of majority)" : ""}`
    }`,
  ];
  if (sig.minorAtSigning) {
    lines.splice(
      3,
      0,
      `Participant was ${sig.signerAgeYears ?? "?"} years old at signing; age of majority on this waiver was ${sig.ageOfMajorityAtSigning}.`,
    );
  }
  return { lines, monoLine, verified: ok };
}

/** Signatures for a set of participants, newest first — used by bulk export. */
export async function signaturesForParticipants(
  accountId: string,
  participantIds: string[],
): Promise<Signature[]> {
  if (!participantIds.length) return [];
  const db = getDb();
  return db
    .select()
    .from(signatures)
    .where(
      and(eq(signatures.accountId, accountId), inArray(signatures.participantId, participantIds)),
    )
    .orderBy(desc(signatures.signedAt));
}

/** Offline-synced rows, for the kiosk health view. */
export async function offlineSyncedCount(accountId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: count() })
    .from(signatures)
    .where(and(eq(signatures.accountId, accountId), isNotNull(signatures.capturedAt)));
  return Number(row?.n ?? 0);
}
