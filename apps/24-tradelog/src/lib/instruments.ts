/**
 * Instruments: what a symbol means, and what one point of it is worth.
 *
 * The contract multiplier is the single most dangerous number in this app. Get
 * it wrong and a correct P&L calculation reports a correct-looking figure that
 * is off by 100× (an option) or 50× (an ES future). So multipliers are never
 * inferred from price magnitude or guessed from a symbol's shape — they come
 * from the asset class, or from an explicit table for futures, and an unknown
 * futures root is reported as an import error rather than defaulted to 1.
 */

import { MULT_SCALE, parsePrice, type Mult, type Price } from "@/lib/money";

export type AssetClass = "equity" | "option" | "future" | "crypto";

export const ASSET_CLASSES: readonly AssetClass[] = ["equity", "option", "future", "crypto"];

/* ---------------------------------------------------------------- options --- */

export interface OptionContract {
  underlying: string;
  /** Expiry as YYYYMMDD — a date with no timezone, because that is what it is. */
  expiry: string;
  right: "C" | "P";
  /** Strike in thousandths of a dollar, the OCC convention (185000 = $185.00). */
  strikeMills: number;
}

/**
 * Canonical option symbol: `AAPL|20260116|C|185000`.
 *
 * Not the 21-character OCC string, deliberately: the padded OCC form is
 * ambiguous for underlyings longer than six characters and unreadable in a URL
 * or a log line. This form is unambiguous, sorts sensibly, and round-trips.
 */
export function optionSymbol(c: OptionContract): string {
  return `${c.underlying.toUpperCase()}|${c.expiry}|${c.right}|${c.strikeMills}`;
}

export function parseOptionSymbol(symbol: string): OptionContract | null {
  const parts = symbol.split("|");
  if (parts.length !== 4) return null;
  const [underlying, expiry, right, mills] = parts;
  if (!/^[A-Z.]{1,10}$/.test(underlying)) return null;
  if (!/^\d{8}$/.test(expiry)) return null;
  if (right !== "C" && right !== "P") return null;
  if (!/^\d+$/.test(mills)) return null;
  return { underlying, expiry, right, strikeMills: Number(mills) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "AAPL 16 Jan 26 185C" — the form the journal and execution table show. */
export function formatOptionSymbol(symbol: string): string {
  const c = parseOptionSymbol(symbol);
  if (!c) return symbol;
  const year = c.expiry.slice(2, 4);
  const month = MONTHS[Number(c.expiry.slice(4, 6)) - 1] ?? c.expiry.slice(4, 6);
  const day = String(Number(c.expiry.slice(6, 8)));
  return `${c.underlying} ${day} ${month} ${year} ${formatStrike(c.strikeMills)}${c.right}`;
}

export function formatStrike(strikeMills: number): string {
  const dollars = Math.trunc(strikeMills / 1000);
  const remainder = strikeMills % 1000;
  if (remainder === 0) return String(dollars);
  return `${dollars}.${String(remainder).padStart(3, "0").replace(/0+$/, "")}`;
}

export function strikePrice(strikeMills: number): Price {
  return parsePrice((strikeMills / 1000).toFixed(3));
}

/** Days between two YYYYMMDD expiries — used to tell a vertical from a calendar. */
export function expiryDaysApart(a: string, b: string): number {
  const toDate = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
  return Math.abs(toDate(a) - toDate(b)) / 86_400_000;
}

/* ---------------------------------------------------------------- futures --- */

export interface FuturesSpec {
  root: string;
  name: string;
  /** Dollars per one point of price movement, in thousandths (see `Mult`). */
  multiplierMilli: Mult;
}

/**
 * The futures a retail journal actually sees. Anything outside this table is an
 * import error the user is told about, not a silent multiplier of 1 — see the
 * note at the top of this file.
 */
export const FUTURES: Record<string, FuturesSpec> = {
  ES: { root: "ES", name: "E-mini S&P 500", multiplierMilli: 50_000 },
  MES: { root: "MES", name: "Micro E-mini S&P 500", multiplierMilli: 5_000 },
  NQ: { root: "NQ", name: "E-mini Nasdaq 100", multiplierMilli: 20_000 },
  MNQ: { root: "MNQ", name: "Micro E-mini Nasdaq 100", multiplierMilli: 2_000 },
  YM: { root: "YM", name: "E-mini Dow", multiplierMilli: 5_000 },
  MYM: { root: "MYM", name: "Micro E-mini Dow", multiplierMilli: 500 },  // $0.5 a point
  RTY: { root: "RTY", name: "E-mini Russell 2000", multiplierMilli: 50_000 },
  M2K: { root: "M2K", name: "Micro E-mini Russell 2000", multiplierMilli: 5_000 },
  CL: { root: "CL", name: "Crude Oil", multiplierMilli: 1_000_000 },
  MCL: { root: "MCL", name: "Micro Crude Oil", multiplierMilli: 100_000 },
  GC: { root: "GC", name: "Gold", multiplierMilli: 100_000 },
  MGC: { root: "MGC", name: "Micro Gold", multiplierMilli: 10_000 },
  SI: { root: "SI", name: "Silver", multiplierMilli: 5_000_000 },
  ZB: { root: "ZB", name: "30-Year T-Bond", multiplierMilli: 1_000_000 },
  ZN: { root: "ZN", name: "10-Year T-Note", multiplierMilli: 1_000_000 },
  ZC: { root: "ZC", name: "Corn", multiplierMilli: 50_000 },
  NG: { root: "NG", name: "Natural Gas", multiplierMilli: 10_000_000 },
};

const MONTH_CODES = "FGHJKMNQUVXZ";

/**
 * Split a futures symbol into its root and contract month.
 * `MESZ5` / `MESZ25` / `MES 12-25` / `/MESZ25` all resolve to root `MES`.
 */
export function parseFuturesSymbol(raw: string): { root: string; contract: string } | null {
  const s = raw.trim().toUpperCase().replace(/^\//, "");
  // Root + month code + 1-2 digit year, e.g. MESZ5 or ESH26.
  const coded = /^([A-Z0-9]{1,4})([FGHJKMNQUVXZ])(\d{1,2})$/.exec(s);
  if (coded && MONTH_CODES.includes(coded[2])) {
    return { root: coded[1], contract: `${coded[2]}${coded[3]}` };
  }
  // Root + " MM-YY" (Tradovate's display form).
  const dashed = /^([A-Z0-9]{1,4})\s*(\d{2})-(\d{2})$/.exec(s);
  if (dashed) return { root: dashed[1], contract: `${dashed[2]}-${dashed[3]}` };
  // A bare root (continuous contract).
  if (/^[A-Z0-9]{1,4}$/.test(s)) return { root: s, contract: "" };
  return null;
}

export function futuresSpec(raw: string): FuturesSpec | null {
  const parsed = parseFuturesSymbol(raw);
  if (!parsed) return null;
  return FUTURES[parsed.root] ?? null;
}

/* ------------------------------------------------------------- multiplier --- */

/**
 * The contract multiplier (in thousandths) for a symbol, or null when it cannot
 * be established. Callers must treat null as an error — never as 1.
 */
export function multiplierFor(assetClass: AssetClass, symbol: string): Mult | null {
  switch (assetClass) {
    case "equity":
    case "crypto":
      return 1 * MULT_SCALE;
    case "option":
      // Standard listed equity options are 100 shares. Non-standard deliverables
      // (post-split adjusted contracts) exist and are out of MVP scope; the
      // importer records the multiplier per execution so they can be corrected.
      return 100 * MULT_SCALE;
    case "future": {
      const spec = futuresSpec(symbol);
      return spec ? spec.multiplierMilli : null;
    }
  }
}

/** How a symbol is displayed in the journal, per asset class. */
export function displaySymbol(assetClass: AssetClass, symbol: string): string {
  if (assetClass === "option") return formatOptionSymbol(symbol);
  return symbol;
}

/** The thing a trader thinks of as "the ticker" — used for grouping option legs. */
export function underlyingOf(assetClass: AssetClass, symbol: string): string {
  if (assetClass === "option") return parseOptionSymbol(symbol)?.underlying ?? symbol;
  if (assetClass === "future") return parseFuturesSymbol(symbol)?.root ?? symbol;
  return symbol;
}
