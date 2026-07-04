/**
 * src/lib/incidents.ts
 *
 * Incident intake and the 29 CFR 1904 recordability engine. Correctness
 * here is existential (see README risks): conservative logic, cited rule
 * text, versioned as data, externally reviewed.
 *
 * TODO:
 * - [ ] Intake question flow as data: ordered questions with plain-language
 *       phrasing, the 1904.7(b)(5.ii) first-aid list inline, and per-answer
 *       rule citations.
 * - [ ] deriveRecordability(answers): implements 1904.7 general criteria
 *       (death, days away, restricted work/transfer, medical treatment
 *       beyond first aid, loss of consciousness, significant injury);
 *       returns { recordable, basis } with the driving answers recorded.
 *       Ambiguous paths return needs_judgment with a consult-counsel out --
 *       never guess toward non-recordable.
 * - [ ] FORM_LOGIC_VERSION constant; every derived result stores it so a
 *       rules revision never silently reclassifies history.
 * - [ ] severeDuty(treatment): fatality -> 8-hour report duty;
 *       hospitalization/amputation/eye loss -> 24-hour; returns deadline
 *       clock + OSHA contact info for the duty screen. Guidance only --
 *       SafetyDeck never files.
 * - [ ] Privacy cases (1904.29(b)(7)): flag list encoded; name masked on
 *       the 300 render.
 * - [ ] Yearly case_number sequence per company.
 */

export const FORM_LOGIC_VERSION = "1904-2025.1";

export interface RecordabilityResult {
  recordable: boolean | "needs_judgment";
  basis: Record<string, string>;
}

export function deriveRecordability(): RecordabilityResult {
  throw new Error("Not implemented");
}
