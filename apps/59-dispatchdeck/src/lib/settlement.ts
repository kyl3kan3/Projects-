/**
 * src/lib/settlement.ts
 *
 * The week, honestly. Revenue, fuel, factoring fees, dispatch percentage, and
 * the per-mile number every owner-operator argues about — shown as lines of
 * arithmetic, so a driver can check it rather than believe it.
 *
 * Three things this gets right that a naive version does not:
 *
 *  - **Revenue is linehaul plus billed accessorials only.** A drafted detention
 *    line the broker has not agreed to is not revenue.
 *  - **A factoring fee only exists once the reserve is released.** Before that,
 *    face value minus the advance is a reserve, and calling it a fee makes
 *    factoring look about three times more expensive than it is.
 *  - **Deadhead counts against the per-mile number.** Loaded-mile revenue per
 *    loaded mile is the figure brokers quote; total miles including deadhead is
 *    the figure that pays for the truck. Both are shown, because the gap between
 *    them is the argument.
 *
 * Pure: rows in, arithmetic out.
 */

import { applyBps, centsPerMile } from "@/lib/money";

export interface SettlementLoad {
  id: string;
  reference: string | null;
  brokerName: string | null;
  status: string;
  rateCents: number;
  accessorialsCents: number;
  totalMiles: number | null;
  deadheadMiles: number | null;
  deliveredAt: Date | string | null;
  factored: boolean;
  originCity: string | null;
  originState: string | null;
  destinationCity: string | null;
  destinationState: string | null;
  /** Face value of the invoice, when one exists. */
  invoiceAmountCents: number | null;
  factoringFeeCents: number;
}

export interface SettlementFuel {
  amountCents: number;
  gallonsMilli: number;
}

export interface SettlementWeek {
  /** yyyy-mm-dd, Monday. */
  from: string;
  /** yyyy-mm-dd, Sunday. */
  to: string;
  loads: SettlementLoad[];
  loadCount: number;
  linehaulCents: number;
  accessorialCents: number;
  grossCents: number;
  fuelCents: number;
  fuelGallonsMilli: number;
  factoringFeeCents: number;
  dispatchFeeCents: number;
  netCents: number;
  loadedMiles: number;
  deadheadMiles: number;
  totalMiles: number;
  /** Gross ÷ loaded miles. What the broker quoted. */
  grossPerLoadedMile: number | null;
  /** Net ÷ all miles including deadhead. What actually pays for the truck. */
  netPerTotalMile: number | null;
  /** True when some loads have no mileage — the per-mile figures are then partial. */
  milesIncomplete: boolean;
}

/** Monday 00:00 of the week containing `day`, as yyyy-mm-dd. */
export function weekStart(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay(); // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1;
  date.setUTCDate(date.getUTCDate() - back);
  return isoUtcDay(date);
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return isoUtcDay(date);
}

function isoUtcDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function settleWeek(
  from: string,
  loads: SettlementLoad[],
  fuel: SettlementFuel[],
  opts: { dispatchFeeBps?: number } = {},
): SettlementWeek {
  const to = addDays(from, 6);

  const linehaulCents = loads.reduce((s, l) => s + l.rateCents, 0);
  const accessorialCents = loads.reduce((s, l) => s + l.accessorialsCents, 0);
  const grossCents = linehaulCents + accessorialCents;
  const fuelCents = fuel.reduce((s, f) => s + f.amountCents, 0);
  const fuelGallonsMilli = fuel.reduce((s, f) => s + f.gallonsMilli, 0);
  const factoringFeeCents = loads.reduce((s, l) => s + l.factoringFeeCents, 0);
  const dispatchFeeCents = applyBps(linehaulCents, opts.dispatchFeeBps ?? 0);
  const netCents = grossCents - fuelCents - factoringFeeCents - dispatchFeeCents;

  const loadedMiles = loads.reduce((s, l) => s + (l.totalMiles ?? 0), 0);
  const deadheadMiles = loads.reduce((s, l) => s + (l.deadheadMiles ?? 0), 0);
  const totalMiles = loadedMiles + deadheadMiles;

  return {
    from,
    to,
    loads,
    loadCount: loads.length,
    linehaulCents,
    accessorialCents,
    grossCents,
    fuelCents,
    fuelGallonsMilli,
    factoringFeeCents,
    dispatchFeeCents,
    netCents,
    loadedMiles,
    deadheadMiles,
    totalMiles,
    grossPerLoadedMile: centsPerMile(grossCents, loadedMiles),
    netPerTotalMile: centsPerMile(netCents, totalMiles),
    milesIncomplete: loads.some((l) => l.totalMiles === null || l.totalMiles === 0),
  };
}
