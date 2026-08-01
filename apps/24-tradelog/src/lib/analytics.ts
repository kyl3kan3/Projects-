/**
 * The analytics engine: the numbers on the truth dashboard.
 *
 * Every definition here is a choice, and a journal that hides its choices is
 * useless for reconciliation, so each one is stated:
 *
 * - **Win rate** = winners ÷ closed trades. Scratches (exactly zero net) sit in
 *   the denominator and in neither numerator, which is why win rate and loss
 *   rate need not add to 100%. Scratches are reported separately rather than
 *   quietly dropped.
 * - **Profit factor** = gross profit ÷ gross loss, both net of fees, both taken
 *   as magnitudes. Undefined (not infinite, not zero) when there are no losses.
 * - **Expectancy** = total net ÷ closed trades. The average trade, in dollars,
 *   after fees. Not an R-expectancy: most trades arrive without a stop, and an
 *   R-expectancy over the subset that has one is a different population.
 * - **Max drawdown** = the largest peak-to-trough fall of the cumulative net
 *   curve, ordered by close time, reported as a positive magnitude. It is a
 *   drawdown of *realised trade P&L*, not of account equity — TradeLog does not
 *   see deposits, so it must not claim to know account equity.
 * - **All P&L is net of fees.** A gross-P&L journal flatters every scalper.
 *
 * Arithmetic is integer cents throughout (see money.ts). Averages and ratios
 * divide, and each division rounds half away from zero exactly once.
 *
 * These run in TypeScript over the account's closed trades rather than as SQL
 * window functions: a retail trader's history is thousands of rows, not
 * millions, and the whole engine being unit-testable against hand-checked
 * fixtures is worth more here than the query plan.
 */

import { divRound, type Cents } from "@/lib/money";
import type { AssetClass } from "@/lib/instruments";
import type { Direction } from "@/lib/matcher";
import { minutesOfDay, zonedDateKey, zonedParts } from "@/lib/tz";

/** The projection of a closed trade that every statistic is computed from. */
export interface ClosedTrade {
  id: string;
  symbol: string;
  displaySymbol: string;
  assetClass: AssetClass;
  direction: Direction;
  openedAt: Date;
  closedAt: Date;
  netPnlCents: Cents;
  feesCents: Cents;
  /** Scaled by 1e4; null when no stop was recorded. */
  rMultiple: bigint | null;
  holdSeconds: number;
  /** Cost basis of the position at its largest, in cents — the size measure. */
  positionCostCents: Cents;
  setupId: string | null;
  setupName: string | null;
}

export interface Summary {
  closedCount: number;
  winners: number;
  losers: number;
  scratches: number;
  netCents: Cents;
  grossProfitCents: Cents;
  grossLossCents: Cents;
  feesCents: Cents;
  /** Scaled by 1e2 (5400 = 54%). */
  winRatePct: bigint | null;
  /** Scaled by 1e4 (16_200 = 1.62). Null when there are no losses to divide by. */
  profitFactor: bigint | null;
  expectancyCents: Cents | null;
  avgWinCents: Cents | null;
  avgLossCents: Cents | null;
  largestWinCents: Cents | null;
  largestLossCents: Cents | null;
  maxDrawdownCents: Cents;
  /** Seconds; null when there are none of that outcome. */
  avgHoldWinnersSeconds: number | null;
  avgHoldLosersSeconds: number | null;
  /** Scaled by 1e4; averaged over trades that recorded a stop. */
  avgRMultiple: bigint | null;
  rSampleSize: number;
}

export function sumCents(values: Iterable<Cents>): Cents {
  let total = 0n;
  for (const v of values) total += v;
  return total;
}

const avgCents = (values: readonly Cents[]): Cents | null =>
  values.length ? divRound(sumCents(values), BigInt(values.length)) : null;

export function summarize(trades: readonly ClosedTrade[]): Summary {
  const winners = trades.filter((t) => t.netPnlCents > 0n);
  const losers = trades.filter((t) => t.netPnlCents < 0n);
  const scratches = trades.length - winners.length - losers.length;

  const grossProfit = sumCents(winners.map((t) => t.netPnlCents));
  const grossLoss = -sumCents(losers.map((t) => t.netPnlCents)); // magnitude
  const net = grossProfit - grossLoss;

  const holdAvg = (subset: readonly ClosedTrade[]): number | null =>
    subset.length ? Math.round(subset.reduce((a, t) => a + t.holdSeconds, 0) / subset.length) : null;

  const withR = trades.filter((t) => t.rMultiple !== null);

  return {
    closedCount: trades.length,
    winners: winners.length,
    losers: losers.length,
    scratches,
    netCents: net,
    grossProfitCents: grossProfit,
    grossLossCents: grossLoss,
    feesCents: sumCents(trades.map((t) => t.feesCents)),
    winRatePct: trades.length
      ? divRound(BigInt(winners.length) * 10_000n, BigInt(trades.length))
      : null,
    profitFactor: grossLoss > 0n ? divRound(grossProfit * 10_000n, grossLoss) : null,
    expectancyCents: trades.length ? divRound(net, BigInt(trades.length)) : null,
    avgWinCents: avgCents(winners.map((t) => t.netPnlCents)),
    avgLossCents: avgCents(losers.map((t) => t.netPnlCents)),
    largestWinCents: winners.length
      ? winners.reduce((m, t) => (t.netPnlCents > m ? t.netPnlCents : m), winners[0].netPnlCents)
      : null,
    largestLossCents: losers.length
      ? losers.reduce((m, t) => (t.netPnlCents < m ? t.netPnlCents : m), losers[0].netPnlCents)
      : null,
    maxDrawdownCents: maxDrawdown(trades),
    avgHoldWinnersSeconds: holdAvg(winners),
    avgHoldLosersSeconds: holdAvg(losers),
    avgRMultiple: withR.length
      ? divRound(
          withR.reduce((a, t) => a + (t.rMultiple ?? 0n), 0n),
          BigInt(withR.length),
        )
      : null,
    rSampleSize: withR.length,
  };
}

/* ------------------------------------------------------- equity & drawdown --- */

export interface EquityPoint {
  /** Close time of the trade that produced this point. */
  at: Date;
  tradeId: string;
  cumulativeCents: Cents;
}

/** Cumulative net P&L, in close order. Starts implicitly at zero. */
export function equityCurve(trades: readonly ClosedTrade[]): EquityPoint[] {
  const points: EquityPoint[] = [];
  let running = 0n;
  for (const trade of byCloseTime(trades)) {
    running += trade.netPnlCents;
    points.push({ at: trade.closedAt, tradeId: trade.id, cumulativeCents: running });
  }
  return points;
}

/**
 * Largest peak-to-trough fall of the cumulative curve, as a positive magnitude.
 * The peak starts at zero, so a first trade that loses money is already a
 * drawdown — which is how it feels.
 */
export function maxDrawdown(trades: readonly ClosedTrade[]): Cents {
  let running = 0n;
  let peak = 0n;
  let worst = 0n;
  for (const trade of byCloseTime(trades)) {
    running += trade.netPnlCents;
    if (running > peak) peak = running;
    const fall = peak - running;
    if (fall > worst) worst = fall;
  }
  return worst;
}

export function byCloseTime(trades: readonly ClosedTrade[]): ClosedTrade[] {
  return [...trades].sort(
    (a, b) => a.closedAt.getTime() - b.closedAt.getTime() || a.id.localeCompare(b.id),
  );
}

export function byOpenTime(trades: readonly ClosedTrade[]): ClosedTrade[] {
  return [...trades].sort(
    (a, b) => a.openedAt.getTime() - b.openedAt.getTime() || a.id.localeCompare(b.id),
  );
}

/* ---------------------------------------------------------------- segments --- */

export interface Segment {
  key: string;
  label: string;
  count: number;
  netCents: Cents;
  winners: number;
  losers: number;
  /** Scaled by 1e2. */
  winRatePct: bigint | null;
  expectancyCents: Cents | null;
  tradeIds: string[];
}

/** Group trades by an arbitrary key and compute the per-group figures. */
export function segmentBy(
  trades: readonly ClosedTrade[],
  keyOf: (t: ClosedTrade) => { key: string; label: string } | null,
): Segment[] {
  const buckets = new Map<string, { label: string; trades: ClosedTrade[] }>();
  for (const trade of byOpenTime(trades)) {
    const k = keyOf(trade);
    if (!k) continue;
    const bucket = buckets.get(k.key);
    if (bucket) bucket.trades.push(trade);
    else buckets.set(k.key, { label: k.label, trades: [trade] });
  }
  return [...buckets.entries()].map(([key, { label, trades: group }]) => {
    const winners = group.filter((t) => t.netPnlCents > 0n).length;
    const losers = group.filter((t) => t.netPnlCents < 0n).length;
    const net = sumCents(group.map((t) => t.netPnlCents));
    return {
      key,
      label,
      count: group.length,
      netCents: net,
      winners,
      losers,
      winRatePct: group.length ? divRound(BigInt(winners) * 10_000n, BigInt(group.length)) : null,
      expectancyCents: group.length ? divRound(net, BigInt(group.length)) : null,
      tradeIds: group.map((t) => t.id),
    };
  });
}

/** 30-minute buckets of the local session, keyed by minutes past midnight. */
export const TIME_BUCKET_MINUTES = 30;

export function bucketLabel(startMinutes: number): string {
  const hh = (m: number) =>
    `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return `${hh(startMinutes)}–${hh(startMinutes + TIME_BUCKET_MINUTES)}`;
}

export function segmentByTimeOfDay(trades: readonly ClosedTrade[], timeZone: string): Segment[] {
  return segmentBy(trades, (t) => {
    const bucket =
      Math.floor(minutesOfDay(t.openedAt, timeZone) / TIME_BUCKET_MINUTES) * TIME_BUCKET_MINUTES;
    return { key: String(bucket), label: bucketLabel(bucket) };
  }).sort((a, b) => Number(a.key) - Number(b.key));
}

const WEEKDAY_LABEL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function segmentByWeekday(trades: readonly ClosedTrade[], timeZone: string): Segment[] {
  return segmentBy(trades, (t) => {
    const weekday = zonedParts(t.openedAt, timeZone).weekday;
    return { key: String(weekday), label: WEEKDAY_LABEL[weekday] };
  }).sort((a, b) => Number(a.key) - Number(b.key));
}

export function segmentBySetup(trades: readonly ClosedTrade[]): Segment[] {
  return segmentBy(trades, (t) =>
    t.setupId
      ? { key: t.setupId, label: t.setupName ?? "Setup" }
      : { key: "none", label: "No setup tagged" },
  ).sort((a, b) => Number(b.netCents - a.netCents));
}

export function segmentBySymbol(trades: readonly ClosedTrade[]): Segment[] {
  return segmentBy(trades, (t) => ({ key: t.symbol, label: t.displaySymbol })).sort((a, b) =>
    Number(b.netCents - a.netCents),
  );
}

/** Hold-time buckets, chosen to separate a scalp from a swing. */
export const HOLD_BUCKETS: readonly { max: number; label: string }[] = [
  { max: 60, label: "Under 1 min" },
  { max: 300, label: "1–5 min" },
  { max: 1_800, label: "5–30 min" },
  { max: 7_200, label: "30 min – 2 hr" },
  { max: 23_400, label: "2 hr – session" },
  { max: Number.MAX_SAFE_INTEGER, label: "Overnight or longer" },
];

export function segmentByHoldTime(trades: readonly ClosedTrade[]): Segment[] {
  return segmentBy(trades, (t) => {
    const index = HOLD_BUCKETS.findIndex((b) => t.holdSeconds < b.max);
    const i = index === -1 ? HOLD_BUCKETS.length - 1 : index;
    return { key: String(i), label: HOLD_BUCKETS[i].label };
  }).sort((a, b) => Number(a.key) - Number(b.key));
}

/* ---------------------------------------------------------------- calendar --- */

export interface CalendarDay {
  /** "YYYY-MM-DD" in the trader's timezone. */
  date: string;
  netCents: Cents;
  count: number;
  tradeIds: string[];
}

/** Daily aggregation for the heatmap, keyed on the trade's *close* date. */
export function dailyPnl(
  trades: readonly ClosedTrade[],
  timeZone: string,
): Map<string, CalendarDay> {
  const days = new Map<string, CalendarDay>();
  for (const trade of byCloseTime(trades)) {
    const date = zonedDateKey(trade.closedAt, timeZone);
    const day = days.get(date);
    if (day) {
      day.netCents += trade.netPnlCents;
      day.count += 1;
      day.tradeIds.push(trade.id);
    } else {
      days.set(date, { date, netCents: trade.netPnlCents, count: 1, tradeIds: [trade.id] });
    }
  }
  return days;
}

/** Index of each trade within its local trading day, 1-based, in open order. */
export function tradeOrdinalsByDay(
  trades: readonly ClosedTrade[],
  timeZone: string,
): Map<string, number> {
  const counters = new Map<string, number>();
  const ordinals = new Map<string, number>();
  for (const trade of byOpenTime(trades)) {
    const date = zonedDateKey(trade.openedAt, timeZone);
    const next = (counters.get(date) ?? 0) + 1;
    counters.set(date, next);
    ordinals.set(trade.id, next);
  }
  return ordinals;
}
