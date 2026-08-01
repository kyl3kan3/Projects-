/**
 * Calendar out: one read-only iCal feed per team.
 *
 * Written by hand rather than through a library, for one reason: the UID. A feed
 * is subscribed once and re-fetched forever, so an event's UID must be stable
 * across edits (`game-<id>@rosterrally`) while its `SEQUENCE` increments with the
 * game's revision. Get that wrong and a moved game appears twice in every parent's
 * phone instead of moving. Emitting the lines ourselves makes that contract
 * explicit and testable.
 *
 * Times are emitted as UTC instants (`...Z`), which is what the stored
 * `starts_at` already is. A calendar client renders them in the reader's own zone,
 * which is the correct behaviour for a family travelling to an away game.
 */

import { and, asc, eq, isNotNull, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { clubs, divisions, games, teams, venues } from "@/db/schema";
import { formatClock, formatDayLabel } from "@/lib/time";

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

/**
 * One team's published schedule.
 *
 * Only published games appear: a feed is a promise to a parent's phone, and a
 * draft schedule is not a promise yet. Cancelled games stay in the feed with
 * `STATUS:CANCELLED` so the entry disappears from the calendar instead of
 * lingering as a game nobody turns up to.
 */
export async function buildTeamFeed(teamId: string): Promise<{ name: string; ics: string } | null> {
  const db = getDb();
  const [team] = await db
    .select({ team: teams, divisionName: divisions.name, club: clubs })
    .from(teams)
    .innerJoin(divisions, eq(divisions.id, teams.divisionId))
    .innerJoin(clubs, eq(clubs.id, teams.clubId))
    .where(eq(teams.id, teamId));
  if (!team) return null;

  const rows = await db
    .select({ game: games, venueName: venues.name, venueAddress: venues.address })
    .from(games)
    .innerJoin(venues, eq(venues.id, games.venueId))
    .where(
      and(
        isNotNull(games.publishedAt),
        or(eq(games.homeTeamId, teamId), eq(games.awayTeamId, teamId)),
      ),
    )
    .orderBy(asc(games.startsAt));

  const opponentIds = rows
    .map((r) => (r.game.homeTeamId === teamId ? r.game.awayTeamId : r.game.homeTeamId))
    .filter((id): id is string => Boolean(id));
  const opponents = opponentIds.length
    ? await db.select({ id: teams.id, name: teams.name }).from(teams)
    : [];
  const nameOf = new Map(opponents.map((o) => [o.id, o.name]));

  const tz = team.club.timezone;
  const events: FeedEvent[] = rows.map((r) => {
    const opponentId = r.game.homeTeamId === teamId ? r.game.awayTeamId : r.game.homeTeamId;
    const opponent = opponentId ? nameOf.get(opponentId) : null;
    const summary = opponent
      ? `${team.team.name} v ${opponent}`
      : `${team.team.name} ${r.game.kind}`;
    return {
      gameId: r.game.id,
      revision: r.game.revision,
      summary: `${summary} · ${team.divisionName}`,
      location: `${r.venueName} · ${r.game.field}${r.venueAddress ? `, ${r.venueAddress}` : ""}`,
      description: [
        `${formatDayLabel(r.game.startsAt, tz)} ${formatClock(r.game.startsAt, tz)} ${tz}`,
        r.game.note ?? "",
        `${team.club.name} · schedule from RosterRally`,
      ]
        .filter(Boolean)
        .join("\n"),
      startsAt: r.game.startsAt,
      endsAt: r.game.endsAt,
      canceled: Boolean(r.game.canceledAt),
    };
  });

  return {
    name: `${team.team.name} — ${team.divisionName}`,
    ics: buildIcs(`${team.club.name}: ${team.team.name}`, events),
  };
}

/** A division's published schedule, grouped by day, for the printable page. */
export async function printableSchedule(divisionId: string) {
  const db = getDb();
  const [division] = await db
    .select({ division: divisions, club: clubs })
    .from(divisions)
    .innerJoin(teams, eq(teams.divisionId, divisions.id))
    .innerJoin(clubs, eq(clubs.id, teams.clubId))
    .where(eq(divisions.id, divisionId))
    .limit(1);
  if (!division) return null;

  const rows = await db
    .select({ game: games, homeTeamName: teams.name, venueName: venues.name })
    .from(games)
    .innerJoin(teams, eq(teams.id, games.homeTeamId))
    .innerJoin(venues, eq(venues.id, games.venueId))
    .where(
      and(eq(games.divisionId, divisionId), isNotNull(games.publishedAt), isNull(games.canceledAt)),
    )
    .orderBy(asc(games.startsAt));

  const awayNames = await db.select({ id: teams.id, name: teams.name }).from(teams);
  const nameOf = new Map(awayNames.map((t) => [t.id, t.name]));
  const tz = division.club.timezone;

  const days = new Map<string, { label: string; rows: { time: string; matchup: string; where: string }[] }>();
  for (const r of rows) {
    const key = r.game.localDate;
    const day = days.get(key) ?? { label: formatDayLabel(r.game.startsAt, tz), rows: [] };
    day.rows.push({
      time: formatClock(r.game.startsAt, tz),
      matchup: r.game.awayTeamId
        ? `${r.homeTeamName} v ${nameOf.get(r.game.awayTeamId) ?? "TBD"}`
        : `${r.homeTeamName} ${r.game.kind}`,
      where: `${r.venueName} · ${r.game.field}`,
    });
    days.set(key, day);
  }

  return {
    division: division.division,
    club: division.club,
    days: [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v),
  };
}
