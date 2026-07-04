/**
 * src/lib/minors.ts
 *
 * The guardian/minor flow -- WaiverWing's headline differentiation.
 * One guardian signs for multiple minors in one pass, producing legally
 * coherent linked records.
 *
 * TODO:
 * - [ ] isMinor(dob, waiverMinorRule, onDate): age-of-majority check.
 * - [ ] validateGuardianSession(guardian, minors[]): guardian must be an
 *       adult; a minor can NEVER be a signer (hard reject -- ROADMAP
 *       acceptance criterion); relationship required per minor.
 * - [ ] buildSignatureRows(session): one signatures row per minor with
 *       signed_by_participant_id = guardian + guardian_relationship,
 *       plus the guardian's own row when the waiver requires it.
 * - [ ] linkParticipants(guardian, minors[]): set
 *       guardian_participant_id on minor participants.
 * - [ ] COPPA-aware minimalism: collect only fields the waiver needs
 *       for minors; no marketing flags on minor records.
 */

export interface GuardianSession {
  guardian: { participantId: string; dob: string };
  minors: Array<{ firstName: string; lastName: string; dob: string; relationship: string }>;
}

export function validateGuardianSession(_session: GuardianSession): string[] {
  throw new Error("Not implemented");
}
