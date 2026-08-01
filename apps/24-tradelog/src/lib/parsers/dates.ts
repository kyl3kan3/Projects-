/**
 * Date and time reading for broker exports.
 *
 * Brokers write dates in whatever their reporting engine was built with. The
 * only rule enforced here is that an ambiguous string is an error, never a
 * guess: `03/04/2026` could be March 4th or April 3rd, and picking wrong moves a
 * trade to a different day, a different weekday bucket, and a different calendar
 * cell. So each parser states the layout it expects and this module refuses
 * anything that does not match.
 */

import { fail } from "@/lib/parsers/types";
import { zonedTimeToUtc } from "@/lib/tz";

export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function checkRanges(w: WallClock, raw: string): WallClock {
  const daysInMonth = new Date(Date.UTC(w.year, w.month, 0)).getUTCDate();
  if (
    w.month < 1 ||
    w.month > 12 ||
    w.day < 1 ||
    w.day > daysInMonth ||
    w.hour > 23 ||
    w.minute > 59 ||
    w.second > 59
  ) {
    fail(`Not a valid date/time: ${JSON.stringify(raw)}`);
  }
  return w;
}

/** Two-digit years: brokers only export recent history, so 20xx. */
function expandYear(y: number): number {
  return y >= 100 ? y : 2000 + y;
}

/** `M/D/YY HH:MM[:SS]` — ThinkorSwim and Schwab. US month-first, by format spec. */
export function parseUsDateTime(raw: string): WallClock {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(raw.trim());
  if (!m) fail(`Expected a M/D/YY HH:MM:SS timestamp, got ${JSON.stringify(raw)}`);
  return checkRanges(
    {
      year: expandYear(Number(m[3])),
      month: Number(m[1]),
      day: Number(m[2]),
      hour: Number(m[4]),
      minute: Number(m[5]),
      second: Number(m[6] ?? 0),
    },
    raw,
  );
}

/** `YYYYMMDD` or `YYYY-MM-DD` plus `HHMMSS` or `HH:MM:SS` — IBKR Flex. */
export function parseIsoishDateTime(date: string, time: string): WallClock {
  const d = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(date.trim());
  if (!d) fail(`Expected a YYYYMMDD trade date, got ${JSON.stringify(date)}`);
  const t = /^(\d{2}):?(\d{2}):?(\d{2})$/.exec(time.trim() || "000000");
  if (!t) fail(`Expected an HHMMSS trade time, got ${JSON.stringify(time)}`);
  return checkRanges(
    {
      year: Number(d[1]),
      month: Number(d[2]),
      day: Number(d[3]),
      hour: Number(t[1]),
      minute: Number(t[2]),
      second: Number(t[3]),
    },
    `${date} ${time}`,
  );
}

/** `YYYY-MM-DD HH:MM:SS` — Tradovate and Binance. */
export function parseSqlDateTime(raw: string): WallClock {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw.trim());
  if (!m) fail(`Expected a YYYY-MM-DD HH:MM:SS timestamp, got ${JSON.stringify(raw)}`);
  return checkRanges(
    {
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
      hour: Number(m[4]),
      minute: Number(m[5]),
      second: Number(m[6] ?? 0),
    },
    raw,
  );
}

/** `M/D/YY` option expiry (ThinkorSwim's Exp column) -> `YYYYMMDD`. */
export function parseUsExpiry(raw: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(raw.trim());
  if (!m) fail(`Expected a M/D/YY expiry, got ${JSON.stringify(raw)}`);
  const year = expandYear(Number(m[3]));
  const month = Number(m[1]);
  const day = Number(m[2]);
  checkRanges({ year, month, day, hour: 0, minute: 0, second: 0 }, raw);
  return `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}

/** `YYYYMMDD` or `YYYY-MM-DD` expiry (IBKR) -> `YYYYMMDD`. */
export function parseCompactExpiry(raw: string): string {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(raw.trim());
  if (!m) fail(`Expected a YYYYMMDD expiry, got ${JSON.stringify(raw)}`);
  checkRanges(
    { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), hour: 0, minute: 0, second: 0 },
    raw,
  );
  return `${m[1]}${m[2]}${m[3]}`;
}

export function toUtc(wall: WallClock, timeZone: string): Date {
  return zonedTimeToUtc(wall, timeZone);
}
