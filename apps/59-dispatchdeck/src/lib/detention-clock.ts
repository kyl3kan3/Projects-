/**
 * src/lib/detention-clock.ts
 *
 * The detention clock's arithmetic, with nothing else in it.
 *
 * Split out from `detention.ts` deliberately: the cab ticks this every second in
 * the browser, and `detention.ts` imports the database client. A client
 * component importing that would drag `postgres` into the browser bundle.
 *
 * Pure. No database, no environment, no timezone assumptions.
 */

import type { CarrierSettings } from "@/db/schema";
import { formatDuration } from "@/lib/format";

export const DEFAULT_FREE_HOURS = 2;
export const DEFAULT_RATE_CENTS = 5_000; // $50.00/hr, the common spot-market ask
const HOUR_MS = 3_600_000;

export interface DetentionConfig {
  detentionFreeHours: number;
  detentionRateCents: number;
}

export function detentionConfig(settings: CarrierSettings | null | undefined): DetentionConfig {
  const freeHours = settings?.detentionFreeHours;
  const rate = settings?.detentionRateCents;
  return {
    detentionFreeHours:
      typeof freeHours === "number" && freeHours >= 0 ? freeHours : DEFAULT_FREE_HOURS,
    detentionRateCents: typeof rate === "number" && rate >= 0 ? rate : DEFAULT_RATE_CENTS,
  };
}

export interface DetentionState {
  /** True while the driver is still on the dock. */
  running: boolean;
  /** When the free window closes; null when there is no arrival stamp. */
  freeUntil: Date | null;
  /** Milliseconds on the dock so far (frozen at departure). */
  elapsedMs: number;
  /** Milliseconds past the free window. Zero inside it. */
  overMs: number;
  /** Billable hours: any part-hour past the free window counts as one. */
  billableHours: number;
  accruedCents: number;
  /** True once the free window has been exceeded — the clock turns amber. */
  overdue: boolean;
}

/** The clock as of `now`. */
export function detentionState(
  stop: { arrivedAt: Date | string | null; departedAt: Date | string | null },
  config: DetentionConfig,
  now: Date = new Date(),
): DetentionState {
  const arrived = toDate(stop.arrivedAt);
  if (!arrived) {
    return {
      running: false,
      freeUntil: null,
      elapsedMs: 0,
      overMs: 0,
      billableHours: 0,
      accruedCents: 0,
      overdue: false,
    };
  }
  const departed = toDate(stop.departedAt);
  const end = departed ?? now;
  const elapsedMs = Math.max(0, end.getTime() - arrived.getTime());
  const freeMs = config.detentionFreeHours * HOUR_MS;
  const freeUntil = new Date(arrived.getTime() + freeMs);
  const overMs = Math.max(0, elapsedMs - freeMs);
  const billableHours = overMs > 0 ? Math.ceil(overMs / HOUR_MS) : 0;
  return {
    running: departed === null,
    freeUntil,
    elapsedMs,
    overMs,
    billableHours,
    accruedCents: billableHours * config.detentionRateCents,
    overdue: overMs > 0,
  };
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The sentence the broker reads on the invoice line. */
export function detentionDescription(
  stop: { facility: string | null; city: string; state: string },
  state: DetentionState,
  config: DetentionConfig,
): string {
  const where = stop.facility?.trim() || `${stop.city}, ${stop.state}`;
  return (
    `Detention at ${where} — ${formatDuration(state.elapsedMs)} on the dock, ` +
    `${config.detentionFreeHours}h free, ${state.billableHours}h billable`
  );
}

/** Sum the lines that will actually go on the invoice. */
export function billedAccessorialsCents(
  lines: Array<{ amountCents: number; status: string }>,
): number {
  return lines
    .filter((l) => l.status === "billed" || l.status === "paid")
    .reduce((sum, l) => sum + l.amountCents, 0);
}
