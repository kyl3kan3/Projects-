/**
 * The lien timeline engine — the feature with teeth, as pure date arithmetic.
 *
 * Given a frozen rule pack, the day the tenant went delinquent, and what has
 * already been done, it produces the rail: every statutory step with its due
 * date, its citation, whether it is locked, and the sentence explaining why.
 *
 * Three rules hold, and the tests hold them:
 *
 *  1. **A step whose origin is the prior step counts from the day that step was
 *     actually completed**, falling back to its due date when it has not been.
 *     A waiting period runs from the day the notice went in the mail; an owner
 *     who mails a week late waits a week longer, and the engine must say so
 *     rather than quietly keeping the original sale date.
 *  2. **Nothing is completable early.** Not by a day. The lock is computed from
 *     the calendar, not from a flag someone can flip, and `canComplete` is the
 *     only gate the UI and the server action both consult.
 *  3. **Nothing auto-executes.** The engine computes and documents; the owner
 *     acts. `advanceCase` returns what is *due*, and the only thing it writes is
 *     "this is now the current step".
 */

import type { RulePack, RuleStep } from "@/lib/lien-rules";
import { addDays, compareDates, formatDateLong, type IsoDate } from "@/lib/money";

/** What the database stores per step in `lien_cases.steps_state`. */
export interface StepState {
  dueOn?: IsoDate;
  completedOn?: IsoDate;
  noticeR2Key?: string;
  trackingNumber?: string;
}

export type StepsState = Record<string, StepState>;

export interface TimelineStep {
  key: string;
  label: string;
  citation: string;
  instruction: string;
  requires: RuleStep["requires"];
  /** The earliest date this step may be taken. */
  dueOn: IsoDate;
  completedOn: IsoDate | null;
  trackingNumber: string | null;
  noticeR2Key: string | null;
  /** True when the step may not be completed today. */
  locked: boolean;
  /** Why it is locked, as a sentence with the date and the citation. */
  lockSentence: string | null;
  /** The step the owner should be working on. */
  current: boolean;
}

export interface Timeline {
  steps: TimelineStep[];
  /** The step the owner should be working on, or null when the rail is done. */
  currentStepKey: string | null;
  /** The date the last step becomes available — the sale date. */
  saleEligibleOn: IsoDate;
  /** True once every step is completed. */
  complete: boolean;
  /** Set while any step's date is still in the future. */
  hardStopUntil: IsoDate | null;
}

/**
 * Compute the whole rail. `asOf` decides only what is locked *today*; the dates
 * themselves depend on the pack and on what has been completed, never on now.
 */
export function buildTimeline(
  pack: Pick<RulePack, "steps">,
  delinquentSince: IsoDate,
  state: StepsState,
  asOf: IsoDate,
): Timeline {
  const steps: TimelineStep[] = [];
  let priorAnchor: IsoDate | null = null;
  let blockedByPrior = false;

  for (const rule of pack.steps) {
    const stored = state[rule.key] ?? {};
    const origin = rule.from === "delinquency" ? delinquentSince : (priorAnchor ?? delinquentSince);
    const dueOn = addDays(origin, rule.offsetDays);
    const completedOn = stored.completedOn ?? null;

    // The next step counts from when this one actually happened.
    priorAnchor = completedOn ?? dueOn;

    const tooEarly = compareDates(asOf, dueOn) < 0;
    const locked = !completedOn && (tooEarly || blockedByPrior);

    let lockSentence: string | null = null;
    if (locked && blockedByPrior) {
      lockSentence = `Do not proceed — the step before this one is not recorded as done.`;
    } else if (locked && tooEarly) {
      lockSentence = `${rule.label} not before ${formatDateLong(dueOn)} — ${rule.citation}`;
    }

    steps.push({
      key: rule.key,
      label: rule.label,
      citation: rule.citation,
      instruction: rule.instruction,
      requires: rule.requires,
      dueOn,
      completedOn,
      trackingNumber: stored.trackingNumber ?? null,
      noticeR2Key: stored.noticeR2Key ?? null,
      locked,
      lockSentence,
      current: false,
    });

    if (!completedOn) blockedByPrior = true;
  }

  const currentIndex = steps.findIndex((s) => !s.completedOn);
  if (currentIndex >= 0) steps[currentIndex].current = true;

  const saleEligibleOn = steps.length ? steps[steps.length - 1].dueOn : delinquentSince;
  const nextLocked = steps.find((s) => !s.completedOn && compareDates(asOf, s.dueOn) < 0);

  return {
    steps,
    currentStepKey: currentIndex >= 0 ? steps[currentIndex].key : null,
    saleEligibleOn,
    complete: currentIndex < 0,
    hardStopUntil: nextLocked ? nextLocked.dueOn : null,
  };
}

export interface CompleteCheck {
  ok: boolean
  reason?: string;
}

/**
 * The single gate. The server action calls this before writing and the UI calls
 * it to decide whether the button is disabled — one implementation, so a
 * disabled button and a rejected request can never disagree.
 */
export function canComplete(
  timeline: Timeline,
  stepKey: string,
  asOf: IsoDate,
): CompleteCheck {
  const step = timeline.steps.find((s) => s.key === stepKey);
  if (!step) return { ok: false, reason: `No step "${stepKey}" in this rule version.` };
  if (step.completedOn) {
    return { ok: false, reason: `Already recorded as done on ${formatDateLong(step.completedOn)}.` };
  }
  const index = timeline.steps.indexOf(step);
  const unfinishedBefore = timeline.steps.slice(0, index).find((s) => !s.completedOn);
  if (unfinishedBefore) {
    return {
      ok: false,
      reason: `Do not proceed — "${unfinishedBefore.label}" is not recorded as done.`,
    };
  }
  if (compareDates(asOf, step.dueOn) < 0) {
    return {
      ok: false,
      reason: `${step.label} not before ${formatDateLong(step.dueOn)} — ${step.citation}`,
    };
  }
  return { ok: true };
}

/**
 * Which step, if any, the owner should be looking at today — used by the nightly
 * pass to flag work. It returns a fact, never an action: nothing in UnitKeeper
 * completes a statutory step on the owner's behalf.
 */
export function dueStep(timeline: Timeline, asOf: IsoDate): TimelineStep | null {
  const current = timeline.steps.find((s) => s.current);
  if (!current) return null;
  return canComplete(timeline, current.key, asOf).ok ? current : null;
}

/** The status a case should carry, derived — never a column a cron guesses at. */
export function caseStatus(
  timeline: Timeline,
  asOf: IsoDate,
): "open" | "sale_eligible" | "resolved" {
  if (timeline.complete) return "resolved";
  const last = timeline.steps[timeline.steps.length - 1];
  if (last && !last.completedOn && compareDates(asOf, last.dueOn) >= 0) return "sale_eligible";
  return "open";
}
