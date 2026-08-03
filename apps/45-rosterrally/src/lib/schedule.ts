/**
 * Schedule building and publishing — the wrapper that feeds the pure conflict
 * checker from the database and refuses to email a broken schedule.
 *
 * Times are written once, on the way in: the registrar types a club-local wall
 * time, `wallTimeToInstant` resolves it against the club's IANA zone, and both
 * the instant and the typed wall time are stored. Reads render the wall time;
 * comparisons use the instant. Nothing downstream has to think about DST.
 *
 * `checkSeason` persists findings so the console can show the pennant, mark a
 * soft conflict as overridden, and — the signature detail in DESIGN.md — resolve
 * a row when a re-check no longer finds it.
 */

import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clubs,
  divisions,
  gameReminders,
  games,
  scheduleConflicts,
  seasons,
  teams,
  venues,
  type Game,
  type GameKind,
  type ScheduleConflict,
  type Venue,
} from "@/db/schema";
import { audit, type Actor } from "@/lib/audit";
import {
  detectConflicts,
  publishGate,
  type ConflictFinding,
  type ScheduleEntry,
} from "@/lib/conflicts";
import { remindersToSchedule } from "@/lib/notices";
import { coachesByTeam, householdsByTeam } from "@/lib/rosters";
import {
  addMinutes,
  formatClock,
  formatDayLabel,
  wallTimeExists,
  wallTimeToInstant,
  type IsoDate,
} from "@/lib/time";

/* ------------------------------------------------------------------ venues --- */

export async function listVenues(clubId: string): Promise<Venue[]> {
  return getDb().select().from(venues).where(eq(venues.clubId, clubId)).orderBy(asc(venues.name));
}

export async function createVenue(
  clubId: string,
  name: string,
  fields: string[],
  address: string | null,
): Promise<Venue> {
  const clean = fields.map((f) => f.trim()).filter(Boolean);
  const [venue] = await getDb()
    .insert(venues)
    .values({
      clubId,
      name: name.trim(),
      address,
      fields: clean.length > 0 ? clean : ["Field 1"],
    })
    .returning();
  return venue;
}

export async function deleteVenue(clubId: string, venueId: string): Promise<void> {
  const db = getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(games)
    .where(eq(games.venueId, venueId));
  if (Number(n) > 0) throw new Error("That venue has games on the schedule");
  await db.delete(venues).where(and(eq(venues.id, venueId), eq(venues.clubId, clubId)));
}

/* ------------------------------------------------------------------- games --- */

export interface GameInput {
  seasonId: string;
  divisionId: string;
  homeTeamId: string;
  awayTeamId: string | null;
  venueId: string;
  field: string;
  kind: GameKind;
  localDate: IsoDate;
  localTime: string;
  durationMinutes: number;
  note?: string | null;
}

export async function createGame(clubId: string, input: GameInput, actor: Actor): Promise<Game> {
  const db = getDb();
  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId));
  if (!club) throw new Error("No such club");
  if (input.awayTeamId && input.awayTeamId === input.homeTeamId) {
    throw new Error("A team cannot play itself");
  }
  if (input.durationMinutes < 5) throw new Error("Give the game a length of at least 5 minutes");
  if (!wallTimeExists(input.localDate, input.localTime, club.timezone)) {
    throw new Error(
      `${input.localTime} does not exist on ${input.localDate} in ${club.timezone} — the clocks go forward that morning. Pick another time.`,
    );
  }

  const startsAt = wallTimeToInstant(input.localDate, input.localTime, club.timezone);
  const [game] = await db
    .insert(games)
    .values({
      clubId,
      seasonId: input.seasonId,
      divisionId: input.divisionId,
      homeTeamId: input.homeTeamId,
      awayTeamId: input.awayTeamId,
      venueId: input.venueId,
      field: input.field,
      kind: input.kind,
      startsAt,
      endsAt: addMinutes(startsAt, input.durationMinutes),
      localDate: input.localDate,
      localTime: input.localTime,
      durationMinutes: input.durationMinutes,
      note: input.note ?? null,
    })
    .returning();
  await audit(clubId, actor, "game_created", `game:${game.id}`, {
    localDate: input.localDate,
    localTime: input.localTime,
  });
  await checkSeason(input.seasonId);
  return game;
}

/**
 * Move or re-time a game.
 *
 * A published game that changes bumps its `revision`, which cancels every
 * reminder that described the old version and schedules fresh ones. That is what
 * stops a family getting a T-3h text for a game that moved yesterday.
 */
export async function updateGame(
  gameId: string,
  patch: Partial<
    Pick<
      GameInput,
      "venueId" | "field" | "localDate" | "localTime" | "durationMinutes" | "note" | "awayTeamId"
    >
  >,
  actor: Actor,
): Promise<{ game: Game; wasPublished: boolean }> {
  const db = getDb();
  const [row] = await db
    .select({ game: games, club: clubs })
    .from(games)
    .innerJoin(clubs, eq(clubs.id, games.clubId))
    .where(eq(games.id, gameId));
  if (!row) throw new Error("No such game");

  const localDate = patch.localDate ?? row.game.localDate;
  const localTime = patch.localTime ?? row.game.localTime;
  const duration = patch.durationMinutes ?? row.game.durationMinutes;
  if (!wallTimeExists(localDate, localTime, row.club.timezone)) {
    throw new Error(
      `${localTime} does not exist on ${localDate} in ${row.club.timezone} — the clocks go forward that morning.`,
    );
  }
  const startsAt = wallTimeToInstant(localDate, localTime, row.club.timezone);

  const [game] = await db
    .update(games)
    .set({
      venueId: patch.venueId ?? row.game.venueId,
      field: patch.field ?? row.game.field,
      awayTeamId: patch.awayTeamId === undefined ? row.game.awayTeamId : patch.awayTeamId,
      note: patch.note === undefined ? row.game.note : patch.note,
      localDate,
      localTime,
      durationMinutes: duration,
      startsAt,
      endsAt: addMinutes(startsAt, duration),
      revision: row.game.revision + 1,
    })
    .where(eq(games.id, gameId))
    .returning();

  // Void the notices that described the previous revision.
  await db
    .update(gameReminders)
    .set({ canceledAt: new Date() })
    .where(
      and(
        eq(gameReminders.gameId, gameId),
        ne(gameReminders.gameRevision, game.revision),
        isNull(gameReminders.sentAt),
        isNull(gameReminders.canceledAt),
      ),
    );

  await audit(row.game.clubId, actor, "game_updated", `game:${gameId}`, { localDate, localTime });
  await checkSeason(row.game.seasonId);
  if (game.publishedAt) await scheduleRemindersForGame(game);
  return { game, wasPublished: Boolean(game.publishedAt) };
}

export async function cancelGame(gameId: string, actor: Actor): Promise<void> {
  const db = getDb();
  const [game] = await db.select().from(games).where(eq(games.id, gameId));
  if (!game) return;
  await db.update(games).set({ canceledAt: new Date() }).where(eq(games.id, gameId));
  await db
    .update(gameReminders)
    .set({ canceledAt: new Date() })
    .where(and(eq(gameReminders.gameId, gameId), isNull(gameReminders.sentAt)));
  await audit(game.clubId, actor, "game_canceled", `game:${gameId}`);
  await checkSeason(game.seasonId);
}

export async function deleteGame(gameId: string, actor: Actor): Promise<void> {
  const db = getDb();
  const [game] = await db.select().from(games).where(eq(games.id, gameId));
  if (!game) return;
  await db.delete(games).where(eq(games.id, gameId));
  await audit(game.clubId, actor, "game_deleted", `game:${gameId}`);
  await checkSeason(game.seasonId);
}

/* ------------------------------------------------------------- reading it --- */

export interface ScheduleRow {
  game: Game;
  divisionName: string;
  homeTeamName: string;
  awayTeamName: string | null;
  venueName: string;
  /** Findings that touch this game, so a row can carry its pennant. */
  conflicts: ScheduleConflict[];
}

export interface ScheduleDay {
  /** "SAT SEP 12" */
  label: string;
  localDate: IsoDate;
  rows: ScheduleRow[];
}

export async function getSchedule(
  seasonId: string,
  options: { from?: IsoDate; to?: IsoDate; teamIds?: string[]; publishedOnly?: boolean } = {},
): Promise<{ days: ScheduleDay[]; conflicts: ScheduleConflict[]; timezone: string }> {
  const db = getDb();
  const [meta] = await db
    .select({ season: seasons, club: clubs })
    .from(seasons)
    .innerJoin(clubs, eq(clubs.id, seasons.clubId))
    .where(eq(seasons.id, seasonId));
  if (!meta) return { days: [], conflicts: [], timezone: "America/New_York" };

  const rows = await db
    .select({
      game: games,
      divisionName: divisions.name,
      homeTeamName: teams.name,
      venueName: venues.name,
    })
    .from(games)
    .innerJoin(divisions, eq(divisions.id, games.divisionId))
    .innerJoin(teams, eq(teams.id, games.homeTeamId))
    .innerJoin(venues, eq(venues.id, games.venueId))
    .where(
      and(
        eq(games.seasonId, seasonId),
        isNull(games.canceledAt),
        options.publishedOnly ? isNotNull(games.publishedAt) : undefined,
        options.from ? gte(games.localDate, options.from) : undefined,
        options.to ? lte(games.localDate, options.to) : undefined,
      ),
    )
    .orderBy(asc(games.startsAt));

  const awayIds = rows.map((r) => r.game.awayTeamId).filter((id): id is string => Boolean(id));
  const awayNames = awayIds.length
    ? await db
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(inArray(teams.id, awayIds))
    : [];

  const conflicts = await listConflicts(seasonId);

  const filtered = options.teamIds?.length
    ? rows.filter(
        (r) =>
          options.teamIds!.includes(r.game.homeTeamId) ||
          (r.game.awayTeamId ? options.teamIds!.includes(r.game.awayTeamId) : false),
      )
    : rows;

  const byDay = new Map<string, ScheduleDay>();
  for (const r of filtered) {
    const day = byDay.get(r.game.localDate) ?? {
      label: formatDayLabel(r.game.startsAt, meta.club.timezone),
      localDate: r.game.localDate,
      rows: [],
    };
    day.rows.push({
      game: r.game,
      divisionName: r.divisionName,
      homeTeamName: r.homeTeamName,
      awayTeamName: r.game.awayTeamId
        ? (awayNames.find((a) => a.id === r.game.awayTeamId)?.name ?? null)
        : null,
      venueName: r.venueName,
      conflicts: conflicts.filter((c) => c.gameIds.includes(r.game.id)),
    });
    byDay.set(r.game.localDate, day);
  }

  return {
    days: [...byDay.values()].sort((a, b) => a.localDate.localeCompare(b.localDate)),
    conflicts,
    timezone: meta.club.timezone,
  };
}

export function describeGame(row: {
  homeTeamName: string;
  awayTeamName: string | null;
  game: Pick<Game, "kind">;
}): string {
  if (row.awayTeamName) return `${row.homeTeamName} v ${row.awayTeamName}`;
  const label =
    row.game.kind === "practice" ? "practice" : row.game.kind === "event" ? "event" : "game";
  return `${row.homeTeamName} ${label}`;
}

/* ------------------------------------------------------- the conflict gate --- */

/** Load a season's schedule as the pure checker's input shape. */
export async function buildEntries(
  seasonId: string,
): Promise<{ entries: ScheduleEntry[]; timezone: string }> {
  const db = getDb();
  const [meta] = await db
    .select({ club: clubs })
    .from(seasons)
    .innerJoin(clubs, eq(clubs.id, seasons.clubId))
    .where(eq(seasons.id, seasonId));
  const timezone = meta?.club.timezone ?? "America/New_York";

  const rows = await db
    .select({
      game: games,
      divisionName: divisions.name,
      homeTeamName: teams.name,
      venueName: venues.name,
    })
    .from(games)
    .innerJoin(divisions, eq(divisions.id, games.divisionId))
    .innerJoin(teams, eq(teams.id, games.homeTeamId))
    .innerJoin(venues, eq(venues.id, games.venueId))
    .where(and(eq(games.seasonId, seasonId), isNull(games.canceledAt)));

  const allTeamIds = new Set<string>();
  for (const r of rows) {
    allTeamIds.add(r.game.homeTeamId);
    if (r.game.awayTeamId) allTeamIds.add(r.game.awayTeamId);
  }
  const teamNames = allTeamIds.size
    ? await db
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(inArray(teams.id, [...allTeamIds]))
    : [];
  const nameOf = new Map(teamNames.map((t) => [t.id, t.name]));
  const coaches = await coachesByTeam(seasonId);
  const families = await householdsByTeam(seasonId);

  const entries: ScheduleEntry[] = rows.map((r) => {
    const teamIds = [r.game.homeTeamId, ...(r.game.awayTeamId ? [r.game.awayTeamId] : [])];
    const coachList: { id: string; name: string }[] = [];
    const familyList: { id: string; label: string }[] = [];
    for (const id of teamIds) {
      for (const c of coaches.get(id) ?? []) {
        if (!coachList.some((x) => x.id === c.id)) coachList.push(c);
      }
      for (const h of families.get(id) ?? []) {
        if (!familyList.some((x) => x.id === h.id)) familyList.push(h);
      }
    }
    return {
      id: r.game.id,
      kind: r.game.kind,
      divisionId: r.game.divisionId,
      divisionName: r.divisionName,
      teams: teamIds.map((id) => ({ id, name: nameOf.get(id) ?? "Team" })),
      coaches: coachList,
      households: familyList,
      venueId: r.game.venueId,
      venueName: r.venueName,
      field: r.game.field,
      startsAt: r.game.startsAt,
      endsAt: r.game.endsAt,
    };
  });

  return { entries, timezone };
}

/**
 * Re-run the checker and reconcile the stored findings.
 *
 * A finding that is still there keeps its row (and therefore its override). A
 * finding that has gone is stamped `resolved_at` rather than deleted, which is
 * what lets the schedule screen clear the pennant and still keep an honest record
 * of what was wrong an hour ago.
 */
export async function checkSeason(seasonId: string): Promise<ConflictFinding[]> {
  const db = getDb();
  const { entries, timezone } = await buildEntries(seasonId);
  const findings = detectConflicts(entries, timezone);
  const live = new Set(findings.map((f) => f.fingerprint));

  for (const finding of findings) {
    await db
      .insert(scheduleConflicts)
      .values({
        seasonId,
        severity: finding.severity,
        kind: finding.kind,
        gameIds: finding.gameIds,
        explanation: finding.explanation,
        fingerprint: finding.fingerprint,
      })
      .onConflictDoUpdate({
        target: [scheduleConflicts.seasonId, scheduleConflicts.fingerprint],
        // Re-appearing after a resolve clears the resolution but keeps the
        // override: a registrar who accepted a coach clash should not have to
        // accept it again because a different game moved.
        set: { explanation: finding.explanation, resolvedAt: null },
      });
  }

  const stored = await db
    .select()
    .from(scheduleConflicts)
    .where(and(eq(scheduleConflicts.seasonId, seasonId), isNull(scheduleConflicts.resolvedAt)));
  const goneIds = stored.filter((s) => !live.has(s.fingerprint)).map((s) => s.id);
  if (goneIds.length > 0) {
    await db
      .update(scheduleConflicts)
      .set({ resolvedAt: new Date() })
      .where(inArray(scheduleConflicts.id, goneIds));
  }

  return findings;
}

export async function listConflicts(seasonId: string): Promise<ScheduleConflict[]> {
  return getDb()
    .select()
    .from(scheduleConflicts)
    .where(and(eq(scheduleConflicts.seasonId, seasonId), isNull(scheduleConflicts.resolvedAt)))
    .orderBy(asc(scheduleConflicts.severity), asc(scheduleConflicts.createdAt));
}

export async function overrideConflict(
  conflictId: string,
  actor: Actor,
  clubId: string,
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(scheduleConflicts)
    .where(eq(scheduleConflicts.id, conflictId));
  if (!row) return;
  if (row.severity === "hard") {
    throw new Error(
      "A hard conflict cannot be overridden — two teams cannot use one field. Move one of the games.",
    );
  }
  await db
    .update(scheduleConflicts)
    .set({
      overriddenAt: new Date(),
      overriddenByUserId: actor.kind === "user" ? actor.id : null,
    })
    .where(eq(scheduleConflicts.id, conflictId));
  await audit(clubId, actor, "conflict_overridden", `conflict:${conflictId}`, {
    kind: row.kind,
    explanation: row.explanation,
  });
}

export interface GateState {
  ok: boolean;
  hard: ScheduleConflict[];
  needsOverride: ScheduleConflict[];
  overridden: ScheduleConflict[];
  unpublishedCount: number;
}

export async function getGateState(seasonId: string): Promise<GateState> {
  const db = getDb();
  const findings = await checkSeason(seasonId);
  const stored = await listConflicts(seasonId);
  const gate = publishGate(
    findings,
    stored.filter((s) => s.overriddenAt).map((s) => s.fingerprint),
  );
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(games)
    .where(and(eq(games.seasonId, seasonId), isNull(games.publishedAt), isNull(games.canceledAt)));
  return {
    ok: gate.ok,
    hard: stored.filter((s) => s.severity === "hard"),
    needsOverride: stored.filter((s) => s.severity === "soft" && !s.overriddenAt),
    overridden: stored.filter((s) => Boolean(s.overriddenAt)),
    unpublishedCount: Number(n),
  };
}

export interface PublishResult {
  published: number;
  blocked: GateState | null;
  /** Teams whose games changed — the fan-out targets exactly these. */
  teamIds: string[];
}

/**
 * Publish everything unpublished in a season, through the gate.
 *
 * The gate is the product. Hard conflicts stop the publish outright; soft ones
 * stop it until a registrar has said "yes, I know" to each. Only after that do
 * games get a `published_at`, reminders get scheduled, and an announcement is
 * allowed to go out — in that order, so a family never gets a notice about a game
 * the schedule does not yet admit to.
 */
export async function publishSchedule(
  seasonId: string,
  actor: Actor,
  clubId: string,
): Promise<PublishResult> {
  const db = getDb();
  const gate = await getGateState(seasonId);
  if (!gate.ok) return { published: 0, blocked: gate, teamIds: [] };

  const pending = await db
    .select()
    .from(games)
    .where(and(eq(games.seasonId, seasonId), isNull(games.publishedAt), isNull(games.canceledAt)));

  const now = new Date();
  if (pending.length > 0) {
    await db
      .update(games)
      .set({ publishedAt: now })
      .where(
        inArray(
          games.id,
          pending.map((g) => g.id),
        ),
      );
  }

  for (const game of pending) {
    await scheduleRemindersForGame({ ...game, publishedAt: now });
  }

  const teamIds = [
    ...new Set(
      pending.flatMap((g) => [g.homeTeamId, ...(g.awayTeamId ? [g.awayTeamId] : [])]),
    ),
  ];

  await audit(clubId, actor, "schedule_published", `season:${seasonId}`, {
    games: pending.length,
  });
  return { published: pending.length, blocked: null, teamIds };
}

/* ------------------------------------------------------------- reminders --- */

/**
 * Materialise this game's reminders at fixed distances from kick-off.
 *
 * Fixed distances, not "is it soon": a condition that stays true forever mails
 * forever. A row per (game, rung, revision) with a unique index means a double
 * publish schedules nothing extra, and a game that moves gets a new revision
 * whose rungs are distinct from the cancelled ones.
 */
export async function scheduleRemindersForGame(game: Game): Promise<void> {
  const db = getDb();
  // `remindersToSchedule` decides which rungs still make sense (lib/notices.ts):
  // a game already inside a window gets no notice for that rung rather than an
  // instant one.
  for (const { rung, sendAfter } of remindersToSchedule(game.startsAt)) {
    await db
      .insert(gameReminders)
      .values({
        clubId: game.clubId,
        gameId: game.id,
        rung: rung.rung,
        channel: rung.channel,
        sendAfter,
        gameRevision: game.revision,
      })
      .onConflictDoNothing({
        target: [gameReminders.gameId, gameReminders.rung, gameReminders.gameRevision],
      });
  }
}

/**
 * Reminders that are due now and still valid.
 *
 * The revision check is the important part: a reminder describing revision 2 of a
 * game now on revision 3 is silently dropped, so a moved game never texts the old
 * time. The due comparison is left to Postgres rather than a JS `Date` — a
 * millisecond-truncated timestamp compared against a microsecond one is how a
 * sweep finds work it can then never claim.
 */
export async function dueReminders(limit = 200) {
  return getDb()
    .select({ reminder: gameReminders, game: games })
    .from(gameReminders)
    .innerJoin(games, eq(games.id, gameReminders.gameId))
    .where(
      and(
        isNull(gameReminders.sentAt),
        isNull(gameReminders.canceledAt),
        isNull(games.canceledAt),
        isNotNull(games.publishedAt),
        eq(gameReminders.gameRevision, games.revision),
        sql`${gameReminders.sendAfter} <= now()`,
      ),
    )
    .orderBy(asc(gameReminders.sendAfter))
    .limit(limit);
}

export async function markReminderSent(reminderId: string): Promise<void> {
  await getDb()
    .update(gameReminders)
    .set({ sentAt: new Date() })
    .where(eq(gameReminders.id, reminderId));
}

/** Pending reminders for a game, so the console can show what is queued. */
export async function pendingReminders(seasonId: string) {
  return getDb()
    .select({ reminder: gameReminders, game: games })
    .from(gameReminders)
    .innerJoin(games, eq(games.id, gameReminders.gameId))
    .where(
      and(
        eq(games.seasonId, seasonId),
        isNull(gameReminders.sentAt),
        isNull(gameReminders.canceledAt),
        eq(gameReminders.gameRevision, games.revision),
      ),
    )
    .orderBy(asc(gameReminders.sendAfter));
}

/* ------------------------------------------------------------- CSV import --- */

export interface ImportRow {
  line: number;
  divisionId: string;
  divisionName: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string | null;
  awayTeamName: string;
  venueId: string;
  venueName: string;
  field: string;
  localDate: string;
  localTime: string;
  durationMinutes: number;
  kind: GameKind;
}

export interface ImportPreview {
  ok: ImportRow[];
  errors: { line: number; message: string }[];
}

export const CSV_HEADER = "division,home,away,venue,field,date,time,minutes";

/**
 * Parse a schedule CSV into resolved rows, with a reason per bad line. Nothing is
 * written: the registrar sees the preview, and the same engine backs the free
 * conflict-checker lead magnet.
 */
export async function previewCsvImport(
  clubId: string,
  seasonId: string,
  csv: string,
): Promise<ImportPreview> {
  const db = getDb();
  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId));
  const timezone = club?.timezone ?? "America/New_York";

  const divs = await db.select().from(divisions).where(eq(divisions.seasonId, seasonId));
  const teamRows = await db
    .select({ team: teams, divisionId: divisions.id })
    .from(teams)
    .innerJoin(divisions, eq(divisions.id, teams.divisionId))
    .where(eq(divisions.seasonId, seasonId));
  const venueRows = await listVenues(clubId);

  const lines = csv.trim().split(/\r?\n/);
  const errors: ImportPreview["errors"] = [];
  const ok: ImportRow[] = [];
  if (lines.length < 2) {
    return { ok, errors: [{ line: 1, message: "The file has no rows under its header" }] };
  }

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const need = ["division", "home", "away", "venue", "field", "date", "time", "minutes"];
  const missing = need.filter((n) => !header.includes(n));
  if (missing.length > 0) {
    return {
      ok,
      errors: [
        {
          line: 1,
          message: `The header is missing: ${missing.join(", ")}. Expected: ${CSV_HEADER}`,
        },
      ],
    };
  }
  const at = (cols: string[], name: string) => (cols[header.indexOf(name)] ?? "").trim();

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = lines[i].split(",");
    const divisionName = at(cols, "division");
    const homeTeamName = at(cols, "home");
    const awayTeamName = at(cols, "away");
    const venueName = at(cols, "venue");
    const field = at(cols, "field");
    const localDate = at(cols, "date");
    const localTime = at(cols, "time");
    const minutes = Number(at(cols, "minutes") || 90);

    const division = divs.find((d) => d.name.toLowerCase() === divisionName.toLowerCase());
    if (!division) {
      errors.push({ line: i + 1, message: `No division called "${divisionName}"` });
      continue;
    }
    const home = teamRows.find(
      (t) =>
        t.divisionId === division.id && t.team.name.toLowerCase() === homeTeamName.toLowerCase(),
    );
    if (!home) {
      errors.push({ line: i + 1, message: `No team "${homeTeamName}" in ${division.name}` });
      continue;
    }
    let awayId: string | null = null;
    if (awayTeamName) {
      const away = teamRows.find(
        (t) =>
          t.divisionId === division.id && t.team.name.toLowerCase() === awayTeamName.toLowerCase(),
      );
      if (!away) {
        errors.push({ line: i + 1, message: `No team "${awayTeamName}" in ${division.name}` });
        continue;
      }
      awayId = away.team.id;
    }
    const venue = venueRows.find((v) => v.name.toLowerCase() === venueName.toLowerCase());
    if (!venue) {
      errors.push({ line: i + 1, message: `No venue called "${venueName}"` });
      continue;
    }
    if (field && !venue.fields.some((f) => f.toLowerCase() === field.toLowerCase())) {
      errors.push({ line: i + 1, message: `${venue.name} has no field called "${field}"` });
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
      errors.push({ line: i + 1, message: `"${localDate}" is not a date (use YYYY-MM-DD)` });
      continue;
    }
    if (!/^\d{1,2}:\d{2}$/.test(localTime)) {
      errors.push({ line: i + 1, message: `"${localTime}" is not a time (use HH:MM)` });
      continue;
    }
    if (!wallTimeExists(localDate, localTime, timezone)) {
      errors.push({
        line: i + 1,
        message: `${localTime} does not exist on ${localDate} in ${timezone} (the clocks go forward)`,
      });
      continue;
    }
    if (!Number.isFinite(minutes) || minutes < 5) {
      errors.push({ line: i + 1, message: `"${at(cols, "minutes")}" is not a length in minutes` });
      continue;
    }
    ok.push({
      line: i + 1,
      divisionId: division.id,
      divisionName: division.name,
      homeTeamId: home.team.id,
      homeTeamName: home.team.name,
      awayTeamId: awayId,
      awayTeamName,
      venueId: venue.id,
      venueName: venue.name,
      field: field || venue.fields[0],
      localDate,
      localTime,
      durationMinutes: minutes,
      kind: awayId ? "game" : "practice",
    });
  }
  return { ok, errors };
}

/** Commit a previewed import. Unpublished, so the gate still has to pass. */
export async function commitCsvImport(
  clubId: string,
  seasonId: string,
  rows: readonly ImportRow[],
  actor: Actor,
): Promise<number> {
  let created = 0;
  for (const row of rows) {
    await createGame(
      clubId,
      {
        seasonId,
        divisionId: row.divisionId,
        homeTeamId: row.homeTeamId,
        awayTeamId: row.awayTeamId,
        venueId: row.venueId,
        field: row.field,
        kind: row.kind,
        localDate: row.localDate,
        localTime: row.localTime,
        durationMinutes: row.durationMinutes,
      },
      actor,
    );
    created += 1;
  }
  return created;
}

/* --------------------------------------------------------------- next up --- */

/** The next few games for the console's "NEXT UP" block. */
export async function upcomingGames(seasonId: string, limit = 4) {
  const db = getDb();
  return db
    .select({
      game: games,
      divisionName: divisions.name,
      homeTeamName: teams.name,
      venueName: venues.name,
    })
    .from(games)
    .innerJoin(divisions, eq(divisions.id, games.divisionId))
    .innerJoin(teams, eq(teams.id, games.homeTeamId))
    .innerJoin(venues, eq(venues.id, games.venueId))
    .where(
      and(
        eq(games.seasonId, seasonId),
        isNull(games.canceledAt),
        // Let Postgres do the comparison: a JS Date rounds to milliseconds and a
        // timestamptz keeps microseconds.
        sql`${games.startsAt} >= now() - interval '3 hours'`,
      ),
    )
    .orderBy(asc(games.startsAt))
    .limit(limit);
}

export function gameWhen(game: Game, timezone: string): string {
  return `${formatDayLabel(game.startsAt, timezone)} ${formatClock(game.startsAt, timezone)}`;
}
