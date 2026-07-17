/**
 * src/lib/ifta.ts
 *
 * IFTA quarter math: per-jurisdiction miles and gallons, fleet MPG,
 * and the worksheet-shaped export. Honest scope: "your numbers, ready"
 * — not a filing service.
 *
 * TODO:
 * - [ ] quarterSummary(carrierId, year, quarter): per-state { miles,
 *       gallons, amountCents }, fleet MPG (total miles / total gallons),
 *       taxable-gallons column per the IFTA worksheet.
 * - [ ] exportCsv(summary) and exportPdf(summary) (pdf-lib table).
 * - [ ] Gap detection: legs whose states don't connect (TX -> OH with
 *       nothing between) flagged for review, never auto-filled.
 */

export interface QuarterSummary {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  states: Array<{ state: string; miles: number; gallons: number; amountCents: number }>;
  fleetMpg: number;
  gaps: Array<{ fromState: string; toState: string; enteredOn: string }>;
}

export async function quarterSummary(
  carrierId: string,
  year: number,
  quarter: 1 | 2 | 3 | 4,
): Promise<QuarterSummary> {
  throw new Error("Not implemented");
}
