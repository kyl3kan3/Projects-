/**
 * Roster building, with guardrails that make the volunteer mistakes impossible
 * rather than merely discouraged.
 *
 * Every guardrail exists twice on purpose: as a checked violation with a sentence
 * a registrar can act on, and as a unique index in the schema. The check gives a
 * good error; the index is what holds when two people build rosters from two
 * phones at the same time.
 *
 * The medical rule lives here, not in the UI. `getRoster` takes the caller's role
 * and a coach-scoped read never selects `medical_notes_enc` or
 * `emergency_contacts_enc` at all — there is no ciphertext in a coach's response
 * to accidentally render, and no branch in a template that could get inverted.
 */

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  divisions,
  households,
  paymentSchedules,
  players,
  registrations,
  rosterSpots,
  teams,
  teamStaff,
  users,
  type StaffRole,
  type Team,
} from "@/db/schema";
import { audit, type Actor } from "@/lib/audit";
import { isTeamScoped } from "@/lib/auth";
import { decryptContacts, decryptField } from "@/lib/crypto";
import { allocatedByRegistration } from "@/lib/registration";
import { balanceCents, deriveState, type PaymentState } from "@/lib/ledger";

export interface RosterViolation {
  kind:
    | "unpaid"
    | "already_on_team"
    | "already_in_division"
    | "capacity"
    | "locked"
    | "jersey_taken"
    | "not_registered";
  message: string;
}

/* -------------------------------------------------------------- the pool --- */

export interface PoolPlayer {
  registrationId: string;
  playerId: string;
  firstName: string;
  lastName: string;
  birthdate: string;
  state: PaymentState;
  balanceCents: number;
  /** Team the player is already on in this division, if any. */
  teamId: string | null;
  teamName: string | null;
}

/**
 * Every active registration in a division, with whether it is rostered yet.
 *
 * Unpaid registrations are included rather than hidden: a registrar building
 * rosters on a Tuesday night needs to see the child whose parent's cheque is in
 * the post, and decide. What they cannot do is roster them silently — assignment
 * refuses until some money has arrived or the family is on a plan.
 */
export async function getPool(divisionId: string): Promise<PoolPlayer[]> {
  const db = getDb();
  const rows = await db
    .select({
      reg: registrations,
      player: players,
      spot: rosterSpots,
      team: teams,
    })
    .from(registrations)
    .innerJoin(players, eq(players.id, registrations.playerId))
    .leftJoin(
      rosterSpots,
      and(eq(rosterSpots.playerId, registrations.playerId), eq(rosterSpots.divisionId, divisionId)),
    )
    .leftJoin(teams, eq(teams.id, rosterSpots.teamId))
    .where(and(eq(registrations.divisionId, divisionId), eq(registrations.status, "active")))
    .orderBy(asc(players.lastName), asc(players.firstName));

  const allocated = await allocatedByRegistration(rows.map((r) => r.reg.id));
  return rows.map((r) => {
    const ledger = {
      id: r.reg.id,
      status: r.reg.status,
      amountCents: r.reg.amountCents,
      allocatedCents: allocated.get(r.reg.id) ?? 0,
      createdAt: r.reg.createdAt,
    };
    return {
      registrationId: r.reg.id,
      playerId: r.player.id,
      firstName: r.player.firstName,
      lastName: r.player.lastName,
      birthdate: r.player.birthdate,
      state: deriveState(ledger),
      balanceCents: balanceCents(ledger),
      teamId: r.spot?.teamId ?? null,
      teamName: r.team?.name ?? null,
    };
  });
}

/* ------------------------------------------------------------ assignment --- */

/**
 * Put a player on a team. Returns the violations that stopped it; an empty array
 * means it happened. Never throws for a rule the registrar can fix — a thrown
 * string in a drag-and-drop builder is a dead end.
 */
export async function assignPlayer(
  teamId: string,
  playerId: string,
  actor: Actor,
): Promise<RosterViolation[]> {
  const db = getDb();
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return [{ kind: "not_registered", message: "That team no longer exists" }];

  if (team.rosterLockedAt) {
    return [
      {
        kind: "locked",
        message: `${team.name}'s roster is locked. An admin can unlock it from the roster screen.`,
      },
    ];
  }

  const [reg] = await db
    .select()
    .from(registrations)
    .where(
      and(
        eq(registrations.divisionId, team.divisionId),
        eq(registrations.playerId, playerId),
        eq(registrations.status, "active"),
      ),
    );
  if (!reg) {
    return [
      {
        kind: "not_registered",
        message: "That player has no active registration in this division",
      },
    ];
  }

  const allocated = (await allocatedByRegistration([reg.id])).get(reg.id) ?? 0;
  const [plan] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(paymentSchedules)
    .where(and(eq(paymentSchedules.registrationId, reg.id), isNull(paymentSchedules.canceledAt)));
  const onPlan = Number(plan?.n ?? 0) > 0;
  if (allocated <= 0 && !onPlan && reg.amountCents > 0) {
    return [
      {
        kind: "unpaid",
        message:
          "Nothing has been paid for this registration yet. Take a payment, start an installment plan, or record a cheque first.",
      },
    ];
  }

  const [existing] = await db
    .select({ spot: rosterSpots, team: teams })
    .from(rosterSpots)
    .innerJoin(teams, eq(teams.id, rosterSpots.teamId))
    .where(and(eq(rosterSpots.divisionId, team.divisionId), eq(rosterSpots.playerId, playerId)));
  if (existing) {
    if (existing.spot.teamId === teamId) {
      return [{ kind: "already_on_team", message: "Already on this team" }];
    }
    return [
      {
        kind: "already_in_division",
        message: `Already on ${existing.team.name} in this division. Remove them there first.`,
      },
    ];
  }

  const [{ n: rostered }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rosterSpots)
    .where(eq(rosterSpots.teamId, teamId));
  if (Number(rostered) >= team.capacity) {
    return [
      {
        kind: "capacity",
        message: `${team.name} is at its ${team.capacity}-player limit. Raise the limit or pick another team.`,
      },
    ];
  }

  try {
    await db.insert(rosterSpots).values({
      teamId,
      playerId,
      divisionId: team.divisionId,
      sortOrder: Number(rostered) + 1,
    });
  } catch {
    // The unique index caught a race the checks above could not see.
    return [
      {
        kind: "already_in_division",
        message: "Somebody else just placed that player. Reload the roster.",
      },
    ];
  }

  await audit(team.clubId, actor, "roster_assigned", `team:${teamId}`, { playerId });
  return [];
}

export async function removePlayer(
  teamId: string,
  playerId: string,
  actor: Actor,
): Promise<RosterViolation[]> {
  const db = getDb();
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return [{ kind: "not_registered", message: "That team no longer exists" }];
  if (team.rosterLockedAt) {
    return [{ kind: "locked", message: `${team.name}'s roster is locked.` }];
  }
  await db
    .delete(rosterSpots)
    .where(and(eq(rosterSpots.teamId, teamId), eq(rosterSpots.playerId, playerId)));
  await audit(team.clubId, actor, "roster_removed", `team:${teamId}`, { playerId });
  return [];
}

/** Move a player between teams in one division, in one step. */
export async function movePlayer(
  fromTeamId: string,
  toTeamId: string,
  playerId: string,
  actor: Actor,
): Promise<RosterViolation[]> {
  const removed = await removePlayer(fromTeamId, playerId, actor);
  if (removed.length > 0) return removed;
  const assigned = await assignPlayer(toTeamId, playerId, actor);
  if (assigned.length > 0) {
    // Put them back rather than leaving a child off every roster.
    await assignPlayer(fromTeamId, playerId, actor);
  }
  return assigned;
}

export async function setJerseyNumber(
  teamId: string,
  playerId: string,
  jersey: string,
  actor: Actor,
): Promise<RosterViolation[]> {
  const db = getDb();
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return [{ kind: "not_registered", message: "That team no longer exists" }];
  if (team.rosterLockedAt) {
    return [{ kind: "locked", message: `${team.name}'s roster is locked.` }];
  }
  const value = jersey.trim();
  if (value && !/^\d{1,3}$/.test(value)) {
    return [{ kind: "jersey_taken", message: "Jersey numbers are 1–3 digits" }];
  }
  try {
    await db
      .update(rosterSpots)
      .set({ jerseyNumber: value || null })
      .where(and(eq(rosterSpots.teamId, teamId), eq(rosterSpots.playerId, playerId)));
  } catch {
    return [{ kind: "jersey_taken", message: `Number ${value} is already taken on this team` }];
  }
  await audit(team.clubId, actor, "jersey_set", `team:${teamId}`, { playerId, jersey: value });
  return [];
}

/** Reorder within a team — the button equivalent of dragging, always present. */
export async function moveSpot(
  teamId: string,
  playerId: string,
  direction: "up" | "down",
): Promise<void> {
  const db = getDb();
  const spots = await db
    .select()
    .from(rosterSpots)
    .where(eq(rosterSpots.teamId, teamId))
    .orderBy(asc(rosterSpots.sortOrder), asc(rosterSpots.createdAt));
  const index = spots.findIndex((s) => s.playerId === playerId);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= spots.length) return;
  await db
    .update(rosterSpots)
    .set({ sortOrder: spots[swapWith].sortOrder })
    .where(eq(rosterSpots.id, spots[index].id));
  await db
    .update(rosterSpots)
    .set({ sortOrder: spots[index].sortOrder })
    .where(eq(rosterSpots.id, spots[swapWith].id));
}

/* ------------------------------------------------------------------ teams --- */

export async function createTeam(
  clubId: string,
  divisionId: string,
  name: string,
  capacity: number,
): Promise<Team> {
  const db = getDb();
  const [team] = await db
    .insert(teams)
    .values({ clubId, divisionId, name: name.trim(), capacity })
    .returning();
  return team;
}

export async function deleteTeam(teamId: string): Promise<void> {
  await getDb().delete(teams).where(eq(teams.id, teamId));
}

export async function lockRoster(teamId: string, locked: boolean, actor: Actor): Promise<void> {
  const db = getDb();
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return;
  await db
    .update(teams)
    .set({ rosterLockedAt: locked ? new Date() : null })
    .where(eq(teams.id, teamId));
  await audit(team.clubId, actor, locked ? "roster_locked" : "roster_unlocked", `team:${teamId}`);
}

export async function assignTeamStaff(
  teamId: string,
  userId: string,
  role: "coach" | "manager",
): Promise<void> {
  await getDb()
    .insert(teamStaff)
    .values({ teamId, userId, role })
    .onConflictDoUpdate({ target: [teamStaff.teamId, teamStaff.userId], set: { role } });
}

export async function removeTeamStaff(teamId: string, userId: string): Promise<void> {
  await getDb()
    .delete(teamStaff)
    .where(and(eq(teamStaff.teamId, teamId), eq(teamStaff.userId, userId)));
}

/* ---------------------------------------------------------------- reading --- */

export interface RosterEntry {
  playerId: string;
  firstName: string;
  lastName: string;
  jerseyNumber: string | null;
  sortOrder: number;
  /** Only ever populated for roles that hold `view_medical`. */
  medicalNotes: string | null;
  emergencyContacts: { name: string; phone: string; relationship: string }[];
  /** Only for staff who may see money. */
  balanceCents: number | null;
  /** Parent contact, staff-only — never rendered on a parent surface. */
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}

export interface RosterView {
  team: Team;
  divisionName: string;
  entries: RosterEntry[];
  staff: { userId: string; name: string; role: string }[];
  locked: boolean;
}

/**
 * Read a team's roster for a caller in `role`.
 *
 * A coach or manager gets names and jersey numbers. They do not get medical
 * notes, emergency contacts, parent contact details or money, and the query does
 * not fetch those columns for them at all.
 */
export async function getRoster(teamId: string, role: StaffRole): Promise<RosterView | null> {
  const db = getDb();
  const [team] = await db
    .select({ team: teams, divisionName: divisions.name })
    .from(teams)
    .innerJoin(divisions, eq(divisions.id, teams.divisionId))
    .where(eq(teams.id, teamId));
  if (!team) return null;

  const scoped = isTeamScoped(role);

  const rows = scoped
    ? await db
        .select({
          spot: rosterSpots,
          firstName: players.firstName,
          lastName: players.lastName,
        })
        .from(rosterSpots)
        .innerJoin(players, eq(players.id, rosterSpots.playerId))
        .where(eq(rosterSpots.teamId, teamId))
        .orderBy(asc(rosterSpots.sortOrder))
    : await db
        .select({
          spot: rosterSpots,
          firstName: players.firstName,
          lastName: players.lastName,
          medical: players.medicalNotesEnc,
          contacts: players.emergencyContactsEnc,
          contactName: households.contactName,
          contactEmail: households.email,
          contactPhone: households.phone,
        })
        .from(rosterSpots)
        .innerJoin(players, eq(players.id, rosterSpots.playerId))
        .innerJoin(households, eq(households.id, players.householdId))
        .where(eq(rosterSpots.teamId, teamId))
        .orderBy(asc(rosterSpots.sortOrder));

  const staff = await db
    .select({ userId: teamStaff.userId, name: users.name, role: teamStaff.role })
    .from(teamStaff)
    .innerJoin(users, eq(users.id, teamStaff.userId))
    .where(eq(teamStaff.teamId, teamId));

  const entries: RosterEntry[] = rows.map((r) => {
    const wide = r as typeof r & {
      medical?: string | null;
      contacts?: string | null;
      contactName?: string;
      contactEmail?: string;
      contactPhone?: string | null;
    };
    return {
      playerId: r.spot.playerId,
      firstName: r.firstName,
      lastName: r.lastName,
      jerseyNumber: r.spot.jerseyNumber,
      sortOrder: r.spot.sortOrder,
      medicalNotes: scoped ? null : decryptField(wide.medical),
      emergencyContacts: scoped ? [] : decryptContacts(wide.contacts),
      balanceCents: null,
      contactName: scoped ? null : (wide.contactName ?? null),
      contactEmail: scoped ? null : (wide.contactEmail ?? null),
      contactPhone: scoped ? null : (wide.contactPhone ?? null),
    };
  });

  return {
    team: team.team,
    divisionName: team.divisionName,
    entries,
    staff,
    locked: Boolean(team.team.rosterLockedAt),
  };
}

export interface TeamSummary {
  team: Team;
  divisionId: string;
  divisionName: string;
  rosteredCount: number;
  coachNames: string[];
  locked: boolean;
}

/** Every team in a season, or only a coach's own teams. */
export async function listTeams(
  seasonId: string,
  options: { userId?: string; scoped?: boolean } = {},
): Promise<TeamSummary[]> {
  const db = getDb();
  const rows = await db
    .select({ team: teams, divisionId: divisions.id, divisionName: divisions.name })
    .from(teams)
    .innerJoin(divisions, eq(divisions.id, teams.divisionId))
    .where(eq(divisions.seasonId, seasonId))
    .orderBy(asc(divisions.sortOrder), asc(teams.name));
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.team.id);
  const counts = await db
    .select({ teamId: rosterSpots.teamId, n: sql<number>`count(*)::int` })
    .from(rosterSpots)
    .where(inArray(rosterSpots.teamId, ids))
    .groupBy(rosterSpots.teamId);
  const staff = await db
    .select({ teamId: teamStaff.teamId, userId: teamStaff.userId, name: users.name })
    .from(teamStaff)
    .innerJoin(users, eq(users.id, teamStaff.userId))
    .where(inArray(teamStaff.teamId, ids));

  const mine = options.scoped && options.userId
    ? new Set(staff.filter((s) => s.userId === options.userId).map((s) => s.teamId))
    : null;

  return rows
    .filter((r) => !mine || mine.has(r.team.id))
    .map((r) => ({
      team: r.team,
      divisionId: r.divisionId,
      divisionName: r.divisionName,
      rosteredCount: Number(counts.find((c) => c.teamId === r.team.id)?.n ?? 0),
      coachNames: staff.filter((s) => s.teamId === r.team.id).map((s) => s.name),
      locked: Boolean(r.team.rosterLockedAt),
    }));
}

/**
 * A team's roster as a CSV a coach can print for the sideline: names and numbers.
 * Never medical notes, never parent contact details — this file leaves the club.
 */
export async function exportRosterCsv(teamId: string): Promise<string> {
  const db = getDb();
  const rows = await db
    .select({
      jersey: rosterSpots.jerseyNumber,
      firstName: players.firstName,
      lastName: players.lastName,
    })
    .from(rosterSpots)
    .innerJoin(players, eq(players.id, rosterSpots.playerId))
    .where(eq(rosterSpots.teamId, teamId))
    .orderBy(asc(rosterSpots.sortOrder));
  const lines = ["jersey,first_name,last_name"];
  for (const r of rows) lines.push(`${r.jersey ?? ""},${r.firstName},${r.lastName}`);
  return lines.join("\n");
}

/** Teams a household has a child on, for the parent link-page. */
export async function teamsForHousehold(householdId: string, seasonId: string) {
  return getDb()
    .select({
      teamId: teams.id,
      teamName: teams.name,
      divisionName: divisions.name,
      playerId: players.id,
      playerFirstName: players.firstName,
      jerseyNumber: rosterSpots.jerseyNumber,
    })
    .from(rosterSpots)
    .innerJoin(players, eq(players.id, rosterSpots.playerId))
    .innerJoin(teams, eq(teams.id, rosterSpots.teamId))
    .innerJoin(divisions, eq(divisions.id, teams.divisionId))
    .where(and(eq(players.householdId, householdId), eq(divisions.seasonId, seasonId)));
}

/** Coaches and managers assigned to each team, for the conflict checker. */
export async function coachesByTeam(seasonId: string): Promise<Map<string, { id: string; name: string }[]>> {
  const rows = await getDb()
    .select({ teamId: teamStaff.teamId, userId: users.id, name: users.name })
    .from(teamStaff)
    .innerJoin(users, eq(users.id, teamStaff.userId))
    .innerJoin(teams, eq(teams.id, teamStaff.teamId))
    .innerJoin(divisions, eq(divisions.id, teams.divisionId))
    .where(eq(divisions.seasonId, seasonId));
  const out = new Map<string, { id: string; name: string }[]>();
  for (const row of rows) {
    const list = out.get(row.teamId) ?? [];
    list.push({ id: row.userId, name: row.name });
    out.set(row.teamId, list);
  }
  return out;
}

/** Households with a rostered child on each team, for sibling-overlap detection. */
export async function householdsByTeam(
  seasonId: string,
): Promise<Map<string, { id: string; label: string }[]>> {
  const rows = await getDb()
    .select({
      teamId: rosterSpots.teamId,
      householdId: households.id,
      contactName: households.contactName,
      lastName: players.lastName,
    })
    .from(rosterSpots)
    .innerJoin(players, eq(players.id, rosterSpots.playerId))
    .innerJoin(households, eq(households.id, players.householdId))
    .innerJoin(teams, eq(teams.id, rosterSpots.teamId))
    .innerJoin(divisions, eq(divisions.id, teams.divisionId))
    .where(eq(divisions.seasonId, seasonId));
  const out = new Map<string, { id: string; label: string }[]>();
  for (const row of rows) {
    const list = out.get(row.teamId) ?? [];
    if (!list.some((h) => h.id === row.householdId)) {
      list.push({ id: row.householdId, label: `The ${row.lastName} family` });
    }
    out.set(row.teamId, list);
  }
  return out;
}

/** Teams a staff user is assigned to. */
export async function myTeamIds(userId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ teamId: teamStaff.teamId })
    .from(teamStaff)
    .where(eq(teamStaff.userId, userId));
  return rows.map((r) => r.teamId);
}

/** Unrostered active registrations across a season — the "needs attention" count. */
export async function unrosteredCount(seasonId: string): Promise<number> {
  const [{ n }] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(registrations)
    .leftJoin(
      rosterSpots,
      and(
        eq(rosterSpots.playerId, registrations.playerId),
        eq(rosterSpots.divisionId, registrations.divisionId),
      ),
    )
    .where(
      and(
        eq(registrations.seasonId, seasonId),
        eq(registrations.status, "active"),
        isNull(rosterSpots.id),
      ),
    );
  return Number(n);
}
