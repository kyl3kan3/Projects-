/**
 * Building an iCalendar document. Pure: no database, no Next.js, nothing that
 * reaches a socket, so it can be imported anywhere and tested directly.
 *
 * Written by hand rather than through a library for one reason: the UID. A feed is
 * subscribed once and re-fetched forever, so an event's UID must be stable across
 * edits (`game-<id>@rosterrally`) while its `SEQUENCE` increments with the game's
 * revision. Get that wrong and a moved game appears twice in every parent's phone
 * instead of moving. Emitting the lines ourselves makes that contract explicit.
 *
 * Times are emitted as UTC instants (`...Z`), which is what the stored `starts_at`
 * already is. A calendar client renders them in the reader's own zone, which is
 * the right behaviour for a family driving to an away game in another state.
 */

export interface FeedEvent {
  gameId: string;
  revision: number;
  summary: string;
  location: string;
  description: string;
  startsAt: Date;
  endsAt: Date;
  canceled: boolean;
}

function icsTime(at: Date): string {
  return `${at.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/** Escape per RFC 5545: backslash, semicolon, comma, newline. */
function icsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold lines at 75 octets, as the spec requires for long SUMMARY values. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest) parts.push(` ${rest}`);
  return parts.join("\r\n");
}

export function buildIcs(calendarName: string, events: readonly FeedEvent[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RosterRally//Season Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(calendarName)}`,
    "X-PUBLISHED-TTL:PT15M",
  ];
  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      // Stable across edits: a moved game updates in place rather than duplicating.
      `UID:game-${event.gameId}@rosterrally`,
      `SEQUENCE:${event.revision}`,
      `DTSTAMP:${icsTime(new Date())}`,
      `DTSTART:${icsTime(event.startsAt)}`,
      `DTEND:${icsTime(event.endsAt)}`,
      fold(`SUMMARY:${icsText(event.summary)}`),
      fold(`LOCATION:${icsText(event.location)}`),
      fold(`DESCRIPTION:${icsText(event.description)}`),
      `STATUS:${event.canceled ? "CANCELLED" : "CONFIRMED"}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
