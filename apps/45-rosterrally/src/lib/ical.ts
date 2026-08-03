/**
 * Calendar out: one read-only iCal feed per team, and the printable schedule.
 *
 * The document assembly itself lives in `lib/ics.ts`, which is pure and directly
 * tested. This module is the part that needs the database.
 */

import { and, asc, eq, isNotNull, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { clubs, divisions, games, teams, venues } from "@/db/schema";
import { buildIcs, type FeedEvent } from "@/lib/ics";
import { formatClock, formatDayLabel } from "@/lib/time";

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
