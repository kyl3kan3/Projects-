/**
 * src/lib/fit-score.ts
 *
 * Fit scoring: org profile x funder record -> 0-100 with visible reasons.
 * Pure functions -- no I/O. The UI renders every factor's reason string
 * verbatim (DESIGN.md fit arc); there is no score without reasons.
 *
 * TODO:
 * - [ ] Factors (weighted): geography match (service states vs
 *       states_funded), cause overlap (cause_codes), ask-vs-typical-size
 *       fit, new_grantee_share signal, accepts_unsolicited signal.
 * - [ ] scoreFunder(profile, funder): { total, factors[] } where each
 *       factor = { key, weight, matched, reason } with a human sentence
 *       ("Typically grants $5-25k -- matches your $10k ask").
 * - [ ] Profile-thinness guard: fewer than N profile fields -> return
 *       null (UI shows "Complete your profile to score"); never guess.
 * - [ ] "Long shot" labeling when total < 40 -- honesty over flattery.
 * - [ ] Cache key: (profileVersion, funderVersion) -- exported helper so
 *       the caller can invalidate on profile edits.
 * - [ ] Documented fixture: the exact breakdown asserted by the ROADMAP
 *       acceptance test lives beside this module.
 */

export interface FitFactor {
  key: string;
  weight: number;
  matched: boolean;
  reason: string;
}

export interface FitScore {
  total: number;
  longShot: boolean;
  factors: FitFactor[];
}

export function scoreFunder(
  _profile: Record<string, unknown>,
  _funder: Record<string, unknown>,
): FitScore | null {
  throw new Error("Not implemented");
}
