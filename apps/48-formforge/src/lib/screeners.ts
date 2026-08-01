/**
 * src/lib/screeners.ts
 *
 * Clinical screener definitions and scoring: PHQ-9 and GAD-7 at v1.
 *
 * One module, two consumers: the patient's phone shows the total the moment the
 * last item is answered, and the server recomputes it into
 * `submissions.score_summary`. Both call the same function, so client and server
 * cannot disagree about a number a clinician will act on.
 *
 * `score_summary` holds totals and severity only — never item answers — which is
 * what lets the status board and the CSV report severity without decrypting a
 * single packet.
 *
 * Both instruments are public-domain and reproduced with their standard
 * attribution (see `ATTRIBUTION`). This module is scoring arithmetic, not a
 * diagnosis: severity bands are the published cut-points, nothing more.
 */

export type Instrument = "phq9" | "gad7";

export type Severity = "minimal" | "mild" | "moderate" | "moderately_severe" | "severe";

export interface ScreenerResult {
  instrument: Instrument;
  total: number;
  severity: Severity;
  /** PHQ-9 item 9 answered above zero — a positive self-harm item. */
  flagged: boolean;
  /** How many items were answered, so partial packets read honestly. */
  answered: number;
  items: number;
}

export interface ScreenerDefinition {
  instrument: Instrument;
  name: string;
  /** Rendered above the items, verbatim. */
  prompt: string;
  items: string[];
  options: { value: number; label: string }[];
  attribution: string;
  maxTotal: number;
}

const OPTIONS = [
  { value: 0, label: "Not at all" },
  { value: 1, label: "Several days" },
  { value: 2, label: "More than half the days" },
  { value: 3, label: "Nearly every day" },
];

export const ATTRIBUTION = {
  phq9:
    "PHQ-9 developed by Drs. Robert L. Spitzer, Janet B.W. Williams, Kurt Kroenke and colleagues, " +
    "with an educational grant from Pfizer Inc. No permission required to reproduce, translate, display or distribute.",
  gad7:
    "GAD-7 developed by Drs. Robert L. Spitzer, Kurt Kroenke, Janet B.W. Williams and colleagues, " +
    "with an educational grant from Pfizer Inc. No permission required to reproduce, translate, display or distribute.",
} as const;

export const PHQ9: ScreenerDefinition = {
  instrument: "phq9",
  name: "PHQ-9",
  prompt: "Over the last 2 weeks, how often have you been bothered by any of the following problems?",
  items: [
    "Little interest or pleasure in doing things",
    "Feeling down, depressed, or hopeless",
    "Trouble falling or staying asleep, or sleeping too much",
    "Feeling tired or having little energy",
    "Poor appetite or overeating",
    "Feeling bad about yourself — or that you are a failure or have let yourself or your family down",
    "Trouble concentrating on things, such as reading the newspaper or watching television",
    "Moving or speaking so slowly that other people could have noticed — or the opposite, being fidgety or restless",
    "Thoughts that you would be better off dead or of hurting yourself in some way",
  ],
  options: OPTIONS,
  attribution: ATTRIBUTION.phq9,
  maxTotal: 27,
};

export const GAD7: ScreenerDefinition = {
  instrument: "gad7",
  name: "GAD-7",
  prompt: "Over the last 2 weeks, how often have you been bothered by the following problems?",
  items: [
    "Feeling nervous, anxious, or on edge",
    "Not being able to stop or control worrying",
    "Worrying too much about different things",
    "Trouble relaxing",
    "Being so restless that it is hard to sit still",
    "Becoming easily annoyed or irritable",
    "Feeling afraid, as if something awful might happen",
  ],
  options: OPTIONS,
  attribution: ATTRIBUTION.gad7,
  maxTotal: 21,
};

export const SCREENERS: Record<Instrument, ScreenerDefinition> = { phq9: PHQ9, gad7: GAD7 };

export function screenerDefinition(instrument: string): ScreenerDefinition | null {
  return instrument === "phq9" || instrument === "gad7" ? SCREENERS[instrument] : null;
}

/** Clamp an answer to the 0–3 response scale; anything else is "unanswered". */
function normalise(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(n) || n < 0 || n > 3) return null;
  return n;
}

/** PHQ-9 severity, published cut-points. */
export function phq9Severity(total: number): Severity {
  if (total <= 4) return "minimal";
  if (total <= 9) return "mild";
  if (total <= 14) return "moderate";
  if (total <= 19) return "moderately_severe";
  return "severe";
}

/** GAD-7 severity, published cut-points. There is no "moderately severe" band. */
export function gad7Severity(total: number): Severity {
  if (total <= 4) return "minimal";
  if (total <= 9) return "mild";
  if (total <= 14) return "moderate";
  return "severe";
}

function score(def: ScreenerDefinition, answers: unknown[]): ScreenerResult {
  let total = 0;
  let answered = 0;
  const values: (number | null)[] = [];
  for (let i = 0; i < def.items.length; i += 1) {
    const v = normalise(answers[i]);
    values.push(v);
    if (v !== null) {
      total += v;
      answered += 1;
    }
  }
  const severity = def.instrument === "phq9" ? phq9Severity(total) : gad7Severity(total);
  // Item 9 is PHQ-9's self-harm item. GAD-7 has no equivalent, so never flags.
  const flagged = def.instrument === "phq9" ? (values[8] ?? 0) > 0 : false;
  return { instrument: def.instrument, total, severity, flagged, answered, items: def.items.length };
}

export function scorePhq9(answers: unknown[]): ScreenerResult {
  return score(PHQ9, answers);
}

export function scoreGad7(answers: unknown[]): ScreenerResult {
  return score(GAD7, answers);
}

export function scoreScreener(instrument: Instrument, answers: unknown[]): ScreenerResult {
  return instrument === "phq9" ? scorePhq9(answers) : scoreGad7(answers);
}

/** `PHQ-9 · 14 · MODERATE` — DESIGN.md's mono score line. Never coloured digits. */
export function scoreLine(result: Pick<ScreenerResult, "instrument" | "total" | "severity">): string {
  return `${SCREENERS[result.instrument].name} · ${result.total} · ${severityLabel(result.severity)}`;
}

export function severityLabel(severity: string): string {
  return severity.replace(/_/g, " ").toUpperCase();
}
