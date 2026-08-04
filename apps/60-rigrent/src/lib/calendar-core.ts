/**
 * src/lib/calendar-core.ts
 *
 * The month grid, and how orders and runs land in it. Pure, so the
 * busiest-Saturday view can be tested without a database.
 *
 * The grid starts on Monday. A rental week runs Monday to Sunday because the
 * weekend is the *event*, and a calendar that splits Saturday from Sunday across
 * two rows hides the exact thing the shop is looking at.
 */

import {
  addDays,
  daysInMonth,
  isoDateOf,
  parseIsoDate,
  startOfMonth,
  toIsoDate,
  type IsoDate,
} from "@/lib/dates";

export interface CalendarCell {
  date: IsoDate;
  inMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
}

/** Six weeks of Monday-first cells covering the month `date` falls in. */
export function monthGrid(date: IsoDate, today: IsoDate = isoDateOf(new Date())): CalendarCell[] {
  const first = startOfMonth(date);
  const { year, month } = parseIsoDate(first);
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=Sun
  const lead = (firstDow + 6) % 7; // Monday-first offset
  const start = addDays(first, -lead);
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const cursor = addDays(start, i);
    const parts = parseIsoDate(cursor);
    const dow = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
    cells.push({
      date: cursor,
      inMonth: parts.year === year && parts.month === month,
      isToday: cursor === today,
      isWeekend: dow === 0 || dow === 6,
    });
  }
  return cells;
}

export function monthBounds(date: IsoDate): { from: IsoDate; to: IsoDate } {
  const { year, month } = parseIsoDate(date);
  return {
    from: toIsoDate(year, month, 1),
    // Half-open, so it plugs straight into the overlap predicate.
    to: addDays(toIsoDate(year, month, daysInMonth(year, month)), 1),
  };
}

export interface CalendarOrder {
  id: string;
  number: number;
  customerName: string;
  status: string;
  outOn: IsoDate;
  dueBackOn: IsoDate;
  unitCount: number;
  delivery: boolean;
}

export interface CalendarRun {
  id: string;
  kind: "delivery" | "pickup";
  runOn: IsoDate;
  truckLabel: string | null;
  stopCount: number;
  status: string;
}

export interface DayContents {
  /** Orders leaving the yard on this day. */
  out: CalendarOrder[];
  /** Orders due back on this day. */
  back: CalendarOrder[];
  /** Orders out on this day but neither leaving nor returning — the density. */
  onRent: CalendarOrder[];
  runs: CalendarRun[];
  /** Units of gear off the shelf on this day, across everything. */
  unitsOut: number;
}

/**
 * Index the month by day. An order appears on its out date, its due-back date,
 * and every day between — that continuity is what makes the Saturday column look
 * as heavy as it actually is.
 */
export function indexByDay(
  cells: readonly CalendarCell[],
  orders: readonly CalendarOrder[],
  runs: readonly CalendarRun[],
): Map<IsoDate, DayContents> {
  const map = new Map<IsoDate, DayContents>();
  for (const cell of cells) {
    map.set(cell.date, { out: [], back: [], onRent: [], runs: [], unitsOut: 0 });
  }

  for (const order of orders) {
    for (const [date, day] of map) {
      if (date === order.outOn) day.out.push(order);
      else if (date === order.dueBackOn) day.back.push(order);
      else if (date > order.outOn && date < order.dueBackOn) day.onRent.push(order);
      else continue;
      if (date < order.dueBackOn) day.unitsOut += order.unitCount;
    }
  }

  for (const run of runs) {
    map.get(run.runOn)?.runs.push(run);
  }

  return map;
}

/** The heaviest day in the grid, for the "busiest Saturday" line. */
export function busiestDay(index: Map<IsoDate, DayContents>): { date: IsoDate; unitsOut: number } | null {
  let best: { date: IsoDate; unitsOut: number } | null = null;
  for (const [date, day] of index) {
    if (!best || day.unitsOut > best.unitsOut) best = { date, unitsOut: day.unitsOut };
  }
  return best && best.unitsOut > 0 ? best : null;
}
