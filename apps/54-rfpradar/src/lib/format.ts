/**
 * src/lib/format.ts
 *
 * Pure display and time helpers. Imported by client components as well as
 * server code, so nothing in here may reach the database client — that is how
 * `postgres` ends up in a browser bundle.
 *
 * Every date the product shows is rendered in the firm's timezone, never the
 * server's: a proposal due "Mar 21, 5:00 PM" in Richmond must not read
 * "Mar 21, 10:00 PM" because the function ran in UTC.
 */

const MS_PER_DAY = 86_400_000;

/* ------------------------------------------------------------------ money */

/**
 * Value bands are stored as integer cents and rendered compactly:
 * 25_000_000 -> "$250k", 100_000_000 -> "$1M". Rounds once, here at the edge.
 */
export function formatCentsCompact(cents: number): string {
  const dollars = Math.round(cents / 100);
  if (dollars >= 1_000_000_000) return `$${trimZero(dollars / 1_000_000_000)}B`;
  if (dollars >= 1_000_000) return `$${trimZero(dollars / 1_000_000)}M`;
  if (dollars >= 1_000) return `$${trimZero(dollars / 1_000)}k`;
  return `$${dollars.toLocaleString("en-US")}`;
}

function trimZero(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
}

/** Full dollars with separators, for pursuit values. */
export function formatCents(cents: number): string {
  const whole = Math.round(cents) / 100;
  return whole.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export interface ValueBand {
  minCents?: number | null;
  maxCents?: number | null;
}

/** "$250k–$1M" · "over $500k" · "up to $50k" · null when unknown. */
export function formatValueBand(band: ValueBand | null | undefined): string | null {
  if (!band) return null;
  const min = typeof band.minCents === "number" ? band.minCents : null;
  const max = typeof band.maxCents === "number" ? band.maxCents : null;
  if (min !== null && max !== null) {
    return `${formatCentsCompact(min)}–${formatCentsCompact(max)}`;
  }
  if (min !== null) return `over ${formatCentsCompact(min)}`;
  if (max !== null) return `up to ${formatCentsCompact(max)}`;
  return null;
}

/* ------------------------------------------------------------------- time */

function parts(date: Date, timeZone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const out: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") out[part.type] = part.value;
  }
  return out;
}

/** "2026-03-21" in the given timezone — the key a per-day ledger uses. */
export function zonedDateKey(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Hour 0-23 in the given timezone. The morning scan's trigger. */
export function zonedHour(date: Date, timeZone: string): number {
  const hour = Number(parts(date, timeZone).hour);
  // Intl renders midnight as "24" in some ICU versions with hour12: false.
  return hour === 24 ? 0 : hour;
}

/** "Mar 21" — the deadline row's mono date. */
export function formatDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(date);
}

/** "Mar 21, 2026" for anything more than a year out or in the past. */
export function formatDayYear(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/** "5:00 PM" — deadline times and the scan stamp. */
export function formatTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** "Mar 21, 5:00 PM" */
export function formatDayTime(date: Date, timeZone: string): string {
  return `${formatDay(date, timeZone)}, ${formatTime(date, timeZone)}`;
}

/** "TUESDAY" — the radar header's label. */
export function formatWeekday(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" })
    .format(date)
    .toUpperCase();
}

/**
 * Whole calendar days from `from` to `due` in the firm's timezone. Calendar
 * days, not 24-hour blocks: a deadline at 09:00 tomorrow is "1 day", not "0".
 */
export function daysUntil(due: Date, timeZone: string, from: Date = new Date()): number {
  const a = Date.parse(`${zonedDateKey(from, timeZone)}T00:00:00Z`);
  const b = Date.parse(`${zonedDateKey(due, timeZone)}T00:00:00Z`);
  return Math.round((b - a) / MS_PER_DAY);
}

/** "9 days" · "today" · "tomorrow" · "3 days ago". Never bare numbers. */
export function formatCountdown(due: Date, timeZone: string, from: Date = new Date()): string {
  const days = daysUntil(due, timeZone, from);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days < 0) return `${Math.abs(days)} days ago`;
  return `${days} days`;
}

export type DeadlineTone = "ok" | "soon" | "over";

/**
 * Deadline tone derived as-of-now. Never read off a stored status column: a
 * cron-reconciled column shows "Due" on a proposal 212 days late.
 */
export function deadlineTone(
  due: Date,
  timeZone: string,
  completedAt: Date | null = null,
  from: Date = new Date(),
): DeadlineTone | "done" {
  if (completedAt) return "done";
  const days = daysUntil(due, timeZone, from);
  if (days < 0) return "over";
  if (days <= 7) return "soon";
  return "ok";
}

/** "9h ago" · "just now" · "6:02 AM" for today. Source fetch times. */
export function formatFetchedAt(
  at: Date | null,
  timeZone: string,
  from: Date = new Date(),
): string {
  if (!at) return "never";
  const minutes = Math.floor((from.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDayYear(at, timeZone);
}

/** Sentence-case a snake_case enum for display ("go_no_go" -> "Go/no-go"). */
const STAGE_LABELS: Record<string, string> = {
  watching: "Watching",
  go_no_go: "Go/no-go",
  drafting: "Drafting",
  submitted: "Submitted",
  won: "Won",
  lost: "Lost",
  no_bid: "No-bid",
};

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage;
}

const KIND_LABELS: Record<string, string> = {
  questions: "Questions due",
  proposal: "Proposal due",
  orals: "Oral presentations",
  custom: "Milestone",
};

export function deadlineKindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

const BLOCK_KIND_LABELS: Record<string, string> = {
  boilerplate: "Boilerplate",
  past_answer: "Past answer",
  bio: "Team bio",
  past_performance: "Past performance",
  attachment_ref: "Attachment",
};

export function blockKindLabel(kind: string): string {
  return BLOCK_KIND_LABELS[kind] ?? kind;
}

/** Thousands separators for notice counts in the scan stamp. */
export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}
