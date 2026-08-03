/**
 * src/lib/dates.ts
 *
 * THE product: the critical-date engine.
 *
 * Everything here is pure and works on ISO `yyyy-mm-dd` strings and integer day
 * numbers. No `Date` object is built from a calendar date anywhere in this file,
 * on purpose: `new Date("2026-05-02")` is midnight UTC, and rendering or
 * re-reading that west of Greenwich silently moves the deadline to May 1. A
 * transaction-coordination product cannot afford a timezone off-by-one, so the
 * arithmetic runs in day numbers and the result is only ever a string.
 *
 * A rule is data (`DateRule`), a computed date is a row, and every computed date
 * carries the sentence that explains it. The UI renders that sentence verbatim —
 * the math is never a black box.
 */

/* ------------------------------------------------------------------ types */

export type AnchorKey = "contract_date" | "acceptance_date" | "closing_date";

export const ANCHOR_KEYS: readonly AnchorKey[] = [
  "contract_date",
  "acceptance_date",
  "closing_date",
] as const;

export const ANCHOR_LABELS: Record<AnchorKey, string> = {
  contract_date: "Contract date",
  acceptance_date: "Acceptance date",
  closing_date: "Closing date",
};

export interface DateRule {
  anchor: AnchorKey;
  /** Signed. Negative counts back from the anchor (e.g. closing − 1). */
  offsetDays: number;
  businessDays: boolean;
  observeHolidays: boolean;
}

/** ISO date -> holiday label, for the US federal scope + the account's state. */
export type HolidayMap = ReadonlyMap<string, string>;

/** Anchor values for one deal. A missing anchor is a legitimate state. */
export type Anchors = Partial<Record<AnchorKey, string | null>>;

export interface Derivation {
  dueOn: string;
  /** The full explanation, rendered verbatim in the UI. */
  sentence: string;
  /** Just the because-clause ("Memorial Day observed"), for diff rows. */
  adjustment: string;
  weekendDaysSkipped: number;
  holidaysObserved: string[];
  /** True when the raw landing day was moved off a weekend or holiday. */
  rolled: boolean;
  anchor: AnchorKey;
  anchorValue: string;
}

export type ComputeResult =
  | { ok: true; value: Derivation }
  /** An unresolvable rule never guesses — the UI renders "needs a date". */
  | { ok: false; reason: string; sentence: string };

/* ---------------------------------------------------- ISO / day arithmetic */

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

/** Days since 1970-01-01, from the civil date (Howard Hinnant's algorithm). */
export function toDayNumber(iso: string): number {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`Not an ISO date: ${iso}`);
  let y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  y -= mo <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (mo + (mo > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function fromDayNumber(n: number): string {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  let y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const mo = mp + (mp < 10 ? 3 : -9);
  y += mo <= 2 ? 1 : 0;
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 0 = Sunday … 6 = Saturday. 1970-01-01 was a Thursday. */
export function dayOfWeek(n: number): number {
  return (((n + 4) % 7) + 7) % 7;
}

export function addDays(iso: string, days: number): string {
  return fromDayNumber(toDayNumber(iso) + days);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return toDayNumber(toIso) - toDayNumber(fromIso);
}

export function isWeekend(n: number): boolean {
  const d = dayOfWeek(n);
  return d === 0 || d === 6;
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function weekdayName(iso: string): string {
  return WEEKDAY_NAMES[dayOfWeek(toDayNumber(iso))];
}

/* -------------------------------------------------------------- the engine */

function holidayLabel(n: number, holidays: HolidayMap): string | null {
  return holidays.get(fromDayNumber(n)) ?? null;
}

/** A business day: Mon–Fri, and not an observed holiday when the rule says so. */
function isBusinessDay(n: number, holidays: HolidayMap, observe: boolean): boolean {
  if (isWeekend(n)) return false;
  if (observe && holidayLabel(n, holidays)) return false;
  return true;
}

function pluralDays(n: number, business: boolean): string {
  const unit = business ? "business day" : "calendar day";
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/** "Contract date (Mar 3) + 10 business days" — the rule, read back as English. */
export function ruleSentence(rule: DateRule, anchorValue?: string | null): string {
  const anchor = ANCHOR_LABELS[rule.anchor];
  const withValue =
    anchorValue && isIsoDate(anchorValue) ? `${anchor} (${formatShort(anchorValue)})` : anchor;
  if (rule.offsetDays === 0) return `${withValue}, the day itself`;
  const sign = rule.offsetDays > 0 ? "+" : "−";
  return `${withValue} ${sign} ${pluralDays(Math.abs(rule.offsetDays), rule.businessDays)}`;
}

/**
 * The one function everything else leans on.
 *
 * Business-day rules step day by day, skipping weekends and — when the rule
 * observes them — holidays, so 10 business days is always ten *working* days
 * away. Calendar rules add the raw offset; if the rule observes holidays, a
 * landing on a weekend or holiday rolls to the nearest business day, forward for
 * a date counted after the anchor and backward for one counted before it, so
 * "closing − 1 business day" can never land after closing.
 */
export function computeDate(rule: DateRule, anchors: Anchors, holidays: HolidayMap): ComputeResult {
  const anchorValue = anchors[rule.anchor];
  if (!anchorValue || !isIsoDate(anchorValue)) {
    const anchorName = ANCHOR_LABELS[rule.anchor].toLowerCase();
    return {
      ok: false,
      reason: `needs the ${anchorName}`,
      sentence: `${ruleSentence(rule)} — waiting on the ${anchorName}.`,
    };
  }

  const observe = rule.observeHolidays;
  const dir = rule.offsetDays < 0 ? -1 : 1;
  let n = toDayNumber(anchorValue);
  let weekendDaysSkipped = 0;
  const holidaysObserved: string[] = [];
  let rolled = false;
  // Guard against a pathological calendar (every day a holiday) rather than
  // spinning forever. 20 years of steps is far beyond any real contract.
  let guard = 7300;

  if (rule.businessDays) {
    let remaining = Math.abs(rule.offsetDays);
    while (remaining > 0 && guard-- > 0) {
      n += dir;
      if (isWeekend(n)) {
        weekendDaysSkipped += 1;
        continue;
      }
      const label = observe ? holidayLabel(n, holidays) : null;
      if (label) {
        holidaysObserved.push(label);
        continue;
      }
      remaining -= 1;
    }
    // An offset of zero business days still means "a day business is done".
    if (rule.offsetDays === 0) {
      while (!isBusinessDay(n, holidays, observe) && guard-- > 0) {
        recordSkip(n, holidays, observe);
        n += dir;
        rolled = true;
      }
    }
  } else {
    n += rule.offsetDays;
    if (observe) {
      while (!isBusinessDay(n, holidays, observe) && guard-- > 0) {
        recordSkip(n, holidays, observe);
        n += dir;
        rolled = true;
      }
    }
  }

  function recordSkip(day: number, cal: HolidayMap, obs: boolean): void {
    if (isWeekend(day)) {
      weekendDaysSkipped += 1;
      return;
    }
    if (obs) {
      const label = holidayLabel(day, cal);
      if (label) holidaysObserved.push(label);
    }
  }

  const dueOn = fromDayNumber(n);
  const clauses: string[] = [];
  if (rule.businessDays && weekendDaysSkipped > 0) {
    clauses.push(`${weekendDaysSkipped} weekend day${weekendDaysSkipped === 1 ? "" : "s"} skipped`);
  }
  if (holidaysObserved.length > 0) {
    clauses.push(`${uniqueList(holidaysObserved)} observed`);
  }
  if (rolled) {
    // On a calendar rule the skipped weekend is part of the roll, not a separate
    // fact, so it is folded into this clause instead of counted twice.
    clauses.push(
      dir > 0 ? "rolled forward to the next business day" : "rolled back to the previous business day",
    );
  }

  const base = ruleSentence(rule, anchorValue);
  const adjustment = clauses.join(", ");
  const sentence = adjustment
    ? `${base} — ${adjustment} — lands ${weekdayName(dueOn)}, ${formatShort(dueOn)}.`
    : `${base} — lands ${weekdayName(dueOn)}, ${formatShort(dueOn)}.`;

  return {
    ok: true,
    value: {
      dueOn,
      sentence,
      adjustment,
      weekendDaysSkipped,
      holidaysObserved,
      rolled,
      anchor: rule.anchor,
      anchorValue,
    },
  };
}

function uniqueList(labels: readonly string[]): string {
  const seen: string[] = [];
  for (const l of labels) if (!seen.includes(l)) seen.push(l);
  if (seen.length === 1) return seen[0];
  if (seen.length === 2) return `${seen[0]} and ${seen[1]}`;
  return `${seen.slice(0, -1).join(", ")} and ${seen[seen.length - 1]}`;
}

/* ------------------------------------------------------- instantiation set */

export interface DatedTask {
  key: string;
  label: string;
  rule: DateRule;
}

export interface ComputedDate {
  key: string;
  label: string;
  rule: DateRule;
  /** Null when the rule cannot resolve yet — never a guessed date. */
  dueOn: string | null;
  sentence: string;
  adjustment: string;
  computedFrom: { anchor: AnchorKey; anchorValue: string | null };
  /** Set when the rule is unresolvable, e.g. "needs the closing date". */
  unresolved: string | null;
}

/** Compute every dated task in a template against one deal's anchors. */
export function computeAll(
  tasks: readonly DatedTask[],
  anchors: Anchors,
  holidays: HolidayMap,
): ComputedDate[] {
  return tasks.map((t) => {
    const result = computeDate(t.rule, anchors, holidays);
    if (!result.ok) {
      return {
        key: t.key,
        label: t.label,
        rule: t.rule,
        dueOn: null,
        sentence: result.sentence,
        adjustment: "",
        computedFrom: { anchor: t.rule.anchor, anchorValue: null },
        unresolved: result.reason,
      };
    }
    return {
      key: t.key,
      label: t.label,
      rule: t.rule,
      dueOn: result.value.dueOn,
      sentence: result.value.sentence,
      adjustment: result.value.adjustment,
      computedFrom: { anchor: t.rule.anchor, anchorValue: result.value.anchorValue },
      unresolved: null,
    };
  });
}

/* ---------------------------------------------------------------- the diff */

export interface DateDiffRow {
  key: string;
  label: string;
  oldDue: string | null;
  newDue: string | null;
  /** The because-clause for the new value. */
  reason: string;
  /** "Appraisal moved May 2 → May 6 — Memorial Day observed" */
  summary: string;
  shiftDays: number | null;
}

/**
 * The recompute preview. Only rows whose due date actually moves appear — a diff
 * listing eleven unchanged dates is a diff nobody reads.
 */
export function diffDates(
  oldDates: readonly ComputedDate[],
  newDates: readonly ComputedDate[],
): DateDiffRow[] {
  const before = new Map(oldDates.map((d) => [d.key, d]));
  const rows: DateDiffRow[] = [];
  for (const next of newDates) {
    const prev = before.get(next.key);
    const oldDue = prev?.dueOn ?? null;
    if (oldDue === next.dueOn) continue;
    const reason = diffReason(prev ?? null, next);
    rows.push({
      key: next.key,
      label: next.label,
      oldDue,
      newDue: next.dueOn,
      reason,
      summary: diffSummary(next.label, oldDue, next.dueOn, reason),
      shiftDays: oldDue && next.dueOn ? daysBetween(oldDue, next.dueOn) : null,
    });
  }
  return rows;
}

function diffReason(prev: ComputedDate | null, next: ComputedDate): string {
  if (next.unresolved) return next.unresolved;
  if (next.adjustment) return next.adjustment;
  if (!prev || prev.dueOn === null) return "newly computable";
  return `${ANCHOR_LABELS[next.rule.anchor].toLowerCase()} moved`;
}

export function diffSummary(
  label: string,
  oldDue: string | null,
  newDue: string | null,
  reason: string,
): string {
  const from = oldDue ? formatShort(oldDue) : "not set";
  const to = newDue ? formatShort(newDue) : "needs a date";
  const tail = reason ? ` — ${reason}` : "";
  return `${label} moved ${from} → ${to}${tail}`;
}

/* ------------------------------------------------- status, derived as of now */

export type StoredDateStatus = "upcoming" | "met" | "missed" | "waived";
export type DisplayDateStatus = "met" | "waived" | "missed" | "at_risk" | "upcoming" | "unset";

/** Days from `today` at which an upcoming date is drawn in the accent. */
export const AT_RISK_DAYS = 3;

/**
 * Status is derived as of now, never read straight from the column: a stored
 * "upcoming" on a date that passed last week must render MISSED the moment the
 * page loads, not the next time a cron happens to run.
 */
export function displayStatus(
  date: { dueOn: string | null; status: StoredDateStatus },
  todayIso: string,
): DisplayDateStatus {
  if (date.status === "met") return "met";
  if (date.status === "waived") return "waived";
  if (!date.dueOn) return "unset";
  const delta = daysBetween(todayIso, date.dueOn);
  if (delta < 0) return "missed";
  if (delta <= AT_RISK_DAYS) return "at_risk";
  return "upcoming";
}

export const DATE_STATUS_LABELS: Record<DisplayDateStatus, string> = {
  met: "MET",
  waived: "WAIVED",
  missed: "MISSED",
  at_risk: "AT RISK",
  upcoming: "UPCOMING",
  unset: "NEEDS A DATE",
};

/* --------------------------------------------------------------- formatting */

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "May 6" — the compact form used in diffs and timeline node labels. */
export function formatShort(iso: string): string {
  const m = ISO_RE.exec(iso);
  if (!m) return iso;
  return `${MONTHS_SHORT[Number(m[2]) - 1]} ${Number(m[3])}`;
}

/** "May 6, 2026" — wherever the year matters. */
export function formatLong(iso: string): string {
  const m = ISO_RE.exec(iso);
  if (!m) return iso;
  return `${MONTHS_SHORT[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/** "2026-05" -> "May 2026", for the commission pipeline rows. */
export function formatMonth(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  return `${MONTHS_SHORT[Number(m[2]) - 1]} ${m[1]}`;
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

/** "in 6 days" / "today" / "8 days ago" — always relative to an ISO today. */
export function relativeDays(todayIso: string, iso: string): string {
  const delta = daysBetween(todayIso, iso);
  if (delta === 0) return "today";
  if (delta === 1) return "tomorrow";
  if (delta === -1) return "yesterday";
  if (delta > 0) return `in ${delta} days`;
  return `${-delta} days ago`;
}

/**
 * Today in the account's IANA timezone, as an ISO date. The whole product turns
 * on which day it is for the coordinator, not for the server region.
 */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  try {
    // en-CA formats as yyyy-mm-dd.
    const formatted = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    if (isIsoDate(formatted)) return formatted;
  } catch {
    // Unknown zone: fall through rather than throwing inside a page render.
  }
  return now.toISOString().slice(0, 10);
}
