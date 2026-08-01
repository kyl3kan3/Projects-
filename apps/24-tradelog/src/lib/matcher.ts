/**
 * The trade matcher: a stream of executions becomes round-trip trades.
 *
 * This is the file competitors get wrong, so it is worth being explicit about
 * the rules it implements.
 *
 * 1. **One trade per symbol per round trip.** A trade opens when a flat
 *    position becomes non-zero and closes the instant the position returns to
 *    exactly zero. Adds in the same direction are scale-ins and belong to the
 *    open trade; they never start a new one.
 *
 * 2. **FIFO cost basis.** Closing fills are matched against the oldest open
 *    lots first. This matters for a scale-in/scale-out sequence: matching
 *    against the average entry instead of the actual lots gives a different
 *    realised P&L for every partial close, and only the FIFO figure reconciles
 *    with a US brokerage statement. (Average-cost and LIFO are legitimate
 *    accounting choices; they are not what a US 1099-B shows, so they are not
 *    the default and not in MVP scope.)
 *
 * 3. **A fill that flips through zero is split.** Long 100, then sell 150:
 *    100 closes the long trade, 50 opens a short. Treating that as one trade
 *    (or dropping the excess) is the single most common matching bug — it turns
 *    a reversal into a phantom position that never closes.
 *
 * 4. **Fees follow the quantity, and the remainder is not lost.** A split fill
 *    divides its commission pro rata; the last portion receives the exact
 *    remainder so the parts sum to the fill's fee to the last 1e-19 of a dollar.
 *
 * 5. **A trade left open stays open.** It is reported with its remaining
 *    quantity and, when a mark is available, an explicitly-labelled unrealised
 *    figure. Never a fabricated close.
 *
 * All arithmetic is exact fixed-point (see money.ts). The only rounding is at
 * `moneyToCents`, when a caller persists or displays a figure.
 */

import {
  absBig,
  divRound,
  minBig,
  notional,
  weightedAvgPrice,
  type Money,
  type Mult,
  type Price,
  type Qty,
} from "@/lib/money";
import type { AssetClass } from "@/lib/instruments";

export type Side = "buy" | "sell";
export type Direction = "long" | "short";
export type LegRole = "open" | "close";

/** A normalised fill, as every parser produces it. */
export interface ExecutionInput {
  /** Stable identity — the DB id, or the dedupe hash before insert. */
  id: string;
  symbol: string;
  assetClass: AssetClass;
  side: Side;
  /** Always positive. A signed quantity is a bug waiting to happen. */
  qty: Qty;
  price: Price;
  /** Total commission + fees for the fill, positive, exact. */
  fees: Money;
  executedAt: Date;
  /** Contract multiplier in thousandths (see money.ts `Mult`). */
  multiplierMilli: Mult;
  /**
   * Tie-break for fills sharing a timestamp: brokers report to the second, and
   * a scale-out and a scale-in inside the same second must not be reordered.
   * Row order within the source file is the right value.
   */
  seq: number;
}

export interface TradeLeg {
  executionId: string;
  role: LegRole;
  side: Side;
  qty: Qty;
  price: Price;
  fees: Money;
  executedAt: Date;
  seq: number;
}

/** A remaining open lot, kept so unrealised P&L uses real cost basis. */
export interface OpenLot {
  qty: Qty;
  price: Price;
  executedAt: Date;
}

export interface MatchedTrade {
  symbol: string;
  assetClass: AssetClass;
  direction: Direction;
  multiplierMilli: Mult;
  openedAt: Date;
  closedAt: Date | null;
  status: "open" | "closed";
  /** Total quantity opened across every scale-in. */
  qtyOpened: Qty;
  /** Largest absolute position the trade ever held. */
  qtyMax: Qty;
  /** Quantity still open (0 for a closed trade). */
  qtyOpen: Qty;
  /** Volume-weighted average of the opening fills. */
  avgEntry: Price;
  /** Volume-weighted average of the closing fills; null while nothing is closed. */
  avgExit: Price | null;
  /** Realised P&L before fees. */
  grossPnl: Money;
  /** Every fee attached to this trade, including on still-open legs. */
  fees: Money;
  /** grossPnl − fees. The number a trader cares about. */
  netPnl: Money;
  openLots: OpenLot[];
  legs: TradeLeg[];
}

export interface MatchResult {
  trades: MatchedTrade[];
  /**
   * Executions the matcher could not place. With the current rules a fill
   * always opens, closes, or splits, so only a non-positive quantity lands
   * here — but the import report shows the count, so "never silently drop a
   * row" is a property the UI can prove rather than a promise in a comment.
   */
  unmatched: ExecutionInput[];
}

const opposite = (d: Direction): Side => (d === "long" ? "sell" : "buy");
const directionFor = (side: Side): Direction => (side === "buy" ? "long" : "short");

/** Chronological, then by the source file's row order. */
export function sortExecutions(execs: readonly ExecutionInput[]): ExecutionInput[] {
  return [...execs].sort(
    (a, b) =>
      a.executedAt.getTime() - b.executedAt.getTime() || a.seq - b.seq || a.id.localeCompare(b.id),
  );
}

interface Accumulator {
  symbol: string;
  assetClass: AssetClass;
  direction: Direction;
  multiplierMilli: Mult;
  openedAt: Date;
  lots: OpenLot[];
  qtyOpened: Qty;
  qtyOpen: Qty;
  qtyMax: Qty;
  grossPnl: Money;
  fees: Money;
  legs: TradeLeg[];
}

/**
 * Match one symbol's fills. Exported for tests; `matchExecutions` is the entry
 * point callers use.
 */
export function matchSymbol(execs: readonly ExecutionInput[]): MatchedTrade[] {
  const ordered = sortExecutions(execs);
  const trades: MatchedTrade[] = [];
  let current: Accumulator | null = null;

  for (const exec of ordered) {
    let remaining = exec.qty;
    if (remaining <= 0n) continue; // a zero-quantity fill carries no information

    // Fee allocation: pro rata by quantity, with the remainder to the last
    // portion so the parts sum to the whole exactly.
    let feesLeft = exec.fees;
    let qtyLeftForFees = exec.qty;
    const takeFees = (portion: Qty): Money => {
      if (portion >= qtyLeftForFees) {
        const all = feesLeft;
        feesLeft = 0n;
        qtyLeftForFees = 0n;
        return all;
      }
      const share = divRound(feesLeft * portion, qtyLeftForFees);
      feesLeft -= share;
      qtyLeftForFees -= portion;
      return share;
    };

    while (remaining > 0n) {
      if (current === null) {
        current = {
          symbol: exec.symbol,
          assetClass: exec.assetClass,
          direction: directionFor(exec.side),
          multiplierMilli: exec.multiplierMilli,
          openedAt: exec.executedAt,
          lots: [],
          qtyOpened: 0n,
          qtyOpen: 0n,
          qtyMax: 0n,
          grossPnl: 0n,
          fees: 0n,
          legs: [],
        };
      }

      const closing = exec.side === opposite(current.direction);
      const take = closing ? minBig(remaining, current.qtyOpen) : remaining;

      if (closing) {
        current.grossPnl += consumeLots(current, take, exec.price, exec.multiplierMilli);
        current.qtyOpen -= take;
      } else {
        current.lots.push({ qty: take, price: exec.price, executedAt: exec.executedAt });
        current.qtyOpened += take;
        current.qtyOpen += take;
        if (current.qtyOpen > current.qtyMax) current.qtyMax = current.qtyOpen;
      }

      const fees = takeFees(take);
      current.fees += fees;
      current.legs.push({
        executionId: exec.id,
        role: closing ? "close" : "open",
        side: exec.side,
        qty: take,
        price: exec.price,
        fees,
        executedAt: exec.executedAt,
        seq: exec.seq,
      });

      remaining -= take;

      if (closing && current.qtyOpen === 0n) {
        trades.push(finalize(current, exec.executedAt));
        current = null;
        // Any `remaining` here is the flip: the loop opens a fresh trade in the
        // opposite direction with what is left of this fill.
      }
    }
  }

  if (current) trades.push(finalize(current, null));
  return trades;
}

/**
 * Consume `take` quantity from the oldest lots and return the realised gross.
 * `take <= sum(lots.qty)` is guaranteed by the caller's clamp.
 */
function consumeLots(acc: Accumulator, take: Qty, exitPrice: Price, multiplierMilli: Mult): Money {
  let left = take;
  let gross = 0n;
  while (left > 0n && acc.lots.length > 0) {
    const lot = acc.lots[0];
    const used = minBig(left, lot.qty);
    const move = acc.direction === "long" ? exitPrice - lot.price : lot.price - exitPrice;
    gross += notional(used, move, multiplierMilli);
    lot.qty -= used;
    left -= used;
    if (lot.qty === 0n) acc.lots.shift();
  }
  return gross;
}

function finalize(acc: Accumulator, closedAt: Date | null): MatchedTrade {
  const openLegs = acc.legs.filter((l) => l.role === "open");
  const closeLegs = acc.legs.filter((l) => l.role === "close");
  const closed = acc.qtyOpen === 0n && closeLegs.length > 0;
  return {
    symbol: acc.symbol,
    assetClass: acc.assetClass,
    direction: acc.direction,
    multiplierMilli: acc.multiplierMilli,
    openedAt: acc.openedAt,
    closedAt: closed ? closedAt : null,
    status: closed ? "closed" : "open",
    qtyOpened: acc.qtyOpened,
    qtyMax: acc.qtyMax,
    qtyOpen: acc.qtyOpen,
    avgEntry: weightedAvgPrice(openLegs),
    avgExit: closeLegs.length ? weightedAvgPrice(closeLegs) : null,
    grossPnl: acc.grossPnl,
    fees: acc.fees,
    netPnl: acc.grossPnl - acc.fees,
    openLots: acc.lots.map((l) => ({ ...l })),
    legs: acc.legs,
  };
}

/**
 * Match every execution in an account. Fills are grouped by (symbol, asset
 * class) — a position in AAPL stock and a position in an AAPL option are
 * different positions, and matching them together would net one against the
 * other.
 */
export function matchExecutions(execs: readonly ExecutionInput[]): MatchResult {
  const groups = new Map<string, ExecutionInput[]>();
  const unmatched: ExecutionInput[] = [];

  for (const exec of execs) {
    if (exec.qty <= 0n) {
      unmatched.push(exec);
      continue;
    }
    const key = `${exec.assetClass} ${exec.symbol}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(exec);
    else groups.set(key, [exec]);
  }

  const trades: MatchedTrade[] = [];
  for (const bucket of groups.values()) trades.push(...matchSymbol(bucket));

  // Chronological by open, so the equity curve and journal read in order.
  trades.sort(
    (a, b) =>
      a.openedAt.getTime() - b.openedAt.getTime() ||
      (a.closedAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (b.closedAt?.getTime() ?? Number.MAX_SAFE_INTEGER) ||
      a.symbol.localeCompare(b.symbol),
  );
  return { trades, unmatched };
}

/* ------------------------------------------------------- derived measures --- */

/**
 * Unrealised P&L on the still-open portion, against an explicit mark.
 *
 * The mark is always supplied by the caller and always labelled in the UI.
 * TradeLog has no market-data feed at MVP, so inventing a "current price" would
 * be inventing a number — the app marks open positions at the last fill it has
 * seen in the symbol and says so on screen.
 */
export function unrealizedPnl(trade: MatchedTrade, mark: Price): Money {
  let total = 0n;
  for (const lot of trade.openLots) {
    const move = trade.direction === "long" ? mark - lot.price : lot.price - mark;
    total += notional(lot.qty, move, trade.multiplierMilli);
  }
  return total;
}

/**
 * Initial risk: the dollars between the average entry and the stop, over the
 * largest position the trade held (that is what was actually exposed to the
 * stop). `null` when no stop was recorded or the stop sits at the entry — an
 * R-multiple with no denominator is not a small R, it is no R.
 */
export function initialRisk(
  trade: Pick<MatchedTrade, "avgEntry" | "qtyMax" | "multiplierMilli">,
  stop: Price | null,
): Money | null {
  if (stop === null) return null;
  const distance = absBig(trade.avgEntry - stop);
  if (distance === 0n || trade.qtyMax === 0n) return null;
  return notional(trade.qtyMax, distance, trade.multiplierMilli);
}

/**
 * R-multiple, scaled by 1e4 (see money.ts `R_SCALE`). Net of fees, because a
 * trade that only paid for its commissions is not a 1R winner.
 */
export function rMultiple(
  trade: Pick<MatchedTrade, "avgEntry" | "qtyMax" | "multiplierMilli" | "netPnl">,
  stop: Price | null,
): bigint | null {
  const risk = initialRisk(trade, stop);
  if (risk === null || risk === 0n) return null;
  return divRound(trade.netPnl * 10_000n, risk);
}

/** Hold time in whole seconds; null while the trade is open. */
export function holdSeconds(trade: Pick<MatchedTrade, "openedAt" | "closedAt">): number | null {
  if (!trade.closedAt) return null;
  return Math.max(0, Math.round((trade.closedAt.getTime() - trade.openedAt.getTime()) / 1000));
}
