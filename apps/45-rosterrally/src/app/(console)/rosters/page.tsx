import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { RosterBuilder } from "./RosterBuilder";
import { CoachForm, CreateTeamForm, LockRosterForm } from "./RosterForms";
import {
  assignCoachAction,
  assignPlayerAction,
  createTeamAction,
  lockRosterAction,
  moveSpotAction,
  removeCoachAction,
  removePlayerAction,
  setJerseyAction,
} from "./actions";
import { EmptyState, ScreenTitle, SectionHead } from "@/components/ui";
import { IconDownload } from "@/components/icons";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { can, isTeamScoped, requireUser } from "@/lib/auth";
import { divisionAvailability, getCurrentSeason } from "@/lib/registration";
import { getPool, getRoster, listTeams, myTeamIds } from "@/lib/rosters";

export const metadata: Metadata = { title: "Rosters" };

export default async function RostersPage({
  searchParams,
}: {
  searchParams: Promise<{ division?: string }>;
}) {
  const { club, user } = await requireUser();
  const season = await getCurrentSeason(club.id);
  const params = await searchParams;

  if (!season) {
    return (
      <main className="screen">
        <ScreenTitle eyebrow="Rosters" title="No season yet" />
        <EmptyState
          title="Rosters come after registration"
          body="Open a season, take some registrations, then build teams from the paid pool."
          action={
            <Link href="/season" className="btn btn-secondary">
              Open a season
            </Link>
          }
        />
      </main>
    );
  }

  const scoped = isTeamScoped(user.role);
  const divisions = await divisionAvailability(season.id);
  const allTeams = await listTeams(season.id, {
    userId: user.id,
    scoped,
  });

  // A coach sees only their own teams' rosters — names and numbers, no medical,
  // no contacts, no money. The scoping is in the query, not the template.
  if (scoped) {
    const mine = await myTeamIds(user.id);
    const rosters = await Promise.all(mine.map((teamId) => getRoster(teamId, user.role)));
    return (
      <main className="screen">
        <ScreenTitle eyebrow={`${club.name} · ${season.name}`} title="Your teams" />
        {rosters.filter(Boolean).length === 0 ? (
          <EmptyState
            title="No teams assigned to you yet"
            body="The registrar assigns coaches to teams. Once you are on one, your roster appears here."
          />
        ) : null}
        {rosters.map((roster) =>
          roster ? (
            <section key={roster.team.id} className="panel mt-4 p-4">
              <header className="flex items-baseline justify-between">
                <h2 className="t-title">{roster.team.name}</h2>
                <span className="t-data" style={{ color: "var(--fg-2)" }}>
                  {roster.divisionName} · {roster.entries.length} players
                </span>
              </header>
              <div className="mt-3">
                {roster.entries.map((entry) => (
                  <div key={entry.playerId} className="row">
                    <span className="jersey">{entry.jerseyNumber ?? "—"}</span>
                    <span className="t-title flex-1">
                      {entry.firstName} {entry.lastName}
                    </span>
                  </div>
                ))}
              </div>
              <p className="t-secondary mt-3" style={{ color: "var(--fg-3)" }}>
                Coaches see names and numbers. Medical notes and parent contact details stay with
                the registrar.
              </p>
              <p className="mt-3">
                <a
                  href={`/rosters/export?team=${roster.team.id}`}
                  className="btn btn-secondary btn-small"
                >
                  <IconDownload size={16} />
                  Sideline CSV
                </a>
              </p>
            </section>
          ) : null,
        )}
      </main>
    );
  }

  if (!can(user.role, "manage_rosters")) {
    return (
      <main className="screen">
        <ScreenTitle eyebrow="Rosters" title={season.name} />
        <EmptyState
          title="Your role does not build rosters"
          body={`You are a ${user.role} here. Ask the registrar or a club admin to make roster changes.`}
        />
      </main>
    );
  }

  const activeDivision =
    divisions.find((d) => d.id === params.division) ?? divisions[0] ?? null;

  if (!activeDivision) {
    return (
      <main className="screen">
        <ScreenTitle eyebrow={`${club.name} · ${season.name}`} title="Rosters" />
        <EmptyState
          title="No divisions yet"
          body="Add the age groups first — a team belongs to a division, and so does the one-team-per-player rule."
          action={
            <Link href="/season/setup" className="btn btn-secondary">
              Season setup
            </Link>
          }
        />
      </main>
    );
  }

  const pool = await getPool(activeDivision.id);
  const teamsInDivision = allTeams.filter((t) => t.divisionId === activeDivision.id);
  const rosters = await Promise.all(
    teamsInDivision.map((t) => getRoster(t.team.id, user.role)),
  );
  const staffCandidates = await getDb()
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.clubId, club.id));

  return (
    <main className="screen">
      <ScreenTitle
        eyebrow={`${club.name} · ${season.name}`}
        title="Rosters"
        action={
          <span className="t-data" style={{ color: "var(--fg-2)" }}>
            {pool.length} registered
          </span>
        }
      />

      <div className="chip-row">
        {divisions.map((d) => (
          <Link
            key={d.id}
            href={`/rosters?division=${d.id}`}
            className="chip"
            data-active={d.id === activeDivision.id}
          >
            {d.name}
          </Link>
        ))}
      </div>

      <SectionHead>{activeDivision.name}</SectionHead>
      <RosterBuilder
        divisionName={activeDivision.name}
        teams={rosters.filter(Boolean).map((roster) => ({
          teamId: roster!.team.id,
          name: roster!.team.name,
          capacity: roster!.team.capacity,
          locked: roster!.locked,
          coachNames: roster!.staff.map((s) => s.name),
          entries: roster!.entries.map((e) => ({
            playerId: e.playerId,
            firstName: e.firstName,
            lastName: e.lastName,
            jerseyNumber: e.jerseyNumber,
          })),
        }))}
        pool={pool.map((p) => ({
          playerId: p.playerId,
          firstName: p.firstName,
          lastName: p.lastName,
          state: p.state,
          balanceCents: p.balanceCents,
        }))}
        assignAction={assignPlayerAction}
        removeAction={removePlayerAction}
        jerseyAction={setJerseyAction}
        moveAction={moveSpotAction}
      />

      <SectionHead>Team settings</SectionHead>
      {rosters.filter(Boolean).map((roster) => (
        <div key={roster!.team.id} className="mt-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="t-title">{roster!.team.name}</p>
            <div className="flex items-center gap-4">
              <a
                href={`/rosters/export?team=${roster!.team.id}`}
                className="t-secondary turf"
              >
                Sideline CSV
              </a>
              <LockRosterForm
                action={lockRosterAction}
                teamId={roster!.team.id}
                locked={roster!.locked}
              />
            </div>
          </div>
          <CoachForm
            action={assignCoachAction}
            removeAction={removeCoachAction}
            teamId={roster!.team.id}
            staff={roster!.staff}
            candidates={staffCandidates}
          />
        </div>
      ))}

      <CreateTeamForm
        action={createTeamAction}
        divisionId={activeDivision.id}
        divisionName={activeDivision.name}
      />
    </main>
  );
}
