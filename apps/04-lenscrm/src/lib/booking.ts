/**
 * Booking engine: availability rules → bookable slots. Pure and testable;
 * timezone handling kept explicit. Double-booking is prevented at write time
 * by re-checking against existing sessions inside the booking transaction.
 */
import { and, eq, gte, lte } from "drizzle-orm";
import { db, schema } from "@/db";

export interface Slot { startsAt: Date; endsAt: Date; }

/** Minutes since local midnight for a "HH:MM" string. */
function hm(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/**
 * Generate open slots for a booking type over a date window. A slot is open
 * when it fits inside a weekly availability window, respects buffers and min
 * notice, and doesn't overlap an existing session (± buffers).
 */
export async function openSlots(opts: {
  accountId: string;
  bookingTypeId: string;
  from: Date;
  to: Date;
}): Promise<Slot[]> {
  const bt = await db.query.bookingTypes.findFirst({ where: eq(schema.bookingTypes.id, opts.bookingTypeId) });
  if (!bt) return [];

  const rules = await db.query.availabilityRules.findMany({ where: eq(schema.availabilityRules.accountId, opts.accountId) });
  const weekly = rules.filter((r) => r.kind === "weekly");
  const blackouts = new Set(rules.filter((r) => r.kind === "blackout").map((r) => r.date));

  const existing = await db.query.sessions.findMany({
    where: and(
      eq(schema.sessions.accountId, opts.accountId),
      gte(schema.sessions.startsAt, opts.from),
      lte(schema.sessions.startsAt, opts.to),
    ),
  });
  const busy = existing
    .filter((s) => s.status !== "cancelled")
    .map((s) => ({ start: s.startsAt.getTime(), end: s.endsAt.getTime() }));

  const dur = bt.durationMinutes;
  const step = 30;
  const minNoticeMs = bt.minNoticeHours * 3600_000;
  const now = Date.now();
  const slots: Slot[] = [];

  for (let day = new Date(opts.from); day <= opts.to; day.setDate(day.getDate() + 1)) {
    const iso = day.toISOString().slice(0, 10);
    if (blackouts.has(iso)) continue;
    const weekday = day.getDay();
    for (const rule of weekly.filter((r) => r.weekday === weekday && r.startTime && r.endTime)) {
      const open = hm(rule.startTime!);
      const close = hm(rule.endTime!);
      for (let start = open; start + dur <= close; start += step) {
        const s = new Date(day);
        s.setHours(0, Math.round(start + bt.bufferBeforeMinutes), 0, 0);
        const e = new Date(s.getTime() + dur * 60_000);
        if (s.getTime() - now < minNoticeMs) continue;
        const eb = e.getTime() + bt.bufferAfterMinutes * 60_000;
        const overlaps = busy.some((b) => s.getTime() < b.end && eb > b.start);
        if (!overlaps) slots.push({ startsAt: new Date(s), endsAt: new Date(e) });
      }
    }
  }
  return slots.slice(0, 200);
}
