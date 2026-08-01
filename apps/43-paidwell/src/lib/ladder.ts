/**
 * The escalation ladder. Pure functions, no database, no clock of its own.
 *
 * This is the module the product lives or dies on, and it is written against two
 * opposite failure modes that both look fine in a green build:
 *
 *  1. **The ladder that never stops.** "Overdue" never becomes false, so a daily
 *     sweep that asks "is this invoice overdue?" mails the same client every
 *     morning until one of them dies. The fix is structural: a rung is pinned to
 *     a *fixed distance from the due date*, so it is a point on the calendar, not
 *     a condition. Once every rung is behind us the ladder is finished and the
 *     invoice goes quiet — for good.
 *
 *  2. **The ladder that goes silent.** Selecting the loosest crossed threshold
 *     ("more than 3 days late") fires rung one and then, because that predicate
 *     is still true tomorrow and the invoice is "already reminded", nothing ever
 *     fires again. The fix is to select the *tightest* crossed rung — the most
 *     escalated one whose date has arrived — and to require it to be strictly
 *     above the highest rung already committed. That makes progress monotonic:
 *     each sweep either advances the ladder or does nothing.
 *
 * Dedupe belongs in the database, not here: `messages` carries a unique index on
 * (sequence_run_id, step_index), so even two sweeps racing can only produce one
 * send per rung. This file decides *which* rung; Postgres guarantees *once*.
 *
 * A skipped rung is skipped for good. If the sweep has not run for a fortnight
 * and the invoice is 24 days late, the honest thing to send is the final notice,
 * not a "just a friendly heads-up, this is due in three days" about a deadline
 * that passed three weeks ago.
 */

import type { EscalationLevel, InvoiceStatus, SequenceStep } from "@/db/schema";
import { addDays, daysFromDue, formatStamp, type IsoDate } from "@/lib/dates";

/** The conservative default: a heads-up before due, then three after. */
export const DEFAULT_LADDER: SequenceStep[] = [
  { offsetDaysFromDue: -3, escalationLevel: 1 },
  { offsetDaysFromDue: 3, escalationLevel: 2 },
  { offsetDaysFromDue: 10, escalationLevel: 3 },
  { offsetDaysFromDue: 21, escalationLevel: 4 },
];

export const MAX_RUNGS = 6;

export const LEVEL_LABEL: Record<EscalationLevel, string> = {
  1: "Heads-up",
  2: "Gentle",
  3: "Firm",
  4: "Final",
};

/** "DUE −3D" / "DUE +10D" — the mono label on a step card. */
export function offsetLabel(offsetDaysFromDue: number): string {
  if (offsetDaysFromDue === 0) return "ON DUE DATE";
  const sign = offsetDaysFromDue < 0 ? "−" : "+";
  return `DUE ${sign}${Math.abs(offsetDaysFromDue)}D`;
}

/**
 * Clean a ladder the firm edited: sorted by offset, strictly increasing (so two
 * rungs can never collapse onto one day and make one of them unreachable),
 * escalation levels non-decreasing, at most MAX_RUNGS rungs.
 *
 * Deliberately forgiving rather than rejecting: a ladder saved as 10/3/21 through
 * a future API must still escalate correctly, not silently strand its middle rung.
 */
export function normalizeLadder(steps: readonly SequenceStep[]): SequenceStep[] {
  const cleaned = steps
    .filter((s) => s && Number.isFinite(Number(s.offsetDaysFromDue)))
    .map((s) => ({
      offsetDaysFromDue: Math.round(Number(s.offsetDaysFromDue)),
      escalationLevel: clampLevel(s.escalationLevel),
      subject: s.subject?.trim() ? s.subject.trim() : undefined,
      body: s.body?.trim() ? s.body.trim() : undefined,
    }))
    .sort((a, b) => a.offsetDaysFromDue - b.offsetDaysFromDue)
    .slice(0, MAX_RUNGS);

  const out: SequenceStep[] = [];
  let previousOffset = Number.NEGATIVE_INFINITY;
  let previousLevel: EscalationLevel = 1;
  for (const step of cleaned) {
    const offset = previousOffset === Number.NEGATIVE_INFINITY
      ? step.offsetDaysFromDue
      : Math.max(step.offsetDaysFromDue, previousOffset + 1);
    const level = (Math.max(step.escalationLevel, previousLevel) as EscalationLevel);
    out.push({ ...step, offsetDaysFromDue: offset, escalationLevel: level });
    previousOffset = offset;
    previousLevel = level;
  }
  return out.length ? out : DEFAULT_LADDER.map((s) => ({ ...s }));
}

function clampLevel(value: unknown): EscalationLevel {
  const n = Math.round(Number(value) || 1);
  if (n <= 1) return 1;
  if (n >= 4) return 4;
  return n as EscalationLevel;
}

/* ------------------------------------------------------------- selection --- */

export interface LadderInvoice {
  dueAt: IsoDate;
  balanceCents: number;
  status: InvoiceStatus;
}

export interface LadderRunState {
  /** Highest rung index already committed; -1 = the ladder has not started. */
  highestStepSent: number;
  /** True while a reply is waiting for a human. */
  pausedByReply: boolean;
  /** True while an unresolved promise-to-pay covers this invoice. */
  hasOpenPromise: boolean;
  /**
   * Set by the promise watcher when a promise is broken: the ladder may advance
   * one rung immediately rather than waiting for the next fixed offset.
   */
  escalateAfterBrokenPromise: boolean;
  stopped: boolean;
}

export type LadderHold =
  | "firm_paused"
  | "settled"
  | "written_off"
  | "disputed"
  | "vip"
  | "stopped"
  | "paused_reply"
  | "open_promise"
  | "before_first_rung"
  | "waiting_for_next_rung"
  | "ladder_complete";

export type LadderDecision =
  | {
      action: "send";
      stepIndex: number;
      step: SequenceStep;
      /** True when this send exists because a promise was broken. */
      promiseAware: boolean;
      /** The rung is the last one: after this the ladder is finished. */
      isFinalRung: boolean;
    }
  | { action: "hold"; reason: LadderHold };

export interface LadderContext {
  ladder: readonly SequenceStep[];
  invoice: LadderInvoice;
  run: LadderRunState;
  /** VIP clients are surfaced to a human, never chased by the machine. */
  clientVip: boolean;
  /** The firm-wide kill switch. */
  firmPaused: boolean;
  asOf: IsoDate;
}

/**
 * The one decision: which rung, if any, goes out for this invoice right now.
 *
 * Order matters. The money is checked before anything else, because the single
 * unforgivable bug in this product is chasing an invoice that has been paid.
 */
export function decideNextRung(ctx: LadderContext): LadderDecision {
  const { invoice, run } = ctx;
  const ladder = normalizeLadder(ctx.ladder);

  // Money first, and from the balance rather than the status column: a sweep
  // that runs before the status cache is reconciled must still stay quiet.
  if (invoice.balanceCents <= 0 || invoice.status === "paid") {
    return { action: "hold", reason: "settled" };
  }
  if (invoice.status === "written_off") return { action: "hold", reason: "written_off" };
  if (invoice.status === "disputed") return { action: "hold", reason: "disputed" };
  if (run.stopped) return { action: "hold", reason: "stopped" };
  if (ctx.firmPaused) return { action: "hold", reason: "firm_paused" };
  if (ctx.clientVip) return { action: "hold", reason: "vip" };
  if (run.pausedByReply) return { action: "hold", reason: "paused_reply" };
  if (run.hasOpenPromise) return { action: "hold", reason: "open_promise" };

  const highestSent = Math.max(-1, Math.floor(run.highestStepSent));
  if (highestSent >= ladder.length - 1) {
    return { action: "hold", reason: "ladder_complete" };
  }

  const delta = daysFromDue(invoice.dueAt, ctx.asOf);

  // The TIGHTEST crossed rung: the last one whose fixed date has arrived.
  let crossed = -1;
  for (let i = 0; i < ladder.length; i++) {
    if (delta >= ladder[i].offsetDaysFromDue) crossed = i;
  }

  // A broken promise earns exactly one immediate step up, with its own copy.
  const forced = run.escalateAfterBrokenPromise ? highestSent + 1 : -1;
  const candidate = Math.min(Math.max(crossed, forced), ladder.length - 1);

  if (candidate < 0) return { action: "hold", reason: "before_first_rung" };
  if (candidate <= highestSent) return { action: "hold", reason: "waiting_for_next_rung" };

  return {
    action: "send",
    stepIndex: candidate,
    step: ladder[candidate],
    // If they gave us a date and missed it, the next message must say so —
    // whether or not the next rung's own date had arrived anyway. Sending a
    // generic nudge to someone who told you Friday is how a firm loses its
    // credibility, and the fixed calendar is not a reason to forget the
    // conversation.
    promiseAware: run.escalateAfterBrokenPromise,
    isFinalRung: candidate === ladder.length - 1,
  };
}

/* --------------------------------------------------------------- display --- */

/** The fixed calendar date a rung is due for a given invoice. */
export function rungDate(dueAt: IsoDate, step: SequenceStep): IsoDate {
  return addDays(dueAt, step.offsetDaysFromDue);
}

/**
 * When the next rung falls due, or null when the ladder is finished. Used to
 * fill `sequence_runs.next_send_on`, which is a derived convenience — never the
 * authority. The authority is always `decideNextRung`.
 */
export function nextRungDate(
  ladder: readonly SequenceStep[],
  dueAt: IsoDate,
  highestStepSent: number,
): IsoDate | null {
  const steps = normalizeLadder(ladder);
  const next = steps[Math.max(-1, Math.floor(highestStepSent)) + 1];
  return next ? rungDate(dueAt, next) : null;
}

export interface LadderStatusLine {
  /** "step 2 of 4 · next nudge 12 Jul" — the Secondary line on an invoice row. */
  label: string;
  stepsSent: number;
  totalSteps: number;
  nextOn: IsoDate | null;
  hold: LadderHold | null;
}

/**
 * What the ladder is doing, in words, for a row or an invoice screen. Derived
 * from exactly the same decision the sweep makes, so the screen can never claim
 * a nudge is coming that the engine has no intention of sending.
 */
export function ladderStatusLine(ctx: LadderContext): LadderStatusLine {
  const ladder = normalizeLadder(ctx.ladder);
  const stepsSent = Math.max(0, Math.floor(ctx.run.highestStepSent) + 1);
  const decision = decideNextRung(ctx);
  const nextOn = nextRungDate(ladder, ctx.invoice.dueAt, ctx.run.highestStepSent);

  const base = { stepsSent, totalSteps: ladder.length, nextOn };

  if (decision.action === "send") {
    const level = LEVEL_LABEL[decision.step.escalationLevel].toLowerCase();
    return { ...base, label: `${level} nudge due now`, hold: null };
  }

  const holdLabels: Record<LadderHold, string> = {
    firm_paused: "all follow-up paused",
    settled: "settled — sequence stopped",
    written_off: "written off — no follow-up",
    disputed: "disputed — needs a human",
    vip: "VIP — never chased automatically",
    stopped: "sequence stopped",
    paused_reply: "paused — they replied",
    open_promise: "paused — promise to pay",
    before_first_rung: nextOn ? `first nudge ${formatStamp(nextOn)}` : "no ladder configured",
    waiting_for_next_rung: nextOn
      ? `step ${stepsSent}/${ladder.length} · next ${formatStamp(nextOn)}`
      : `step ${stepsSent}/${ladder.length} sent`,
    ladder_complete: `all ${ladder.length} sent · needs a human`,
  };
  return { ...base, label: holdLabels[decision.reason], hold: decision.reason };
}

/**
 * Urgency for the "needs attention" feed: how far up the ladder, then how late.
 * Higher sorts first.
 */
export function urgencyScore(args: {
  daysLate: number;
  stepsSent: number;
  hold: LadderHold | null;
  balanceCents: number;
}): number {
  const holdWeight =
    args.hold === "disputed" || args.hold === "ladder_complete"
      ? 400
      : args.hold === "paused_reply"
        ? 300
        : 0;
  return holdWeight + args.stepsSent * 100 + Math.min(args.daysLate, 365) + args.balanceCents / 1e9;
}
