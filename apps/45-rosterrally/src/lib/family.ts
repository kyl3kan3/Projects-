/**
 * Everything a family's own page shows, assembled in one place.
 *
 * This module is the entire read surface for data about children on a
 * parent-facing screen, and it takes exactly one identifier: a household id that
 * the caller has already proved with a signed link. There is no argument here for
 * "which family" beyond that, and no query in this file is unscoped.
 *
 * What it deliberately does NOT return:
 *
 *  - Any other household's email, phone or name.
 *  - Any other child's birthdate, medical note or emergency contact.
 *  - Teammate contact details of any kind. A teammate appears as a first name and
 *    last initial with a jersey number — enough to recognise a squad list on a
 *    Saturday, and nothing a stranger could use.
 *
 * The medical note for a family's OWN child is returned, because it is their own
 * information and they need to check it is right.
 */

import { and, asc, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  announcements,
  clubs,
  deliveries,
  divisions,
  games,
  households,
  players,
  registrations,
  rosterSpots,
  seasons,
  teams,
  venues,
  type Household,
} from "@/db/schema";
import { decryptContacts, decryptField } from "@/lib/crypto";
import { balanceCents, deriveState, type PaymentState } from "@/lib/ledger";
import { allocatedByRegistration, getHouseholdMoney } from "@/lib/registration";
import { mintTeamFeedToken } from "@/lib/links";
import { claimsForHousehold, openSlotsForHousehold, type SlotView } from "@/lib/volunteers";
import { formatClock, formatDayLabel } from "@/lib/time";

export interface FamilyChild {
  playerId: string;
  firstName: string;
  lastName: string;
  birthdate: string;
  divisionName: string;
  registrationId: string;
  state: PaymentState;
  balanceCents: number;
  amountCents: number;
  waitlistPosition: number | null;
  teamName: string | null;
  jerseyNumber: string | null;
  medicalNotes: string | null;
  emergencyContacts: { name: string; phone: string; relationship: string }[];
}

export interface FamilyGame {
  gameId: string;
  when: string;
  day: string;
  time: string;
  matchup: string;
  where: string;
  divisionName: string;
  note: string | null;
  canceled: boolean;
  /** Which of this family's children it involves. */
  childNames: string[];
}

export interface FamilyTeammate {
  /** "Mateo A." — a name a parent recognises, and nothing more. */
  displayName: string;
  jerseyNumber: string | null;
}

export interface FamilyMessage {
  subject: string;
  body: string;
  sentAt: Date | null;
  channel: string;
  status: string;
  openedAt: Date | null;
}

export interface FamilyPage {
  household: Household;
  club: { id: string; name: string; timezone: string; replyTo: string };
  seasonId: string;
  seasonName: string;
  children: FamilyChild[];
  games: FamilyGame[];
  teams: { teamId: string; teamName: string; divisionName: string; feedToken: string; roster: FamilyTeammate[] }[];
  messages: FamilyMessage[];
  openSlots: SlotView[];
  myClaims: SlotView[];
  money: Awaited<ReturnType<typeof getHouseholdMoney>>;
}

export async function getFamilyPage(householdId: string): Promise<FamilyPage | null> {
  const db = getDb();
  const [household] = await db.select().from(households).where(eq(households.id, householdId));
  if (!household) return null;
  const [club] = await db.select().from(clubs).where(eq(clubs.id, household.clubId));
  if (!club) return null;

  // The season this family is actually in, newest first.
  const regRows = await db
    .select({ reg: registrations, player: players, division: divisions, season: seasons })
    .from(registrations)
    .innerJoin(players, eq(players.id, registrations.playerId))
    .innerJoin(divisions, eq(divisions.id, registrations.divisionId))
    .innerJoin(seasons, eq(seasons.id, registrations.seasonId))
    .where(eq(registrations.householdId, householdId))
    .orderBy(desc(seasons.startsOn), asc(players.firstName));

  const seasonId = regRows[0]?.season.id ?? "";
  const seasonName = regRows[0]?.season.name ?? "";
  const current = regRows.filter((r) => r.season.id === seasonId);

  const allocated = await allocatedByRegistration(current.map((r) => r.reg.id));

  // Roster spots for this family's children only.
  const spots = current.length
    ? await db
        .select({ spot: rosterSpots, team: teams })
        .from(rosterSpots)
        .innerJoin(teams, eq(teams.id, rosterSpots.teamId))
        .where(
          inArray(
            rosterSpots.playerId,
            current.map((r) => r.player.id),
          ),
        )
    : [];

  const children: FamilyChild[] = current.map((r) => {
    const ledger = {
      id: r.reg.id,
      status: r.reg.status,
      amountCents: r.reg.amountCents,
      allocatedCents: allocated.get(r.reg.id) ?? 0,
      createdAt: r.reg.createdAt,
    };
    const spot = spots.find((s) => s.spot.playerId === r.player.id);
    return {
      playerId: r.player.id,
      firstName: r.player.firstName,
      lastName: r.player.lastName,
      birthdate: r.player.birthdate,
      divisionName: r.division.name,
      registrationId: r.reg.id,
      state: deriveState(ledger),
      balanceCents: balanceCents(ledger),
      amountCents: r.reg.amountCents,
      waitlistPosition: r.reg.waitlistPosition,
      teamName: spot?.team.name ?? null,
      jerseyNumber: spot?.spot.jerseyNumber ?? null,
      // Their own child's information, which is theirs to check.
      medicalNotes: decryptField(r.player.medicalNotesEnc),
      emergencyContacts: decryptContacts(r.player.emergencyContactsEnc),
    };
  });

  const myTeamIds = [...new Set(spots.map((s) => s.team.id))];

  // Published games for this family's teams only. A draft schedule is not a
  // promise, so it does not appear on a parent's page.
  const gameRows = myTeamIds.length
    ? await db
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
            isNotNull(games.publishedAt),
            or(inArray(games.homeTeamId, myTeamIds), inArray(games.awayTeamId, myTeamIds)),
          ),
        )
        .orderBy(asc(games.startsAt))
    : [];

  const opponentIds = [
    ...new Set(
      gameRows.flatMap((r) => [r.game.homeTeamId, r.game.awayTeamId].filter((id): id is string => Boolean(id))),
    ),
  ];
  const teamNames = opponentIds.length
    ? await db
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(inArray(teams.id, opponentIds))
    : [];
  const nameOf = new Map(teamNames.map((t) => [t.id, t.name]));

  const familyGames: FamilyGame[] = gameRows.map((r) => {
    const mine = myTeamIds.filter(
      (id) => r.game.homeTeamId === id || r.game.awayTeamId === id,
    );
    const childNames = children
      .filter((c) => c.teamName && mine.some((id) => nameOf.get(id) === c.teamName))
      .map((c) => c.firstName);
    const matchup = r.game.awayTeamId
      ? `${nameOf.get(r.game.homeTeamId) ?? r.homeTeamName} v ${nameOf.get(r.game.awayTeamId) ?? "TBD"}`
      : `${r.homeTeamName} ${r.game.kind}`;
    return {
      gameId: r.game.id,
      when: `${formatDayLabel(r.game.startsAt, club.timezone)} ${formatClock(r.game.startsAt, club.timezone)}`,
      day: formatDayLabel(r.game.startsAt, club.timezone),
      time: formatClock(r.game.startsAt, club.timezone),
      matchup,
      where: `${r.venueName} · ${r.game.field}`,
      divisionName: r.divisionName,
      note: r.game.note,
      canceled: Boolean(r.game.canceledAt),
      childNames,
    };
  });

  // Squad lists: first name + last initial + number. No contact details, ever.
  const rosterRows = myTeamIds.length
    ? await db
        .select({
          teamId: rosterSpots.teamId,
          firstName: players.firstName,
          lastName: players.lastName,
          jerseyNumber: rosterSpots.jerseyNumber,
          sortOrder: rosterSpots.sortOrder,
        })
        .from(rosterSpots)
        .innerJoin(players, eq(players.id, rosterSpots.playerId))
        .where(inArray(rosterSpots.teamId, myTeamIds))
        .orderBy(asc(rosterSpots.sortOrder))
    : [];

  const teamViews = await Promise.all(
    myTeamIds.map(async (teamId) => {
      const spot = spots.find((s) => s.team.id === teamId)!;
      const [division] = await db
        .select({ name: divisions.name })
        .from(divisions)
        .where(eq(divisions.id, spot.team.divisionId));
      return {
        teamId,
        teamName: spot.team.name,
        divisionName: division?.name ?? "",
        feedToken: await mintTeamFeedToken(teamId),
        roster: rosterRows
          .filter((r) => r.teamId === teamId)
          .map((r) => ({
            displayName: `${r.firstName} ${r.lastName.slice(0, 1)}.`,
            jerseyNumber: r.jerseyNumber,
          })),
      };
    }),
  );

  // Their own inbox, and only their own.
  const messageRows = await db
    .select({ announcement: announcements, delivery: deliveries })
    .from(deliveries)
    .innerJoin(announcements, eq(announcements.id, deliveries.announcementId))
    .where(eq(deliveries.householdId, householdId))
    .orderBy(desc(deliveries.createdAt))
    .limit(40);

  const messages: FamilyMessage[] = messageRows.map((r) => ({
    subject: r.announcement.subject,
    body: r.announcement.body,
    sentAt: r.delivery.sentAt,
    channel: r.delivery.channel,
    status: r.delivery.status,
    openedAt: r.delivery.openedAt ?? r.delivery.clickedAt,
  }));

  return {
    household,
    club: {
      id: club.id,
      name: club.name,
      timezone: club.timezone,
      replyTo: club.settings?.replyToEmail ?? "",
    },
    seasonId,
    seasonName,
    children,
    games: familyGames,
    teams: teamViews,
    messages,
    openSlots: seasonId ? await openSlotsForHousehold(seasonId, householdId) : [],
    myClaims: seasonId ? await claimsForHousehold(seasonId, householdId) : [],
    money: await getHouseholdMoney(householdId),
  };
}

/** The outstanding-balance list a family's Pay button needs. */
export async function outstandingForHousehold(householdId: string) {
  const db = getDb();
  const rows = await db
    .select({ reg: registrations, player: players, division: divisions })
    .from(registrations)
    .innerJoin(players, eq(players.id, registrations.playerId))
    .innerJoin(divisions, eq(divisions.id, registrations.divisionId))
    .where(
      and(
        eq(registrations.householdId, householdId),
        eq(registrations.status, "active"),
        isNull(registrations.canceledAt),
      ),
    )
    .orderBy(asc(registrations.createdAt));
  const allocated = await allocatedByRegistration(rows.map((r) => r.reg.id));
  return rows
    .map((r) => ({
      registrationId: r.reg.id,
      label: `${r.player.firstName} ${r.player.lastName} — ${r.division.name}`,
      balanceCents: balanceCents({
        id: r.reg.id,
        status: r.reg.status,
        amountCents: r.reg.amountCents,
        allocatedCents: allocated.get(r.reg.id) ?? 0,
        createdAt: r.reg.createdAt,
      }),
      platformFeeCents: r.reg.platformFeeCents,
    }))
    .filter((r) => r.balanceCents > 0);
}
