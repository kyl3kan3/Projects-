/**
 * src/lib/screeners.ts
 *
 * Clinical screener definitions and scoring (PHQ-9, GAD-7 in v1).
 * Scores are computed server-side into score_summary (totals only,
 * outside ciphertext) and client-side for instant patient display --
 * both from this one module so they can never disagree.
 *
 * TODO:
 * - [ ] Item banks with exact published wording and 0-3 response scale
 *       (public-domain instruments; include the standard attribution).
 * - [ ] scorePhq9(answers): total + severity band (minimal/mild/moderate/
 *       moderately severe/severe) + item-9 positive flag.
 * - [ ] scoreGad7(answers): total + severity band.
 * - [ ] Item-9 (self-harm) flag routing: mark the intake for immediate
 *       clinician notification -- configurable per practice, on by default.
 * - [ ] Severity bands rendered per DESIGN.md: mono `PHQ-9 · 14 ·
 *       MODERATE`, never colored digits.
 */

export type Severity =
  | "minimal"
  | "mild"
  | "moderate"
  | "moderately_severe"
  | "severe";

export interface ScreenerResult {
  instrument: "phq9" | "gad7";
  total: number;
  severity: Severity;
  flagged: boolean;
}

export function scorePhq9(_answers: number[]): ScreenerResult {
  throw new Error("Not implemented");
}

export function scoreGad7(_answers: number[]): ScreenerResult {
  throw new Error("Not implemented");
}
