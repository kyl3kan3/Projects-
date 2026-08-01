import type { Metadata } from "next";
import Link from "next/link";
import { CreateSeasonForm, PromoteForm, StatusForm } from "./SeasonForms";
import { createSeasonAction, promoteWaitlistAction, setSeasonStatusAction } from "./actions";
import {
  EmptyState,
  Money,
  RegistrationProgress,
  ScreenTitle,
  SectionHead,
  StatRow,
} from "@/components/ui";
import { IconChevronRight, IconClock, IconMapPin } from "@/components/icons";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { getCurrentSeason, getSeasonDashboard, listSeasons } from "@/lib/registration";
import { unrosteredCount } from "@/lib/rosters";
import { describeGame, getGateState, upcomingGames } from "@/lib/schedule";
import { addDays, formatClock, formatDayLabel, formatIso, todayIso } from "@/lib/time";

export const metadata: Metadata = { title: "Season" };

/**
 * The console's home screen, in DESIGN.md's order: the registration progress
 * hero, what is on today, what needs attention, and one contextual primary
 * action — Resolve conflicts when any exist, otherwise Send announcement.
 */
export default async function SeasonPage() {
  const { club, user } = await requireUser();
  const seasons = await listSeasons(club.id);
  const season = await getCurrentSeason(club.id);
  const today = todayIso();

  if (!season) {
    return (
      <main className="screen">
        <ScreenTitle eyebrow={club.name} title="No season yet" />
        <EmptyState
          title="Open your first season"
          body="A season holds the divisions, the fees and the registration link you post. Fall and spring are usually separate seasons; a summer camp can be one too."
        />
        <CreateSeasonForm
          action={createSeasonAction}
          defaults={{
            opens: today,
            closes: addDays(today, 30),
            starts: addDays(today, 44),
            ends: addDays(today, 114),
          }}
        />
      </main>
    );
  }

  const dashboard = await getSeasonDashboard(season.id);
  const gate = await getGateState(season.id);
  const upcoming = await upcomingGames(season.id, 4);
  const unrostered = await unrosteredCount(season.id);
  const registrationUrl = `${env.appUrl}/register/${season.slug}`;

  const hardCount = gate.hard.length;
  const softCount = gate.needsOverride.length;

  return (
    <main className="screen">
      <ScreenTitle
        eyebrow={club.name}
        title={season.name}
        action={
          <StatusForm action={setSeasonStatusAction} seasonId={season.id} status={season.status} />
        }
      />

      <div className="panel p-5">
        <RegistrationProgress
          registered={dashboard?.registeredCount ?? 0}
          capacity={dashboard?.capacityTotal ?? 0}
          waitlisted={dashboard?.waitlistTotal ?? 0}
        />
        <div className="mt-5 flex flex-wrap items-baseline gap-x-8 gap-y-3 hairline-t pt-4">
          <div>
            <p className="t-label">Collected</p>
            <p className="t-data-lg mt-1">
              <Money cents={dashboard?.money.collectedCents ?? 0} className="t-data-lg" />
            </p>
          </div>
          <div>
            <p className="t-label">Outstanding</p>
            <p
              className="t-data-lg mt-1"
              style={{
                color: (dashboard?.money.outstandingCents ?? 0) > 0 ? "var(--warn)" : "var(--fg-2)",
              }}
            >
              <Money cents={dashboard?.money.outstandingCents ?? 0} className="t-data-lg" />
            </p>
          </div>
          <div>
            <p className="t-label">Our fee so far</p>
            <p className="t-data-lg mt-1" style={{ color: "var(--fg-2)" }}>
              <Money cents={dashboard?.money.platformFeeCents ?? 0} className="t-data-lg" />
            </p>
          </div>
        </div>
      </div>

      {season.status === "open" ? (
        <div className="mt-4">
          <p className="t-label">Registration link — post this</p>
          <p className="t-data mt-1 break-all" style={{ color: "var(--accent)" }}>
            {registrationUrl}
          </p>
          <p className="t-secondary mt-1">
            Open {formatIso(season.registrationOpensOn)} to {formatIso(season.registrationClosesOn)}.
          </p>
        </div>
      ) : (
        <p className="t-secondary mt-4">
          This season is <strong>{season.status}</strong>. Open registration to make{" "}
          <span className="t-data">/register/{season.slug}</span> live.
        </p>
      )}

      <SectionHead right={<Link href="/schedule" className="t-secondary turf">Schedule</Link>}>
        Next up
      </SectionHead>
      {upcoming.length === 0 ? (
        <p className="t-secondary py-3">
          Nothing on the calendar yet. Build the schedule once rosters are set.
        </p>
      ) : (
        <div className="stagger">
          {upcoming.map((row) => (
            <Link key={row.game.id} href="/schedule" className="row">
              <span className="t-data" style={{ width: 56, color: "var(--fg)" }}>
                {formatClock(row.game.startsAt, club.timezone)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="t-title block truncate">
                  {describeGame({
                    homeTeamName: row.homeTeamName,
                    awayTeamName: null,
                    game: row.game,
                  })}
                  {" · "}
                  {row.divisionName}
                </span>
                <span className="t-secondary flex items-center gap-1" style={{ color: "var(--fg-3)" }}>
                  <IconMapPin size={14} />
                  {row.venueName} · {row.game.field}
                  {row.game.publishedAt ? null : " · draft"}
                </span>
              </span>
              <span className="t-data" style={{ color: "var(--fg-3)" }}>
                {formatDayLabel(row.game.startsAt, club.timezone)}
              </span>
            </Link>
          ))}
        </div>
      )}

      <SectionHead>Needs attention</SectionHead>
      <div className="stagger">
        {hardCount > 0 ? (
          <StatRow
            label={`${hardCount} hard conflict${hardCount === 1 ? "" : "s"} — publish blocked`}
            value="SCHEDULE"
            tone="bad"
            href="/schedule"
          />
        ) : null}
        {softCount > 0 ? (
          <StatRow
            label={`${softCount} soft conflict${softCount === 1 ? "" : "s"} to accept`}
            value="SCHEDULE"
            tone="warn"
            href="/schedule"
          />
        ) : null}
        {(dashboard?.unpaidCount ?? 0) > 0 ? (
          <StatRow
            label={`${dashboard?.unpaidCount} registration${dashboard?.unpaidCount === 1 ? "" : "s"} unpaid`}
            value="MONEY"
            tone="warn"
            href="/registrations?state=unpaid"
          />
        ) : null}
        {(dashboard?.waitlistTotal ?? 0) > 0 ? (
          <StatRow
            label={`${dashboard?.waitlistTotal} on the waitlist`}
            value="WAITLIST"
            tone="warn"
            href="/registrations?state=waitlisted"
          />
        ) : null}
        {unrostered > 0 ? (
          <StatRow
            label={`${unrostered} paid player${unrostered === 1 ? "" : "s"} not on a team`}
            value="ROSTERS"
            href="/rosters"
          />
        ) : null}
        {gate.unpublishedCount > 0 ? (
          <StatRow
            label={`${gate.unpublishedCount} game${gate.unpublishedCount === 1 ? "" : "s"} not published`}
            value="SCHEDULE"
            href="/schedule"
          />
        ) : null}
        {hardCount === 0 &&
        softCount === 0 &&
        (dashboard?.unpaidCount ?? 0) === 0 &&
        (dashboard?.waitlistTotal ?? 0) === 0 &&
        unrostered === 0 &&
        gate.unpublishedCount === 0 ? (
          <div className="row">
            <span className="t-title turf">Nothing needs you right now</span>
            <IconClock size={18} style={{ color: "var(--fg-3)" }} />
          </div>
        ) : null}
      </div>

      <SectionHead right={<Link href="/season/setup" className="t-secondary turf">Set up</Link>}>
        Divisions
      </SectionHead>
      <div className="stagger">
        {(dashboard?.divisions ?? []).map((division) => (
          <div key={division.id} className="row">
            <span className="min-w-0 flex-1">
              <span className="t-label block">{division.name}</span>
              <span className="t-data mt-1 block" style={{ color: "var(--fg-2)" }}>
                {division.activeCount} / {division.capacity}
                {division.waitlistCount > 0 ? ` · +${division.waitlistCount} waitlist` : ""}
              </span>
            </span>
            {division.waitlistCount > 0 && division.spotsLeft > 0 ? (
              <PromoteForm action={promoteWaitlistAction} divisionId={division.id} />
            ) : (
              <span className="t-data" style={{ color: "var(--fg-3)" }}>
                {division.full ? "FULL" : `${division.spotsLeft} LEFT`}
              </span>
            )}
          </div>
        ))}
      </div>

      {seasons.length > 1 ? (
        <>
          <SectionHead>Other seasons</SectionHead>
          <div>
            {seasons
              .filter((s) => s.id !== season.id)
              .map((s) => (
                <div key={s.id} className="row">
                  <span className="t-title flex-1">{s.name}</span>
                  <span className="t-data" style={{ color: "var(--fg-3)" }}>
                    {s.status.toUpperCase()}
                  </span>
                </div>
              ))}
          </div>
        </>
      ) : null}

      <div className="mt-8">
        <CreateSeasonForm
          action={createSeasonAction}
          defaults={{
            opens: today,
            closes: addDays(today, 30),
            starts: addDays(today, 44),
            ends: addDays(today, 114),
          }}
        />
      </div>

      {/* The one contextual primary action, in the thumb zone. */}
      <div className="thumb-cta">
        {hardCount + softCount > 0 ? (
          <Link href="/schedule" className="btn btn-primary btn-full">
            Resolve conflicts
            <IconChevronRight size={18} />
          </Link>
        ) : (
          <Link href="/comms" className="btn btn-primary btn-full">
            Send announcement
            <IconChevronRight size={18} />
          </Link>
        )}
      </div>

      <p className="t-secondary mt-6" style={{ color: "var(--fg-3)" }}>
        {user.role === "coach" || user.role === "manager"
          ? "You are a coach here: rosters you see are your own teams, and medical notes are not shown to coaches."
          : `Plan: ${club.plan === "flat" ? "Club flat $49/mo" : "$1.50 per paid registration"}.`}
      </p>
    </main>
  );
}
