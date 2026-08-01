/**
 * src/lib/minors.ts
 *
 * The guardian/minor rules — WaiverWing's headline differentiation, and the
 * corner both paper binders and generic e-sign tools get wrong.
 *
 * Three questions this file answers, all of them at *signing* time and all of
 * them recorded on the signature so they can be re-read later:
 *
 *  1. **Is this participant a minor?** Determined from a date of birth against
 *     the waiver version's age of majority, on the day they sign — not "is the
 *     box ticked", and not re-derived later from today's date.
 *  2. **Who is allowed to sign for them?** An adult, identified by name and by
 *     relationship, who signs in their own name. A minor can never be the
 *     signer — not for themselves, and not for a sibling.
 *  3. **What happens when a minor turns 18 mid-season?** A guardian's authority
 *     to bind another person ends when that person becomes an adult. See
 *     `coverageEndsAt`: guardian-signed coverage lapses on the majority
 *     birthday, so the returning 18-year-old is prompted to sign in their own
 *     name instead of coasting on a waiver their mother signed at fifteen.
 *     Operators can turn that off per waiver (`resignAtMajority: false`); the
 *     default is on, and whichever way it was set is snapshotted onto the
 *     signature so a later change cannot rewrite history.
 */

import type { MinorRule, Signature } from "@/db/schema";
import { ageOn, birthdayInstant, parseCalendarDate } from "@/lib/time";

export class MinorRuleError extends Error {}

/** Under the waiver's age of majority on `onDate`? Null DOB is not a minor claim. */
export function isMinor(
  dobIso: string,
  rule: Pick<MinorRule, "ageOfMajority">,
  onDate: Date,
  timeZone = "UTC",
): boolean {
  const age = ageOn(dobIso, onDate, timeZone);
  if (age === null) throw new MinorRuleError("Enter a date of birth as YYYY-MM-DD.");
  return age < rule.ageOfMajority;
}

export interface PersonInput {
  firstName: string;
  lastName: string;
  dob: string;
  /** Relationship of the guardian to this minor. Required for minors only. */
  relationship?: string;
}

export interface GuardianSession {
  guardian: PersonInput & { email?: string | null; phone?: string | null };
  minors: PersonInput[];
  rule: MinorRule;
  /** The day the signing happens — ages are computed against this, not "now". */
  signedAt: Date;
  timeZone?: string;
}

export interface GuardianSessionCheck {
  problems: string[];
  guardianAge: number | null;
  /** Per-minor resolved ages, index-aligned with `session.minors`. */
  minorAges: Array<number | null>;
}

/**
 * Validate a whole guardian session in one pass.
 *
 * Returns problems rather than throwing on the first one: a parent standing at a
 * counter with three kids should see everything wrong at once, not play
 * whack-a-mole one field at a time.
 */
export function checkGuardianSession(session: GuardianSession): GuardianSessionCheck {
  const problems: string[] = [];
  const tz = session.timeZone ?? "UTC";
  const { rule, signedAt } = session;

  const g = session.guardian;
  if (!g.firstName.trim() || !g.lastName.trim()) {
    problems.push("Enter the signing adult's first and last name.");
  }

  const guardianAge = g.dob ? ageOn(g.dob, signedAt, tz) : null;
  if (!g.dob.trim()) {
    problems.push("Enter the signing adult's date of birth — we check it against the age of majority.");
  } else if (guardianAge === null) {
    problems.push("The signing adult's date of birth is not a valid date (use YYYY-MM-DD).");
  } else if (guardianAge < 0) {
    problems.push("The signing adult's date of birth is in the future.");
  } else if (guardianAge < rule.ageOfMajority) {
    // The hard reject. A minor can never be a signer, for anyone.
    problems.push(
      `A person under ${rule.ageOfMajority} cannot sign a waiver — for themselves or for anyone else. ` +
        `The adult present needs to sign. If nobody here is ${rule.ageOfMajority} or over, ask the front desk.`,
    );
  }

  if (session.minors.length === 0) {
    problems.push("Add at least one participant under the age of majority, or use the adult flow.");
  }

  const minorAges: Array<number | null> = [];
  session.minors.forEach((m, i) => {
    const label = m.firstName.trim() || `Participant ${i + 1}`;
    if (!m.firstName.trim() || !m.lastName.trim()) {
      problems.push(`Enter a first and last name for participant ${i + 1}.`);
    }
    if (!m.dob.trim()) {
      problems.push(`${label} needs a date of birth.`);
      minorAges.push(null);
      return;
    }
    const age = ageOn(m.dob, signedAt, tz);
    minorAges.push(age);
    if (age === null) {
      problems.push(`${label}'s date of birth is not a valid date (use YYYY-MM-DD).`);
      return;
    }
    if (age < 0) {
      problems.push(`${label}'s date of birth is in the future.`);
      return;
    }
    if (age >= rule.ageOfMajority) {
      problems.push(
        `${label} is ${age} — at ${rule.ageOfMajority} or over they sign for themselves. Remove them here and have them sign their own waiver.`,
      );
    }
    if (!m.relationship?.trim()) {
      problems.push(`Say how you are related to ${label}.`);
    } else if (!rule.relationshipOptions.includes(m.relationship.trim())) {
      problems.push(
        `"${m.relationship}" is not a relationship this waiver accepts (${rule.relationshipOptions.join(", ")}).`,
      );
    }
  });

  const seen = new Set<string>();
  for (const m of session.minors) {
    const key = `${m.firstName.trim().toLowerCase()}|${m.lastName.trim().toLowerCase()}|${m.dob}`;
    if (key !== "||" && seen.has(key)) {
      problems.push(`${m.firstName} ${m.lastName} is listed twice.`);
    }
    seen.add(key);
  }

  return { problems, guardianAge, minorAges };
}

/** Throwing wrapper for call sites that just want the guarantee. */
export function assertGuardianSession(session: GuardianSession): void {
  const { problems } = checkGuardianSession(session);
  if (problems.length) throw new MinorRuleError(problems.join(" "));
}

/**
 * "Sign for Maya and Leo" — names, not counts (DESIGN.md guardian stepper).
 */
export function signForLabel(names: string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return "Sign";
  if (clean.length === 1) return `Sign for ${clean[0]}`;
  if (clean.length === 2) return `Sign for ${clean[0]} and ${clean[1]}`;
  return `Sign for ${clean.slice(0, -1).join(", ")} and ${clean[clean.length - 1]}`;
}

/* ------------------------------------------------- the turning-18 question */

export type CoverageEndReason = "expiry_rule" | "reached_majority" | "never";

export interface CoverageEnd {
  endsAt: Date | null;
  reason: CoverageEndReason;
}

/**
 * When coverage from a signature actually stops — the *effective* expiry, which
 * is not always the column.
 *
 * For a waiver signed by a guardian on a minor's behalf, the guardian's
 * authority runs out when the minor reaches the age of majority recorded at
 * signing. If that happens before the waiver's own expiry (or the waiver never
 * expires) it is the majority birthday that governs. A minor who signs in
 * March, turns 18 in June and comes back in July has no valid waiver, and the
 * check-in screen must say so.
 *
 * Adults, and minors on waivers where the operator turned the rule off, are
 * governed by `expiresAt` alone.
 */
export function coverageEndsAt(
  signature: Pick<
    Signature,
    "expiresAt" | "minorAtSigning" | "resignAtMajority" | "ageOfMajorityAtSigning"
  >,
  participantDob: string | null,
  timeZone = "UTC",
): CoverageEnd {
  const ruleEnd = signature.expiresAt ?? null;

  if (
    !signature.minorAtSigning ||
    !signature.resignAtMajority ||
    !participantDob ||
    !parseCalendarDate(participantDob)
  ) {
    return { endsAt: ruleEnd, reason: ruleEnd ? "expiry_rule" : "never" };
  }

  const majority = birthdayInstant(participantDob, signature.ageOfMajorityAtSigning, timeZone);
  if (!majority) return { endsAt: ruleEnd, reason: ruleEnd ? "expiry_rule" : "never" };

  if (!ruleEnd || majority.getTime() < ruleEnd.getTime()) {
    return { endsAt: majority, reason: "reached_majority" };
  }
  return { endsAt: ruleEnd, reason: "expiry_rule" };
}

/** Is the signature still covering this participant at `at`? */
export function signatureValidAt(
  signature: Pick<
    Signature,
    "expiresAt" | "minorAtSigning" | "resignAtMajority" | "ageOfMajorityAtSigning" | "signedAt"
  >,
  participantDob: string | null,
  at: Date,
  timeZone = "UTC",
): boolean {
  if (signature.signedAt.getTime() > at.getTime()) return false;
  const { endsAt } = coverageEndsAt(signature, participantDob, timeZone);
  return endsAt === null || endsAt.getTime() > at.getTime();
}

/** Plain-language reason for the re-sign prompt on an amber row. */
export function resignReason(
  signature: Pick<
    Signature,
    "expiresAt" | "minorAtSigning" | "resignAtMajority" | "ageOfMajorityAtSigning" | "signedAt"
  >,
  participantDob: string | null,
  at: Date,
  timeZone = "UTC",
): string | null {
  if (signatureValidAt(signature, participantDob, at, timeZone)) return null;
  const { reason, endsAt } = coverageEndsAt(signature, participantDob, timeZone);
  if (reason === "reached_majority") {
    return `Signed by a guardian before they turned ${signature.ageOfMajorityAtSigning}. They now sign for themselves.`;
  }
  if (endsAt) return "Waiver expired.";
  return "No waiver on file.";
}

/**
 * COPPA-aware minimalism: the fields we keep on a minor's participant record.
 * A minor gets a name, a DOB, the guardian link and whatever the waiver's own
 * questions asked. No contact details of their own, no marketing flags.
 */
export function minorContactFields(): { email: null; phone: null } {
  return { email: null, phone: null };
}
