import type { Metadata } from "next";
import Link from "next/link";
import { PennantClear } from "./PennantClear";
import {
  AddGameForm,
  CancelGameForm,
  ImportForm,
  MoveGameForm,
  OverrideForm,
  PublishForm,
  VenueForm,
} from "./ScheduleForms";
import {
  cancelGameAction,
  createGameAction,
  createVenueAction,
  importCsvAction,
  overrideConflictAction,
  publishScheduleAction,
  updateGameAction,
} from "./actions";
import { EmptyState, PennantChip, ScreenTitle, SectionHead } from "@/components/ui";
import { IconDownload, IconMapPin, IconPennant } from "@/components/icons";
import { can, requireUser } from "@/lib/auth";
import { divisionAvailability, getCurrentSeason } from "@/lib/registration";
import { listTeams } from "@/lib/rosters";
import {
  describeGame,
  getGateState,
  getSchedule,
  listVenues,
  pendingReminders,
} from "@/lib/schedule";
import { formatClock, formatIsoShort, todayIso } from "@/lib/time";

export const metadata: Metadata = { title: "Schedule" };

/**
 * The schedule builder, with the conflict gate above the publish button — the
 * screen the product is sold on. Day groups are Label headers over hairline rows;
 * a row with a finding carries its pennant, red for hard and amber for soft.
 */
export default async function SchedulePage() {
  const { club, user } = await requireUser();
  const season = await getCurrentSeason(club.id);

  if (!season) {
    return (
      <main className="screen">
        <ScreenTitle eyebrow="Schedule" title="No season yet" />
        <EmptyState
          title="A schedule needs a season"
          body="Open a season and build rosters first — the checker needs to know which teams and coaches exist before it can catch a clash."
          action={
            <Link href="/season" className="btn btn-secondary">
              Open a season
            </Link>
          }
        />
      </main>
    );
  }

  if (!can(user.role, "manage_schedule")) {
    const view = await getSchedule(season.id, { publishedOnly: true });
    return (
      <main className="screen">
        <ScreenTitle eyebrow={`${club.name} · ${season.name}`} title="Schedule" />
        <p className="t-secondary">
          Published games only. Ask the registrar to change anything here.
        </p>
        {view.days.map((day) => (
          <div key={day.localDate}>
            <SectionHead>{day.label}</SectionHead>
            {day.rows.map((row) => (
              <div key={row.game.id} className="row">
                <span className="t-data" style={{ width: 56 }}>
                  {formatClock(row.game.startsAt, view.timezone)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="t-title block truncate">
                    {describeGame(row)} · {row.divisionName}
                  </span>
                  <span className="t-secondary block" style={{ color: "var(--fg-3)" }}>
                    {row.venueName} · {row.game.field}
                  </span>
                </span>
              </div>
            ))}
          </div>
        ))}
      </main>
    );
  }

  const gate = await getGateState(season.id);
  const view = await getSchedule(season.id);
  const venues = await listVenues(club.id);
  const teams = await listTeams(season.id);
  const reminders = await pendingReminders(season.id);
  const divisionsForPrint = await divisionAvailability(season.id);

  const hard = gate.hard;
  const soft = gate.needsOverride;
  const clear = gate.ok;

  return (
    <main className="screen">
      <ScreenTitle
        eyebrow={`${club.name} · ${season.name}`}
        title="Schedule"
        action={
          <PennantChip
            severity={hard.length > 0 ? "hard" : soft.length > 0 ? "soft" : "clear"}
            kind={hard[0]?.kind ?? soft[0]?.kind}
          />
        }
      />

      {/* The gate banner sits above publish, exactly as DESIGN.md specifies. */}
      <div
        className="panel p-4"
        style={{
          borderColor: hard.length > 0 ? "var(--bad)" : soft.length > 0 ? "var(--warn)" : "var(--line)",
        }}
      >
        <p
          className="t-label"
          style={{
            color: hard.length > 0 ? "var(--bad)" : soft.length > 0 ? "var(--warn)" : "var(--accent)",
          }}
        >
          {hard.length > 0
            ? `${hard.length} hard · publish blocked`
            : soft.length > 0
              ? `${soft.length} soft · needs your call`
              : "All clear"}
        </p>
        {hard.length === 0 && soft.length === 0 ? (
          <p className="t-secondary mt-2">
            Nothing on this schedule double-books a field, a team, a coach or a family.
            {gate.overridden.length > 0
              ? ` ${gate.overridden.length} soft conflict${gate.overridden.length === 1 ? " has" : "s have"} been accepted on the record.`
              : ""}
          </p>
        ) : (
          <div className="mt-3">
            {[...hard, ...soft].map((conflict) => (
              <div key={conflict.id} className="row">
                <IconPennant
                  size={18}
                  style={{ color: conflict.severity === "hard" ? "var(--bad)" : "var(--warn)" }}
                />
                <span className="min-w-0 flex-1">
                  <span className="t-title block">{conflict.explanation}</span>
                  <span className="t-secondary block" style={{ color: "var(--fg-3)" }}>
                    {conflict.severity === "hard"
                      ? "Two things cannot be in one place. Move one of them."
                      : "You can accept this and publish anyway — it will be recorded against your name."}
                  </span>
                </span>
                {conflict.severity === "soft" ? (
                  <OverrideForm action={overrideConflictAction} conflictId={conflict.id} />
                ) : null}
              </div>
            ))}
          </div>
        )}
        <div className="mt-4">
          <PublishForm
            action={publishScheduleAction}
            seasonId={season.id}
            clear={clear}
            unpublishedCount={gate.unpublishedCount}
          />
        </div>
      </div>

      <PennantClear
        seasonId={season.id}
        conflictedGameIds={[...new Set(view.conflicts.flatMap((c) => c.gameIds))]}
      />

      {view.days.length === 0 ? (
        <EmptyState
          title="Nothing on the schedule yet"
          body="Add a game below, or paste a CSV you already made. Every edit re-runs the checker, so you will know about a double-booked field before the parents do."
        />
      ) : (
        view.days.map((day) => (
          <div key={day.localDate}>
            <SectionHead
              right={
                <span className="t-data" style={{ color: "var(--fg-3)" }}>
                  {day.rows.length} on
                </span>
              }
            >
              {day.label}
            </SectionHead>
            {day.rows.map((row) => {
              const worst = row.conflicts.find((c) => c.severity === "hard") ?? row.conflicts[0];
              return (
                <div key={row.game.id} className="row" data-game-row={row.game.id}>
                  <span className="t-data" style={{ width: 56, color: "var(--fg)" }}>
                    {formatClock(row.game.startsAt, view.timezone)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="t-title block truncate">
                      {describeGame(row)}
                      <span style={{ color: "var(--fg-2)" }}> · {row.divisionName}</span>
                    </span>
                    <span
                      className="t-secondary flex items-center gap-1"
                      style={{ color: "var(--fg-3)" }}
                    >
                      <IconMapPin size={14} />
                      {row.venueName} · {row.game.field}
                      {row.game.publishedAt ? "" : " · draft"}
                    </span>
                    {worst ? (
                      <span className="mt-2 flex flex-wrap items-center gap-2">
                        <PennantChip severity={worst.severity} kind={worst.kind} />
                        {worst.overriddenAt ? (
                          <span className="t-data" style={{ color: "var(--fg-3)" }}>
                            ACCEPTED
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                    <MoveGameForm
                      action={updateGameAction}
                      gameId={row.game.id}
                      venues={venues.map((v) => ({ id: v.id, name: v.name, fields: v.fields }))}
                      current={{
                        venueId: row.game.venueId,
                        field: row.game.field,
                        localDate: row.game.localDate,
                        localTime: row.game.localTime,
                        durationMinutes: row.game.durationMinutes,
                      }}
                      cancel={<CancelGameForm action={cancelGameAction} gameId={row.game.id} />}
                    />
                  </span>
                </div>
              );
            })}
          </div>
        ))
      )}

      {reminders.length > 0 ? (
        <>
          <SectionHead>Queued reminders</SectionHead>
          <p className="t-secondary">
            Fixed distances from kick-off: email 24 hours before, text 3 hours before for families
            who opted in. Moving a game cancels its old notices automatically.
          </p>
          <div className="mt-2">
            {reminders.slice(0, 6).map((r) => (
              <div key={r.reminder.id} className="row">
                <span className="t-data" style={{ width: 92, color: "var(--fg-2)" }}>
                  {r.reminder.rung === "t24_email" ? "T-24h EMAIL" : "T-3h SMS"}
                </span>
                <span className="t-title flex-1 truncate">
                  {formatIsoShort(r.game.localDate)} {r.game.localTime}
                </span>
                <span className="t-data" style={{ color: "var(--fg-3)" }}>
                  {formatClock(r.reminder.sendAfter, view.timezone)}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {venues.length === 0 ? (
        <EmptyState
          title="Add a venue first"
          body="A game needs a venue and a field, and fields are what the checker compares. Miller Park with Field 1 and Field 2 is the usual shape."
        />
      ) : null}

      <AddGameForm
        action={createGameAction}
        seasonId={season.id}
        teams={teams.map((t) => ({
          id: t.team.id,
          name: t.team.name,
          divisionName: t.divisionName,
        }))}
        venues={venues.map((v) => ({ id: v.id, name: v.name, fields: v.fields }))}
        defaultDate={season.startsOn > todayIso() ? season.startsOn : todayIso()}
      />
      <ImportForm action={importCsvAction} seasonId={season.id} />
      <VenueForm action={createVenueAction} />

      <SectionHead>Printable sheets</SectionHead>
      <p className="t-secondary">
        One page per division for the clubhouse wall — published games only, no names.
      </p>
      {divisionsForPrint.map((d) => (
        <a key={d.id} href={`/print/${d.id}`} className="row" target="_blank" rel="noreferrer">
          <IconDownload size={18} style={{ color: "var(--fg-2)" }} />
          <span className="t-title flex-1">{d.name}</span>
          <span className="t-secondary turf">Open</span>
        </a>
      ))}

      <SectionHead>Venues</SectionHead>
      {venues.map((v) => (
        <div key={v.id} className="row">
          <span className="t-title flex-1">{v.name}</span>
          <span className="t-data" style={{ color: "var(--fg-2)" }}>
            {v.fields.join(" · ")}
          </span>
        </div>
      ))}
    </main>
  );
}
