/**
 * The landing page's receipts, computed at build time by the product's own code.
 *
 * MARKETING_PLAYBOOK law 5: receipts, not adjectives, and never fabricated. There
 * are no customers yet, so there are no testimonials, no logos and no usage
 * numbers on the marketing page. What there *is* is dogfood: a broker export
 * written the way a broker writes them, run through the same parser, the same
 * matcher and the same arithmetic the app runs, with the resulting figures printed
 * on the page. Every number below is produced here, at build time, from the CSV
 * text below it — nothing on the landing page is typed in by hand.
 *
 * The demo history is clearly labelled as a demo wherever it appears.
 */

import { thinkorswim } from "@/lib/parsers/thinkorswim";
import { buildTrades, type ExecutionSource } from "@/lib/pipeline";
import { detectLeaks, impactPerMonth, type Finding } from "@/lib/leaks";
import { byCloseTime, summarize, type ClosedTrade, type Summary } from "@/lib/analytics";
import { displaySymbol } from "@/lib/instruments";
import { formatCents, formatPrice, formatQty } from "@/lib/money";
import { zonedClock } from "@/lib/tz";

const TZ = "America/New_York";

/* ------------------------------------------------------- the matching receipt --- */

/**
 * The reversal case, exactly as a ThinkorSwim statement writes it: long 100,
 * then a 150-share sell that closes the long and opens a 50-share short. A
 * matcher that does not split that fill reports one trade and a phantom position.
 */
export const REVERSAL_CSV = `Account Trade History
,Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,PRICE,Net Price,ORDER TYPE,Commission,Fees
,1/13/26 09:31:04,STOCK,BUY,+100,TO OPEN,MSFT,,,STOCK,418.22,418.22,LMT,0.00,1.00
,1/13/26 10:45:12,STOCK,SELL,-150,TO CLOSE,MSFT,,,STOCK,421.75,421.75,LMT,0.00,1.50
,1/13/26 14:02:40,STOCK,BUY,+50,TO CLOSE,MSFT,,,STOCK,419.90,419.90,LMT,0.00,0.50
`;

export interface DemoFill {
  when: string;
  side: string;
  qty: string;
  price: string;
  fees: string;
}

export interface DemoTrade {
  symbol: string;
  direction: string;
  qty: string;
  entry: string;
  exit: string;
  gross: string;
  fees: string;
  net: string;
  sign: number;
}

function sourcesFrom(csv: string): { fills: DemoFill[]; sources: ExecutionSource[] } {
  const parsed = thinkorswim.parse(csv, { timeZone: TZ });
  const fills: DemoFill[] = parsed.executions.map((exec) => ({
    when: zonedClock(exec.executedAt, TZ),
    side: exec.side === "buy" ? "Buy" : "Sell",
    qty: formatQty(exec.qty),
    price: formatPrice(exec.price),
    fees: formatCents(exec.fees / 100_000_000_000_000_000n),
  }));
  const sources: ExecutionSource[] = parsed.executions.map((exec, index) => ({
    id: `demo-${index}`,
    symbol: exec.symbol,
    assetClass: exec.assetClass,
    side: exec.side,
    qty: exec.qty,
    price: exec.price,
    fees: exec.fees,
    executedAt: exec.executedAt,
    multiplierMilli: exec.multiplierMilli,
  }));
  return { fills, sources };
}

export const REVERSAL_DEMO: { fills: DemoFill[]; trades: DemoTrade[] } = (() => {
  const { fills, sources } = sourcesFrom(REVERSAL_CSV);
  const { trades } = buildTrades(sources);
  return {
    fills,
    trades: trades.map((trade) => ({
      symbol: displaySymbol(trade.assetClass, trade.symbol),
      direction: trade.direction === "long" ? "Long" : "Short",
      qty: formatQty(trade.qtyMax),
      entry: formatPrice(trade.avgEntry),
      exit: trade.avgExit === null ? "—" : formatPrice(trade.avgExit),
      gross: formatCents(trade.grossPnlCents, { signed: true }),
      fees: formatCents(trade.feesCents),
      net: formatCents(trade.netPnlCents, { signed: true }),
      sign: trade.netPnlCents > 0n ? 1 : trade.netPnlCents < 0n ? -1 : 0,
    })),
  };
})();

/* ------------------------------------------------------- the hero's leak gap --- */

/**
 * A staged demo history for the hero: a trader who is fine in the morning and
 * gives it back after lunch. The numbers are computed by the leak detector, not
 * chosen — which is the point of showing it at all.
 */
function demoHistory(): ClosedTrade[] {
  const trades: ClosedTrade[] = [];
  const day = (n: number) => 12 + n;
  let id = 0;

  const add = (
    dayIndex: number,
    hour: number,
    minute: number,
    holdMinutes: number,
    dollars: number,
    symbol: string,
  ) => {
    id += 1;
    // 14:xx UTC is 09:xx in New York in January.
    const openedAt = new Date(Date.UTC(2026, 0, day(dayIndex), hour + 5, minute));
    const closedAt = new Date(openedAt.getTime() + holdMinutes * 60_000);
    trades.push({
      id: `d${id}`,
      symbol,
      displaySymbol: symbol,
      assetClass: "equity",
      direction: "long",
      openedAt,
      closedAt,
      netPnlCents: BigInt(Math.round(dollars * 100)),
      feesCents: 130n,
      rMultiple: null,
      holdSeconds: holdMinutes * 60,
      positionCostCents: 2_000_000n,
      setupId: null,
      setupName: null,
    });
  };

  const morning = [182, -96, 240, 168, -74, 315, 126, -88, 204, 152, 96, -62, 288, 174];
  morning.forEach((dollars, i) => add(i % 5, 9, 34 + (i % 3) * 7, 12, dollars, "SPY"));

  const afternoon = [-318, -204, -412, -156, -288, -234, -376, -142, -262, -198];
  afternoon.forEach((dollars, i) => add(i % 5, 14, 12 + (i % 3) * 9, 48, dollars, "TSLA"));

  return trades;
}

export interface HeroDemo {
  summary: Summary;
  finding: Finding;
  monthlyLabel: string | null;
  actual: number[];
  without: number[];
  actualLabel: string;
  withoutLabel: string;
  gapLabel: string;
}

export const HERO_DEMO: HeroDemo = (() => {
  const history = demoHistory();
  const summary = summarize(history);
  const findings = detectLeaks(history, { timeZone: TZ });
  const finding = findings[0];

  const excluded = new Set(finding.tradeIds);
  const actual: number[] = [];
  const without: number[] = [];
  let runningActual = 0n;
  let runningWithout = 0n;
  for (const trade of byCloseTime(history)) {
    runningActual += trade.netPnlCents;
    if (!excluded.has(trade.id)) runningWithout += trade.netPnlCents;
    actual.push(Number(runningActual));
    without.push(Number(runningWithout));
  }

  const monthly = impactPerMonth(finding, history);

  return {
    summary,
    finding,
    monthlyLabel: monthly === null ? null : formatCents(monthly),
    actual,
    without,
    actualLabel: formatCents(BigInt(Math.round(actual[actual.length - 1])), { signed: true }),
    withoutLabel: formatCents(BigInt(Math.round(without[without.length - 1])), { signed: true }),
    gapLabel: formatCents(finding.dollarImpactCents),
  };
})();
