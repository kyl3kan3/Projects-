/**
 * Options multi-leg grouping (v1).
 *
 * A vertical spread reaches the importer as two independent option symbols, and
 * matched independently they are two trades — which is correct bookkeeping and
 * useless reading. This groups legs that were clearly opened as one position and
 * names the shape, so the journal can show "AAPL call vertical, −$140" above the
 * two rows instead of two orphans.
 *
 * The grouping rule is deliberately conservative: same underlying, both options,
 * opened inside a short window. It will not group a spread that was legged in
 * ten minutes apart, and that is the right failure — inventing a spread that the
 * trader did not intend is worse than showing two legs.
 *
 * Each leg keeps its own P&L. The group total is the sum of its legs; no
 * separate arithmetic happens here, so there is nothing here that can disagree
 * with the trade rows.
 */

import { parseOptionSymbol, type OptionContract } from "@/lib/instruments";
import type { Direction } from "@/lib/matcher";

export interface LegLike {
  /** Any stable identifier — the DB id, or an index during import. */
  id: string;
  symbol: string;
  assetClass: string;
  direction: Direction;
  openedAt: Date;
}

export interface LegGroup<T extends LegLike> {
  key: string;
  underlying: string;
  strategy: string;
  legs: T[];
}

/** Default window: legs of one spread land within a couple of minutes. */
export const LEG_WINDOW_SECONDS = 120;

/**
 * Group option trades into strategies. Non-option trades and lone option legs
 * are returned as single-leg groups so callers can iterate one list.
 */
export function groupLegs<T extends LegLike>(
  trades: readonly T[],
  windowSeconds = LEG_WINDOW_SECONDS,
): LegGroup<T>[] {
  const options = trades.filter((t) => t.assetClass === "option");
  const others = trades.filter((t) => t.assetClass !== "option");

  const byUnderlying = new Map<string, T[]>();
  for (const trade of options) {
    const contract = parseOptionSymbol(trade.symbol);
    const underlying = contract?.underlying ?? trade.symbol;
    const bucket = byUnderlying.get(underlying);
    if (bucket) bucket.push(trade);
    else byUnderlying.set(underlying, [trade]);
  }

  const groups: LegGroup<T>[] = [];

  for (const [underlying, bucket] of byUnderlying) {
    bucket.sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime() || a.id.localeCompare(b.id));
    let open: T[] = [];
    let anchor = 0;
    const flush = () => {
      if (!open.length) return;
      groups.push({
        key: open.map((l) => l.id).join("+"),
        underlying,
        strategy: describeStrategy(open),
        legs: open,
      });
      open = [];
    };
    for (const trade of bucket) {
      const t = trade.openedAt.getTime();
      if (open.length && t - anchor > windowSeconds * 1000) flush();
      if (!open.length) anchor = t;
      open.push(trade);
    }
    flush();
  }

  for (const trade of others) {
    groups.push({
      key: trade.id,
      underlying: trade.symbol,
      strategy: "",
      legs: [trade],
    });
  }

  groups.sort((a, b) => a.legs[0].openedAt.getTime() - b.legs[0].openedAt.getTime());
  return groups;
}

interface Parsed {
  contract: OptionContract;
  direction: Direction;
}

/**
 * Name the shape of a set of option legs. Only the structures a retail trader
 * actually puts on get a name; anything else is reported honestly as
 * "4-leg position" rather than guessed at.
 */
export function describeStrategy(legs: readonly LegLike[]): string {
  const parsed: Parsed[] = [];
  for (const leg of legs) {
    const contract = parseOptionSymbol(leg.symbol);
    if (!contract) return legs.length === 1 ? "" : `${legs.length}-leg position`;
    parsed.push({ contract, direction: leg.direction });
  }
  if (parsed.length === 0) return "";

  if (parsed.length === 1) {
    const { contract, direction } = parsed[0];
    const right = contract.right === "C" ? "call" : "put";
    return `${direction === "long" ? "Long" : "Short"} ${right}`;
  }

  const rights = new Set(parsed.map((p) => p.contract.right));
  const strikes = new Set(parsed.map((p) => p.contract.strikeMills));
  const expiries = new Set(parsed.map((p) => p.contract.expiry));
  const directions = new Set(parsed.map((p) => p.direction));
  const longs = parsed.filter((p) => p.direction === "long").length;
  const shorts = parsed.length - longs;

  if (parsed.length === 2) {
    if (rights.size === 1 && expiries.size === 1 && strikes.size === 2 && directions.size === 2) {
      return rights.has("C") ? "Call vertical" : "Put vertical";
    }
    if (rights.size === 1 && strikes.size === 1 && expiries.size === 2 && directions.size === 2) {
      return "Calendar spread";
    }
    if (rights.size === 1 && strikes.size === 2 && expiries.size === 2 && directions.size === 2) {
      return "Diagonal spread";
    }
    if (rights.size === 2 && expiries.size === 1 && directions.size === 1) {
      return strikes.size === 1 ? "Straddle" : "Strangle";
    }
  }

  if (parsed.length === 4 && expiries.size === 1 && longs === 2 && shorts === 2 && rights.size === 2) {
    const calls = parsed.filter((p) => p.contract.right === "C");
    const puts = parsed.filter((p) => p.contract.right === "P");
    if (calls.length === 2 && puts.length === 2) {
      const shortStrikes = new Set(
        parsed.filter((p) => p.direction === "short").map((p) => p.contract.strikeMills),
      );
      return shortStrikes.size === 1 ? "Iron butterfly" : "Iron condor";
    }
  }

  return `${parsed.length}-leg position`;
}
