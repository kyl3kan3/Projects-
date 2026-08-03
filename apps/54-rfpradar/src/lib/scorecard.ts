/**
 * src/lib/scorecard.ts
 *
 * The go/no-go scorecard: five weighted questions, scored 1-5, producing a
 * verdict the firm records against the pursuit.
 *
 * Pure arithmetic on purpose. The screen shows the working — "weight 25 × 4 =
 * 100 of 125 points" — because a verdict a partner cannot recompute in their
 * head is a verdict they will overrule. This is also the highest-ROI feature in
 * proposal economics, so the "no" is a first-class outcome: recording it closes
 * the pursuit and keeps the reason, which is how the firm gets its first honest
 * win-rate denominator.
 *
 * Every criterion is phrased so **5 is favourable**. "Incumbent present?" as a
 * question inverts the scale halfway down a form and produces exactly the kind
 * of quiet scoring error this product exists to prevent.
 */

export interface ScorecardCriterion {
  key: string;
  label: string;
  weight: number;
  score1to5: number | null;
  note: string;
}

export type Verdict = "go" | "conditional" | "no_go";

/** The default template. Weights sum to 100 so the maths reads plainly. */
export const DEFAULT_CRITERIA: readonly Omit<ScorecardCriterion, "score1to5" | "note">[] = [
  { key: "incumbent", label: "The field is open (no entrenched incumbent)", weight: 25 },
  { key: "vehicle", label: "We can hold the contract vehicle", weight: 25 },
  { key: "capacity", label: "We have the capacity to deliver on time", weight: 20 },
  { key: "price", label: "Evaluation is not price-shaped against us", weight: 15 },
  { key: "relationship", label: "We have a relationship with this buyer", weight: 15 },
];

/** Anchors shown under each row, so 1-5 means the same thing to everyone. */
export const SCALE_ANCHORS: Record<string, [string, string]> = {
  incumbent: ["A named incumbent is heavily favoured", "No incumbent, or the incumbent is vulnerable"],
  vehicle: ["We cannot hold the vehicle", "We hold it today"],
  capacity: ["We would have to turn down other work", "The team is free"],
  price: ["Lowest price technically acceptable", "Best value, technical weighted heaviest"],
  relationship: ["Never spoken to this buyer", "We have done work for them"],
};

export function defaultCriteria(): ScorecardCriterion[] {
  return DEFAULT_CRITERIA.map((c) => ({ ...c, score1to5: null, note: "" }));
}

export interface CriterionRow extends ScorecardCriterion {
  /** weight × score — the row's contribution, shown on screen. */
  points: number;
  maxPoints: number;
}

export interface VerdictResult {
  rows: CriterionRow[];
  points: number;
  maxPoints: number;
  /** 0-100, or null until every criterion is scored. */
  score: number | null;
  verdict: Verdict | null;
  /** How many rows still need a score. */
  unscored: number;
  /** The band arithmetic, in words, for the screen. */
  explanation: string;
}

/** Band thresholds on the 0-100 weighted score. */
export const GO_THRESHOLD = 65;
export const CONDITIONAL_THRESHOLD = 45;

export function verdictFor(score: number): Verdict {
  if (score >= GO_THRESHOLD) return "go";
  if (score >= CONDITIONAL_THRESHOLD) return "conditional";
  return "no_go";
}

export function verdictLabel(verdict: Verdict | null): string {
  if (verdict === "go") return "GO";
  if (verdict === "conditional") return "CONDITIONAL";
  if (verdict === "no_go") return "NO-GO";
  return "UNSCORED";
}

/**
 * The live verdict. Partial scorecards report their arithmetic so far and
 * `verdict: null` — a half-filled scorecard must never display a confident
 * "NO-GO" that is really just three unanswered questions.
 */
export function weightedVerdict(criteria: ScorecardCriterion[]): VerdictResult {
  const rows: CriterionRow[] = criteria.map((criterion) => {
    const score = clampScore(criterion.score1to5);
    return {
      ...criterion,
      score1to5: score,
      points: score === null ? 0 : criterion.weight * score,
      maxPoints: criterion.weight * 5,
    };
  });

  const points = rows.reduce((sum, row) => sum + row.points, 0);
  const maxPoints = rows.reduce((sum, row) => sum + row.maxPoints, 0);
  const unscored = rows.filter((row) => row.score1to5 === null).length;

  if (maxPoints === 0) {
    return {
      rows,
      points,
      maxPoints,
      score: null,
      verdict: null,
      unscored,
      explanation: "No criteria on this scorecard yet.",
    };
  }

  if (unscored > 0) {
    return {
      rows,
      points,
      maxPoints,
      score: null,
      verdict: null,
      unscored,
      explanation: `${points} of ${maxPoints} points so far — ${unscored} question${unscored === 1 ? "" : "s"} still unscored.`,
    };
  }

  const score = Math.round((points / maxPoints) * 100);
  const verdict = verdictFor(score);
  return {
    rows,
    points,
    maxPoints,
    score,
    verdict,
    unscored: 0,
    explanation: `${points} of ${maxPoints} points = ${score}. ${score} ${
      verdict === "go"
        ? `is at or above ${GO_THRESHOLD}, so this reads GO.`
        : verdict === "conditional"
          ? `sits between ${CONDITIONAL_THRESHOLD} and ${GO_THRESHOLD - 1}, so this reads CONDITIONAL.`
          : `is below ${CONDITIONAL_THRESHOLD}, so this reads NO-GO.`
    }`,
  };
}

function clampScore(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

/** Parse criteria out of the jsonb column, defaulting anything malformed. */
export function readCriteria(value: unknown): ScorecardCriterion[] {
  if (!Array.isArray(value) || value.length === 0) return defaultCriteria();
  const rows: ScorecardCriterion[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<ScorecardCriterion>;
    if (typeof row.key !== "string" || typeof row.label !== "string") continue;
    rows.push({
      key: row.key,
      label: row.label,
      weight: typeof row.weight === "number" && row.weight > 0 ? row.weight : 10,
      score1to5: clampScore(row.score1to5 ?? null),
      note: typeof row.note === "string" ? row.note : "",
    });
  }
  return rows.length > 0 ? rows : defaultCriteria();
}

/** The stage a verdict sends the pursuit to. A "no" closes it, then and there. */
export function stageForVerdict(verdict: Verdict): "drafting" | "no_bid" {
  return verdict === "no_go" ? "no_bid" : "drafting";
}
