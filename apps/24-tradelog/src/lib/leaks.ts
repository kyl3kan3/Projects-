/**
 * The leak detector. This is the product.
 *
 * Every finding is a **descriptive statistic about the trader's own closed
 * trades**, phrased as a sentence with a dollar figure. Nothing here is advice,
 * a prediction, or a signal, and the language is chosen to keep it that way:
 * findings say what happened ("trades opened after 11:30 are net −$412 over 14
 * trades"), never what to do next.
 *
 * Three rules keep it honest:
 *
 * 1. **Sample-size gates.** A check with fewer than `MIN_SEGMENT` trades in the
 *    segment, or fewer than `MIN_TRADES` closed trades overall, stays silent. It
 *    does not report a weak finding, and it does not report "not enough data" as
 *    a finding either. Astrology with a dollar sign is worse than no product.
 * 2. **The impact is a measured sum, not a projection.** "This costs you $412"
 *    means those trades summed to −$412 in the window examined. It is never an
 *    extrapolation of what the future will cost.
 * 3. **Evidence is always attached.** Every finding carries the trade ids behind
 *    it so "show me the trades" is a real link, and the counterfactual curve is
 *    the same trades removed from the equity curve — not a modelled line.
 */

import { divRound, formatCents, type Cents } from "@/lib/money";
import {
  TIME_BUCKET_MINUTES,
  byOpenTime,
  segmentBySetup,
  segmentByWeekday,
  sumCents,
  tradeOrdinalsByDay,
  type ClosedTrade,
} from "@/lib/analytics";
import { formatHold, formatMinutesOfDay, minutesOfDay, zonedDateKey } from "@/lib/tz";

export type FindingKind =
  | "time_leak"
  | "weekday_leak"
  | "revenge"
  | "winner_cut"
  | "size_drift"
  | "overtrading"
  | "setup_decay";

export interface Finding {
  kind: FindingKind;
  /** The headline sentence. One clause, past tense, with a number in it. */
  statement: string;
  /** The supporting line: the comparison that makes the headline mean something. */
  detail: string;
  /** What the leak summed to, as a positive magnitude of cost. */
  dollarImpactCents: Cents;
  sampleSize: number;
  /** Trades that make up the leak — the evidence list and the counterfactual. */
  tradeIds: string[];
}

/** No finding is issued for an account with fewer closed trades than this. */
export const MIN_TRADES = 20;
/** No finding is issued about a segment smaller than this. */
export const MIN_SEGMENT = 8;

export interface LeakOptions {
  timeZone: string;
  minTrades?: number;
  minSegment?: number;
}

/**
 * Run every check and return findings ordered by dollar impact, largest first.
 * An empty array is a legitimate and common answer.
 */
export function detectLeaks(trades: readonly ClosedTrade[], opts: LeakOptions): Finding[] {
  const minTrades = opts.minTrades ?? MIN_TRADES;
  const minSegment = opts.minSegment ?? MIN_SEGMENT;
  if (trades.length < minTrades) return [];

  const ctx = { trades: byOpenTime(trades), timeZone: opts.timeZone, minSegment };
  const findings = [
    timeOfDayTail(ctx),
    weekdayLeak(ctx),
    revengeTrading(ctx),
    winnerCut(ctx),
    sizeDrift(ctx),
    overtrading(ctx),
    setupDecay(ctx),
  ].filter((f): f is Finding => f !== null);

  findings.sort((a, b) => Number(b.dollarImpactCents - a.dollarImpactCents));
  return findings;
}

interface Ctx {
  trades: ClosedTrade[];
  timeZone: string;
  minSegment: number;
}

const netOf = (trades: readonly ClosedTrade[]): Cents => sumCents(trades.map((t) => t.netPnlCents));
const avgOf = (trades: readonly ClosedTrade[]): Cents =>
  trades.length ? divRound(netOf(trades), BigInt(trades.length)) : 0n;
const idsOf = (trades: readonly ClosedTrade[]): string[] => trades.map((t) => t.id);

/* ------------------------------------------------------------- 1. the clock --- */

/**
 * "Everything after 11:30 is net negative."
 *
 * Searches every 30-minute cutoff for the tail that costs the most, rather than
 * reporting the single worst half-hour: a trader can act on "stop at 11:30",
 * and cannot act on "11:30–12:00 specifically was bad".
 */
function timeOfDayTail(ctx: Ctx): Finding | null {
  const withMinutes = ctx.trades.map((t) => ({
    trade: t,
    minutes: minutesOfDay(t.openedAt, ctx.timeZone),
  }));
  if (!withMinutes.length) return null;

  let best: { cutoff: number; tail: ClosedTrade[] } | null = null;
  const earliest = Math.min(...withMinutes.map((w) => w.minutes));
  const latest = Math.max(...withMinutes.map((w) => w.minutes));
  for (
    let cutoff = Math.floor(earliest / TIME_BUCKET_MINUTES) * TIME_BUCKET_MINUTES + TIME_BUCKET_MINUTES;
    cutoff <= latest;
    cutoff += TIME_BUCKET_MINUTES
  ) {
    const tail = withMinutes.filter((w) => w.minutes >= cutoff).map((w) => w.trade);
    if (tail.length < ctx.minSegment) continue;
    const net = netOf(tail);
    if (net >= 0n) continue;
    // `<=` on a tie deliberately keeps the *later* cutoff. Cutoffs are scanned
    // in ascending order and tails shrink as the cutoff moves out, so a tie
    // means the trades between the two cutoffs summed to zero — and the later
    // cutoff is the narrower, more defensible claim about the same money.
    if (!best || net <= netOf(best.tail)) best = { cutoff, tail };
  }
  if (!best) return null;

  const rest = withMinutes.filter((w) => w.minutes < best!.cutoff).map((w) => w.trade);
  const impact = -netOf(best.tail);
  return {
    kind: "time_leak",
    statement: `Everything you open after ${formatMinutesOfDay(best.cutoff)} loses money.`,
    detail: rest.length
      ? `${best.tail.length} trades from ${formatMinutesOfDay(best.cutoff)} onward net ${formatCents(netOf(best.tail))}, against ${formatCents(netOf(rest), { signed: true })} across the ${rest.length} you opened earlier.`
      : `${best.tail.length} trades from ${formatMinutesOfDay(best.cutoff)} onward net ${formatCents(netOf(best.tail))}.`,
    dollarImpactCents: impact,
    sampleSize: best.tail.length,
    tradeIds: idsOf(worstFirst(best.tail)),
  };
}

/* ----------------------------------------------------------- 2. the weekday --- */

function weekdayLeak(ctx: Ctx): Finding | null {
  const segments = segmentByWeekday(ctx.trades, ctx.timeZone).filter(
    (s) => s.count >= ctx.minSegment && s.netCents < 0n,
  );
  if (!segments.length) return null;
  const worst = segments.reduce((a, b) => (b.netCents < a.netCents ? b : a));
  const others = ctx.trades.filter((t) => !worst.tradeIds.includes(t.id));
  return {
    kind: "weekday_leak",
    statement: `${worst.label}s are your losing day.`,
    detail: `${worst.count} ${worst.label} trades net ${formatCents(worst.netCents)} — an average of ${formatCents(worst.expectancyCents ?? 0n, { signed: true })} a trade, against ${formatCents(avgOf(others), { signed: true })} on every other day.`,
    dollarImpactCents: -worst.netCents,
    sampleSize: worst.count,
    tradeIds: worst.tradeIds,
  };
}

/* -------------------------------------------------------------- 3. revenge --- */

/** A trade opened within this long after a loss closed counts as a follow-up. */
export const REVENGE_WINDOW_SECONDS = 30 * 60;

/**
 * "Your first trade after a loss loses 2.3× your average."
 *
 * Defined precisely: a trade counts if it opened after a losing trade closed,
 * within `REVENGE_WINDOW_SECONDS`, and no other trade opened in between. The
 * comparison group is every trade that is not a follow-up.
 */
function revengeTrading(ctx: Ctx): Finding | null {
  const ordered = ctx.trades;
  const followUps: ClosedTrade[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const candidate = ordered[i];
    // The most recent trade to have closed before this one opened.
    let previous: ClosedTrade | null = null;
    for (let j = 0; j < i; j++) {
      const other = ordered[j];
      if (other.closedAt.getTime() > candidate.openedAt.getTime()) continue;
      if (!previous || other.closedAt.getTime() > previous.closedAt.getTime()) previous = other;
    }
    if (!previous || previous.netPnlCents >= 0n) continue;
    const gapSeconds = (candidate.openedAt.getTime() - previous.closedAt.getTime()) / 1000;
    if (gapSeconds > REVENGE_WINDOW_SECONDS) continue;
    followUps.push(candidate);
  }

  if (followUps.length < ctx.minSegment) return null;
  const followUpIds = new Set(idsOf(followUps));
  const baseline = ordered.filter((t) => !followUpIds.has(t.id));
  if (baseline.length < ctx.minSegment) return null;

  const followAvg = avgOf(followUps);
  const baseAvg = avgOf(baseline);
  if (followAvg >= baseAvg) return null;

  // What the gap between the two averages summed to over the follow-up trades.
  const impact = (baseAvg - followAvg) * BigInt(followUps.length);
  const ratio = describeRatio(followAvg, baseAvg);

  return {
    kind: "revenge",
    statement: `Your next trade after a loss${ratio ? ` ${ratio}` : " is your worst trade"}.`,
    detail: `${followUps.length} trades opened within ${Math.round(REVENGE_WINDOW_SECONDS / 60)} minutes of a loss average ${formatCents(followAvg, { signed: true })}, against ${formatCents(baseAvg, { signed: true })} for your other ${baseline.length}.`,
    dollarImpactCents: impact > 0n ? impact : 0n,
    sampleSize: followUps.length,
    tradeIds: idsOf(worstFirst(followUps)),
  };
}

/**
 * "loses 2.3× your average loss" / "gives up your average gain" — only claims a
 * multiple when both figures share a sign, because −$40 against +$18 is not
 * "2.2× worse", it is a different outcome entirely.
 */
function describeRatio(followAvg: Cents, baseAvg: Cents): string | null {
  if (followAvg < 0n && baseAvg < 0n) {
    const multiple = divRound(followAvg * 100n, baseAvg); // both negative -> positive
    if (multiple <= 100n) return null;
    return `loses ${formatMultiple(multiple)} your average losing trade`;
  }
  if (followAvg < 0n && baseAvg > 0n) return "turns a winning average into a losing one";
  if (followAvg > 0n && baseAvg > 0n) {
    const multiple = divRound(baseAvg * 100n, followAvg);
    if (multiple <= 100n) return null;
    return `earns ${formatMultiple(multiple)} less than your average`;
  }
  return null;
}

function formatMultiple(hundredths: bigint): string {
  const whole = hundredths / 100n;
  const frac = (hundredths % 100n) / 10n;
  return `${whole}.${frac}×`;
}

/* ---------------------------------------------------------- 4. cutting wins --- */

/** Losers must be held at least this much longer than winners to be a finding. */
export const HOLD_ASYMMETRY_THRESHOLD = 1.4;

/**
 * "You hold losers 2.1× longer than winners."
 *
 * The dollar impact is the net of the losing trades that were held longer than
 * the average winner — the money that was sitting in trades past the point at
 * which this trader normally takes a profit. That is a measured sum over real
 * trades, not a simulation of an earlier exit.
 */
function winnerCut(ctx: Ctx): Finding | null {
  const winners = ctx.trades.filter((t) => t.netPnlCents > 0n);
  const losers = ctx.trades.filter((t) => t.netPnlCents < 0n);
  if (winners.length < ctx.minSegment || losers.length < ctx.minSegment) return null;

  const avgWinHold = winners.reduce((a, t) => a + t.holdSeconds, 0) / winners.length;
  const avgLossHold = losers.reduce((a, t) => a + t.holdSeconds, 0) / losers.length;
  if (avgWinHold <= 0) return null;
  const ratio = avgLossHold / avgWinHold;
  if (ratio < HOLD_ASYMMETRY_THRESHOLD) return null;

  const overheld = losers.filter((t) => t.holdSeconds > avgWinHold);
  if (!overheld.length) return null;
  const impact = -netOf(overheld);
  if (impact <= 0n) return null;

  return {
    kind: "winner_cut",
    statement: `You hold losers ${ratio.toFixed(1)}× longer than winners.`,
    detail: `Winners are closed in ${formatHold(Math.round(avgWinHold))} on average; losers run ${formatHold(Math.round(avgLossHold))}. The ${overheld.length} losses you held past ${formatHold(Math.round(avgWinHold))} account for ${formatCents(netOf(overheld))}.`,
    dollarImpactCents: impact,
    sampleSize: overheld.length,
    tradeIds: idsOf(worstFirst(overheld)),
  };
}

/* ------------------------------------------------------------ 5. size drift --- */

/** The fraction of trades, by position cost, treated as "the big ones". */
export const SIZE_TOP_FRACTION = 0.2;

/**
 * "Your biggest positions are your worst positions."
 *
 * Compares the top fifth of trades by cost basis against the rest. Reported
 * only when the big trades are net negative — a trader sizing up into their
 * best setups is not leaking, and saying so would be wrong.
 */
function sizeDrift(ctx: Ctx): Finding | null {
  const sized = ctx.trades.filter((t) => t.positionCostCents > 0n);
  if (sized.length < ctx.minSegment * 2) return null;

  const ordered = [...sized].sort((a, b) => Number(b.positionCostCents - a.positionCostCents));
  const topCount = Math.max(ctx.minSegment, Math.round(sized.length * SIZE_TOP_FRACTION));
  if (topCount >= ordered.length) return null;
  const big = ordered.slice(0, topCount);
  const rest = ordered.slice(topCount);
  if (rest.length < ctx.minSegment) return null;

  const bigNet = netOf(big);
  if (bigNet >= 0n) return null;

  const avgBigCost = divRound(sumCents(big.map((t) => t.positionCostCents)), BigInt(big.length));
  const avgRestCost = divRound(sumCents(rest.map((t) => t.positionCostCents)), BigInt(rest.length));
  const sizeMultiple = avgRestCost > 0n ? divRound(avgBigCost * 100n, avgRestCost) : null;

  return {
    kind: "size_drift",
    statement: "Your largest positions are your losing positions.",
    detail: `The ${big.length} trades where you sized up${sizeMultiple ? ` — ${formatMultiple(sizeMultiple)} your usual position` : ""} net ${formatCents(bigNet)}, while the other ${rest.length} net ${formatCents(netOf(rest), { signed: true })}.`,
    dollarImpactCents: -bigNet,
    sampleSize: big.length,
    tradeIds: idsOf(worstFirst(big)),
  };
}

/* ----------------------------------------------------------- 6. overtrading --- */

/**
 * "Your 4th trade of the day onward is net negative."
 *
 * Searches for the ordinal cutoff whose tail costs the most, so the finding is
 * a rule the trader can hold themselves to.
 */
function overtrading(ctx: Ctx): Finding | null {
  const ordinals = tradeOrdinalsByDay(ctx.trades, ctx.timeZone);
  const maxOrdinal = Math.max(0, ...[...ordinals.values()]);
  if (maxOrdinal < 3) return null;

  let best: { cutoff: number; tail: ClosedTrade[] } | null = null;
  for (let cutoff = 2; cutoff <= maxOrdinal; cutoff++) {
    const tail = ctx.trades.filter((t) => (ordinals.get(t.id) ?? 0) >= cutoff);
    if (tail.length < ctx.minSegment) continue;
    const net = netOf(tail);
    if (net >= 0n) continue;
    if (!best || net < netOf(best.tail)) best = { cutoff, tail };
  }
  if (!best) return null;

  const early = ctx.trades.filter((t) => (ordinals.get(t.id) ?? 0) < best!.cutoff);
  if (early.length < ctx.minSegment) return null;

  const days = new Set(ctx.trades.map((t) => zonedDateKey(t.openedAt, ctx.timeZone))).size;
  return {
    kind: "overtrading",
    statement: `Trade #${best.cutoff} of the day onward is where you give it back.`,
    detail: `Across ${days} trading days, your first ${best.cutoff - 1} trades net ${formatCents(netOf(early), { signed: true })}; the ${best.tail.length} that came after net ${formatCents(netOf(best.tail))}.`,
    dollarImpactCents: -netOf(best.tail),
    sampleSize: best.tail.length,
    tradeIds: idsOf(worstFirst(best.tail)),
  };
}

/* ----------------------------------------------------------- 7. setup decay --- */

function setupDecay(ctx: Ctx): Finding | null {
  const tagged = ctx.trades.filter((t) => t.setupId !== null);
  if (!tagged.length) return null;
  const segments = segmentBySetup(tagged).filter(
    (s) => s.key !== "none" && s.count >= ctx.minSegment && s.netCents < 0n,
  );
  if (!segments.length) return null;
  const worst = segments.reduce((a, b) => (b.netCents < a.netCents ? b : a));
  const others = tagged.filter((t) => t.setupId !== worst.key);

  return {
    kind: "setup_decay",
    statement: `"${worst.label}" has stopped working.`,
    detail:
      `${worst.count} ${worst.label} trades net ${formatCents(worst.netCents)} at a ${formatWinRate(worst.winRatePct)} win rate` +
      (others.length ? `, against ${formatCents(avgOf(others), { signed: true })} a trade across your other setups.` : "."),
    dollarImpactCents: -worst.netCents,
    sampleSize: worst.count,
    tradeIds: worst.tradeIds,
  };
}

function formatWinRate(pct: bigint | null): string {
  if (pct === null) return "—";
  return `${divRound(pct, 100n)}%`;
}

/* ------------------------------------------------------------- shared bits --- */

/** Worst trade first, so the evidence list opens on the most convincing row. */
function worstFirst(trades: readonly ClosedTrade[]): ClosedTrade[] {
  return [...trades].sort((a, b) => Number(a.netPnlCents - b.netPnlCents));
}

/**
 * The counterfactual: the same equity curve with the leak's trades removed.
 *
 * Not a model. The line is literally "what the cumulative total would read if
 * these specific trades were struck out", which is the only version of this
 * chart that can be defended trade by trade.
 */
export function counterfactualNet(trades: readonly ClosedTrade[], finding: Finding): Cents {
  const excluded = new Set(finding.tradeIds);
  return netOf(trades.filter((t) => !excluded.has(t.id)));
}

/** Findings mention money that is already in the past; this is the honest rate. */
export function impactPerMonth(finding: Finding, trades: readonly ClosedTrade[]): Cents | null {
  if (!trades.length) return null;
  const times = trades.map((t) => t.closedAt.getTime());
  const spanDays = (Math.max(...times) - Math.min(...times)) / 86_400_000;
  if (spanDays < 28) return null;
  return divRound(finding.dollarImpactCents * 3_044n, BigInt(Math.round(spanDays * 100)));
}
