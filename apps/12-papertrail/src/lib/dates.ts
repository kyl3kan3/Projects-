/**
 * Dates for money: when an invoice is due, when it is late, and by how much.
 *
 * Everything here is UTC-day arithmetic. A payment term is a count of calendar
 * days, not a duration in hours, so "net 14" issued on 4 July is due at the end
 * of 18 July regardless of what time of day it went out or which side of a
 * daylight-saving change it lands on. That is also why an invoice is *not* late
 * one millisecond after its due date — it is late once the calendar has moved
 * past the due day.
 *
 * Known limitation, deliberate at MVP: the day boundary is UTC for everyone. A
 * freelancer in UTC+13 sees an invoice flip to overdue up to 13 hours after
 * their own midnight. Per-account timezones are a Phase-2 setting; getting the
 * arithmetic consistent matters more than getting it local.
 */

const DAY_MS = 86_400_000;

/** Days since the epoch in UTC — the unit all comparisons here are made in. */
export function utcDayIndex(date: Date): number {
  return Math.floor(date.getTime() / DAY_MS);
}

/** The last instant of the UTC day a date falls in. */
export function endOfUtcDay(date: Date): Date {
  const d = new Date(date.getTime());
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/** The first instant of the UTC day a date falls in. */
export function startOfUtcDay(date: Date): Date {
  const d = new Date(date.getTime());
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + Math.round(days) * DAY_MS);
}

/**
 * When an invoice issued at `issuedAt` on `netDays` terms falls due: the end of
 * the day `netDays` after the issue day. Net 0 is "due on receipt" — the end of
 * the day it was issued.
 */
export function dueDateFor(issuedAt: Date, netDays: number): Date {
  const days = Math.max(0, Math.round(netDays) || 0);
  return endOfUtcDay(addUtcDays(startOfUtcDay(issuedAt), days));
}

/**
 * Whole days past due. 0 while the invoice is inside its terms, 1 on the day
 * after the due day, and so on.
 */
export function daysOverdue(dueAt: Date | null, now: Date): number {
  if (!dueAt) return 0;
  return Math.max(0, utcDayIndex(now) - utcDayIndex(dueAt));
}

/** Days until due — 0 on the due day itself, negative once late. */
export function daysUntilDue(dueAt: Date | null, now: Date): number {
  if (!dueAt) return 0;
  return utcDayIndex(dueAt) - utcDayIndex(now);
}

export interface OverdueInput {
  dueAt: Date | null;
  total: number;
  amountPaid: number;
  /** A voided or still-draft invoice is never late. */
  status: string;
}

/** Is this invoice actually late? Unpaid, issued, past its due day. */
export function isOverdue(invoice: OverdueInput, now: Date): boolean {
  if (invoice.status === "void" || invoice.status === "draft" || invoice.status === "paid") {
    return false;
  }
  if ((invoice.total || 0) - (invoice.amountPaid || 0) <= 0) return false;
  return daysOverdue(invoice.dueAt, now) > 0;
}

/** "due Jul 18" / "due today" / "7 days overdue" — the meta line on a row. */
export function describeDue(dueAt: Date | null, now: Date): string {
  if (!dueAt) return "no due date";
  const late = daysOverdue(dueAt, now);
  if (late === 1) return "1 day overdue";
  if (late > 1) return `${late} days overdue`;
  const until = daysUntilDue(dueAt, now);
  if (until === 0) return "due today";
  if (until === 1) return "due tomorrow";
  return `due ${formatShortDate(dueAt)}`;
}

/** "Jul 18" — the document/meta date format used everywhere in the UI. */
export function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** "18 July 2026" — the long form used inside document bodies. */
export function formatDocumentDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** "Jul 18, 14:32 UTC" — audit-trail precision. */
export function formatAuditTimestamp(date: Date): string {
  const d = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  const t = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }).format(date);
  return `${d} · ${t} UTC`;
}

/** The UTC month key a date belongs to, e.g. "2026-07" — used for plan quotas. */
export function utcMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** First instant of the UTC month a date is in. */
export function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

/** First instant of the following UTC month. */
export function startOfNextUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

/** Short month labels for the income year strip, oldest first. */
export function monthSpine(now: Date, months = 12): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({
      key: utcMonthKey(d),
      label: new Intl.DateTimeFormat("en-US", { month: "narrow", timeZone: "UTC" }).format(d),
    });
  }
  return out;
}
