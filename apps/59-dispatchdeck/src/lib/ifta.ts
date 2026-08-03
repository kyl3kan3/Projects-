/**
 * src/lib/ifta.ts
 *
 * IFTA quarter maths: per-jurisdiction miles and gallons, fleet MPG, taxable
 * gallons, and the worksheet-shaped export.
 *
 * Honest scope, stated on the screen as well as here: "your numbers, ready".
 * DispatchDeck does not file, does not hold tax rates, and does not compute tax
 * owed — rates change quarterly per jurisdiction and a stale rate table is a
 * penalty. It produces the miles and gallons columns the return asks for, and
 * flags the jurisdictions where the mileage log does not join up.
 *
 * The summary maths is pure (`summariseQuarter`) so it can be tested without a
 * database; `quarterSummary` is the thin query around it.
 */

import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { fuelPurchases, jurisdictionLegs } from "@/db/schema";
import { GALLON_SCALE, mpg } from "@/lib/money";
import { areAdjacent, jurisdictionName, statesBetween } from "@/lib/jurisdictions";

export type Quarter = 1 | 2 | 3 | 4;

export interface LegInput {
  state: string;
  miles: number;
  enteredOn: string;
  truckId: string;
}

export interface FuelInput {
  state: string;
  gallonsMilli: number;
  amountCents: number;
  purchasedOn: string;
  truckId: string;
}

export interface JurisdictionRow {
  state: string;
  name: string;
  miles: number;
  gallonsMilli: number;
  amountCents: number;
  /**
   * Gallons the return treats as consumed in this jurisdiction: miles here at
   * the fleet's own MPG. This is the column carriers get wrong by using each
   * state's local MPG.
   */
  taxableGallonsMilli: number;
  /** Purchased minus taxable: positive means credit, negative means owed. */
  netGallonsMilli: number;
}

export interface MileageGap {
  fromState: string;
  toState: string;
  enteredOn: string;
  /** The jurisdictions a truck must have crossed. Named, never invented. */
  missing: string[];
  note: string;
}

export interface QuarterSummary {
  year: number;
  quarter: Quarter;
  /** yyyy-mm-dd inclusive bounds. */
  from: string;
  to: string;
  states: JurisdictionRow[];
  totalMiles: number;
  totalGallonsMilli: number;
  totalFuelCents: number;
  /** Total miles ÷ total gallons purchased. Null with no fuel recorded. */
  fleetMpg: number | null;
  gaps: MileageGap[];
}

export function quarterBounds(year: number, quarter: Quarter): { from: string; to: string } {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return { from: `${year}-${pad(startMonth)}-01`, to: `${year}-${pad(endMonth)}-${pad(lastDay)}` };
}

export function quarterOf(day: string): { year: number; quarter: Quarter } {
  const [y, m] = day.split("-").map(Number);
  return { year: y, quarter: (Math.floor((m - 1) / 3) + 1) as Quarter };
}

export function currentQuarter(now: Date = new Date()): { year: number; quarter: Quarter } {
  return {
    year: now.getUTCFullYear(),
    quarter: (Math.floor(now.getUTCMonth() / 3) + 1) as Quarter,
  };
}

/** The pure quarter maths. */
export function summariseQuarter(
  year: number,
  quarter: Quarter,
  legs: LegInput[],
  fuel: FuelInput[],
): QuarterSummary {
  const { from, to } = quarterBounds(year, quarter);

  const byState = new Map<string, JurisdictionRow>();
  const row = (state: string): JurisdictionRow => {
    const code = state.toUpperCase();
    let existing = byState.get(code);
    if (!existing) {
      existing = {
        state: code,
        name: jurisdictionName(code),
        miles: 0,
        gallonsMilli: 0,
        amountCents: 0,
        taxableGallonsMilli: 0,
        netGallonsMilli: 0,
      };
      byState.set(code, existing);
    }
    return existing;
  };

  for (const leg of legs) row(leg.state).miles += leg.miles;
  for (const purchase of fuel) {
    const r = row(purchase.state);
    r.gallonsMilli += purchase.gallonsMilli;
    r.amountCents += purchase.amountCents;
  }

  const totalMiles = [...byState.values()].reduce((s, r) => s + r.miles, 0);
  const totalGallonsMilli = [...byState.values()].reduce((s, r) => s + r.gallonsMilli, 0);
  const totalFuelCents = [...byState.values()].reduce((s, r) => s + r.amountCents, 0);
  const fleetMpg = mpg(totalMiles, totalGallonsMilli);

  // Taxable gallons at the FLEET mpg, which is what the return asks for.
  // Rounding is done per jurisdiction and the remainder is pushed onto the
  // largest one, so the column sums to total gallons instead of being off by a
  // few thousandths — a mismatch an auditor asks about.
  if (fleetMpg && fleetMpg > 0) {
    for (const r of byState.values()) {
      r.taxableGallonsMilli = Math.round((r.miles / fleetMpg) * GALLON_SCALE);
    }
    const rows = [...byState.values()];
    const taxableTotal = rows.reduce((s, r) => s + r.taxableGallonsMilli, 0);
    const drift = totalGallonsMilli - taxableTotal;
    if (drift !== 0 && rows.length > 0) {
      const biggest = rows.reduce((a, b) => (b.miles > a.miles ? b : a));
      biggest.taxableGallonsMilli += drift;
    }
  }
  for (const r of byState.values()) {
    r.netGallonsMilli = r.gallonsMilli - r.taxableGallonsMilli;
  }

  const states = [...byState.values()].sort((a, b) => a.state.localeCompare(b.state));

  return {
    year,
    quarter,
    from,
    to,
    states,
    totalMiles,
    totalGallonsMilli,
    totalFuelCents,
    fleetMpg,
    gaps: findGaps(legs),
  };
}

/**
 * Consecutive legs for the same truck whose jurisdictions do not share a
 * border. Sorted by date then by insertion order within a day, because two legs
 * on the same day still happened in an order.
 */
export function findGaps(legs: LegInput[]): MileageGap[] {
  const byTruck = new Map<string, LegInput[]>();
  for (const leg of legs) {
    const list = byTruck.get(leg.truckId) ?? [];
    list.push(leg);
    byTruck.set(leg.truckId, list);
  }
  const gaps: MileageGap[] = [];
  for (const list of byTruck.values()) {
    const ordered = [...list].sort((a, b) => a.enteredOn.localeCompare(b.enteredOn));
    for (let i = 1; i < ordered.length; i++) {
      const previous = ordered[i - 1];
      const current = ordered[i];
      if (areAdjacent(previous.state, current.state)) continue;
      const missing = statesBetween(previous.state, current.state) ?? [];
      gaps.push({
        fromState: previous.state.toUpperCase(),
        toState: current.state.toUpperCase(),
        enteredOn: current.enteredOn,
        missing,
        note:
          missing.length > 0
            ? `No miles logged for ${missing.join(", ")} between ${previous.state.toUpperCase()} and ${current.state.toUpperCase()}. Add them — DispatchDeck will not guess.`
            : `${previous.state.toUpperCase()} and ${current.state.toUpperCase()} do not share a border and no route connects them. Check the entry.`,
      });
    }
  }
  return gaps;
}

export async function quarterSummary(
  carrierId: string,
  year: number,
  quarter: Quarter,
  truckId?: string,
): Promise<QuarterSummary> {
  const db = getDb();
  const { from, to } = quarterBounds(year, quarter);

  // Date columns compare as `date`, so plain yyyy-mm-dd strings are the right
  // bind values here — no Date object goes anywhere near the query.
  const legConditions = [
    eq(jurisdictionLegs.carrierId, carrierId),
    gte(jurisdictionLegs.enteredOn, from),
    lte(jurisdictionLegs.enteredOn, to),
  ];
  if (truckId) legConditions.push(eq(jurisdictionLegs.truckId, truckId));

  const fuelConditions = [
    eq(fuelPurchases.carrierId, carrierId),
    gte(fuelPurchases.purchasedOn, from),
    lte(fuelPurchases.purchasedOn, to),
  ];
  if (truckId) fuelConditions.push(eq(fuelPurchases.truckId, truckId));

  const [legs, fuel] = await Promise.all([
    db
      .select({
        state: jurisdictionLegs.state,
        miles: jurisdictionLegs.miles,
        enteredOn: jurisdictionLegs.enteredOn,
        truckId: jurisdictionLegs.truckId,
      })
      .from(jurisdictionLegs)
      .where(and(...legConditions)),
    db
      .select({
        state: fuelPurchases.state,
        gallonsMilli: fuelPurchases.gallonsMilli,
        amountCents: fuelPurchases.amountCents,
        purchasedOn: fuelPurchases.purchasedOn,
        truckId: fuelPurchases.truckId,
      })
      .from(fuelPurchases)
      .where(and(...fuelConditions)),
  ]);

  return summariseQuarter(year, quarter, legs, fuel);
}

/** The worksheet as CSV — the columns an IFTA return actually asks for. */
export function quarterCsv(summary: QuarterSummary): string {
  const { csvLine } = csvHelpers();
  const lines = [
    csvLine([`IFTA quarter summary — Q${summary.quarter} ${summary.year}`]),
    csvLine([`Period`, summary.from, "to", summary.to]),
    csvLine([
      "Fleet MPG",
      summary.fleetMpg === null ? "no fuel recorded" : summary.fleetMpg.toFixed(2),
    ]),
    csvLine([]),
    csvLine([
      "Jurisdiction",
      "Name",
      "Total Miles",
      "Taxable Gallons",
      "Gallons Purchased",
      "Net Gallons",
      "Fuel Cost",
    ]),
  ];
  for (const r of summary.states) {
    lines.push(
      csvLine([
        r.state,
        r.name,
        r.miles,
        (r.taxableGallonsMilli / GALLON_SCALE).toFixed(3),
        (r.gallonsMilli / GALLON_SCALE).toFixed(3),
        (r.netGallonsMilli / GALLON_SCALE).toFixed(3),
        (r.amountCents / 100).toFixed(2),
      ]),
    );
  }
  lines.push(
    csvLine([
      "TOTAL",
      "",
      summary.totalMiles,
      "",
      (summary.totalGallonsMilli / GALLON_SCALE).toFixed(3),
      "",
      (summary.totalFuelCents / 100).toFixed(2),
    ]),
  );
  if (summary.gaps.length > 0) {
    lines.push(csvLine([]));
    lines.push(csvLine(["Mileage gaps flagged for review — not filled in"]));
    for (const gap of summary.gaps) {
      lines.push(csvLine([gap.fromState, gap.toState, gap.enteredOn, gap.note]));
    }
  }
  lines.push(csvLine([]));
  lines.push(
    csvLine([
      "DispatchDeck prepares miles and gallons. It does not hold tax rates and does not compute tax owed.",
    ]),
  );
  return `${lines.join("\r\n")}\r\n`;
}

function csvHelpers() {
  const cell = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return "";
    const s = String(value);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return {
    csvLine: (cells: Array<string | number | null | undefined>) => cells.map(cell).join(","),
  };
}
