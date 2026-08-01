/**
 * The signed ICS feed — every deadline in Google or Outlook without an OAuth
 * dance, which is the right trade for an audience that shares one login.
 *
 * Two details that decide whether this actually works in a real calendar:
 *
 *  - **All-day events, not timed ones.** A grant deadline is a date. Emitting
 *    `DTSTART;VALUE=DATE:20260915` puts it on 15 September in every viewer's
 *    calendar. Emitting a timestamp puts it on the 14th for anyone west of the
 *    org and on the 16th for anyone far enough east.
 *  - **Stable UIDs.** The UID is the deadline's own id, so re-fetching the feed
 *    updates an event in place instead of duplicating it — which is how a
 *    calendar subscription ends up with the same report deadline four times.
 *
 * The token is a capability: a random string in the URL, stored only as an HMAC
 * so a database leak does not hand out everybody's calendar. Rotating it makes
 * the old URL stop resolving immediately.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { addDays, formatCivilLong, type CivilDate } from "@/lib/dates";
import type { DeadlineKind } from "@/db/schema";

/* ----------------------------------------------------------------- tokens --- */

export function newIcsToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashIcsToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

/** Constant-time compare, so the lookup cannot be probed byte by byte. */
export function icsHashMatches(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function icsFeedPath(token: string): string {
  return `/api/calendar/${token}/grantgrid.ics`;
}

/* ------------------------------------------------------------ feed output --- */

export const DEADLINE_KIND_LABELS: Record<DeadlineKind, string> = {
  loi: "LOI",
  application: "Application",
  report: "Report",
  renewal: "Renewal",
  custom: "Task",
};

export function deadlineKindLabel(kind: DeadlineKind): string {
  return DEADLINE_KIND_LABELS[kind] ?? "Task";
}

export interface FeedDeadline {
  id: string;
  kind: DeadlineKind;
  dueOn: CivilDate;
  label: string;
  funderName: string;
  grantTitle: string;
  askAmountCents: number | null;
  completedAt: Date | null;
  updatedAt: Date;
}

export interface FeedOptions {
  orgName: string;
  timezone: string;
  appUrl: string;
  /** Grant id → app URL, so an event body can link back to the workspace. */
  grantPath?: (deadline: FeedDeadline) => string;
}

/** RFC 5545 escaping: backslash, semicolon, comma, newline. In that order. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Lines must not exceed 75 octets; continuations begin with one space. */
function fold(line: string): string {
  if (line.length <= 73) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 73));
  rest = rest.slice(73);
  while (rest.length) {
    chunks.push(` ${rest.slice(0, 72)}`);
    rest = rest.slice(72);
  }
  return chunks.join("\r\n");
}

function stamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

function compact(value: CivilDate): string {
  return value.replace(/-/g, "");
}

/**
 * The whole calendar. `now` is a parameter so the output is deterministic in
 * tests — a DTSTAMP of "whatever the clock said" makes the feed untestable.
 */
export function buildFeed(
  deadlines: FeedDeadline[],
  options: FeedOptions,
  now: Date = new Date(),
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GrantGrid//Deadlines//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(`${options.orgName} — grant deadlines`)}`,
    `X-WR-TIMEZONE:${escapeText(options.timezone)}`,
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];

  for (const d of deadlines) {
    const kind = deadlineKindLabel(d.kind);
    const summary = `${kind} — ${d.funderName}`;
    const detail = [
      d.label,
      `Grant: ${d.grantTitle}`,
      `Due: ${formatCivilLong(d.dueOn)} (${options.timezone})`,
      options.grantPath ? `${options.appUrl}${options.grantPath(d)}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${d.id}@grantgrid`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${compact(d.dueOn)}`,
      // DTEND is exclusive for all-day events: the day after.
      `DTEND;VALUE=DATE:${compact(addDays(d.dueOn, 1))}`,
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(detail)}`,
      `CATEGORIES:${escapeText(kind.toUpperCase())}`,
      `STATUS:${d.completedAt ? "CANCELLED" : "CONFIRMED"}`,
      `TRANSP:TRANSPARENT`,
      `LAST-MODIFIED:${stamp(d.updatedAt)}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:-P1D",
      `DESCRIPTION:${escapeText(`${summary} is due tomorrow`)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

/**
 * A weak ETag over the feed's contents, so a calendar poller hitting this hourly
 * gets a 304 instead of a fresh render.
 */
export function feedEtag(body: string): string {
  return `W/"${createHmac("sha256", "grantgrid-ics").update(body).digest("hex").slice(0, 32)}"`;
}
