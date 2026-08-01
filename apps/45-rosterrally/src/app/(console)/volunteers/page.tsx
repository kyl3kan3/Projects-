import type { Metadata } from "next";
import Link from "next/link";
import { CreateSlotForm, DeleteSlotForm, NoShowForm, NudgeForm } from "./VolunteerForms";
import { createSlotAction, deleteSlotAction, noShowAction, nudgeAction } from "./actions";
import { EmptyState, ScreenTitle, SectionHead } from "@/components/ui";
import { IconCheck, IconHandRaise } from "@/components/icons";
import { can, requireUser } from "@/lib/auth";
import { getCurrentSeason } from "@/lib/registration";
import { describeGame, getSchedule } from "@/lib/schedule";
import { listSlots, unfilledSlots } from "@/lib/volunteers";
import { formatIsoShort, todayIso } from "@/lib/time";

export const metadata: Metadata = { title: "Volunteers" };

export default async function VolunteersPage() {
  const { club, user } = await requireUser();
  const season = await getCurrentSeason(club.id);

  if (!season) {
    return (
      <main className="screen">
        <ScreenTitle eyebrow="Volunteers" title="No season yet" />
        <EmptyState
          title="Slots hang off a season"
          body="Open a season, then attach snack bar and scorekeeper slots to games. Parents claim them from their own page with no login."
          action={
            <Link href="/season" className="btn btn-secondary">
              Open a season
            </Link>
          }
        />
      </main>
    );
  }

  const slots = await listSlots(season.id);
  const open = await unfilledSlots(season.id);
  const schedule = await getSchedule(season.id);
  const games = schedule.days.flatMap((day) =>
    day.rows.map((row) => ({
      id: row.game.id,
      label: `${formatIsoShort(row.game.localDate)} ${row.game.localTime} — ${describeGame(row)}`,
      date: row.game.localDate,
      time: row.game.localTime,
    })),
  );

  const filled = slots.filter((s) => s.spotsLeft === 0).length;
  const canManage = can(user.role, "manage_schedule");

  return (
    <main className="screen">
      <ScreenTitle
        eyebrow={`${club.name} · ${season.name}`}
        title="Volunteers"
        action={
          <span className="t-data" style={{ color: "var(--fg-2)" }}>
            {filled}/{slots.length} FILLED
          </span>
        }
      />

      {slots.length === 0 ? (
        <EmptyState
          title="No slots yet"
          body="Adding a game can create snack bar, field lines and scorekeeper slots in one tap. You can also add a standalone slot for a kick-off morning or a fundraiser."
        />
      ) : (
        <>
          {open.length > 0 && can(user.role, "send_comms") ? (
            <div className="panel p-4">
              <p className="t-label" style={{ color: "var(--warn)" }}>
                {open.length} slot{open.length === 1 ? "" : "s"} open in the next week
              </p>
              <div className="mt-3">
                <NudgeForm action={nudgeAction} openCount={open.length} />
              </div>
            </div>
          ) : null}

          <SectionHead>Every slot</SectionHead>
          <div className="stagger">
            {slots.map((view) => (
              <div key={view.slot.id} className="row">
                <span className="min-w-0 flex-1">
                  <span className="t-title block truncate">{view.label}</span>
                  <span className="t-secondary block" style={{ color: "var(--fg-3)" }}>
                    {view.when}
                    {view.where ? ` · ${view.where}` : ""}
                  </span>
                  {view.claimed.length > 0 ? (
                    <span className="mt-1 block">
                      {view.claimed.map((c) => (
                        <span
                          key={c.claimId}
                          className="t-data mr-3 inline-flex items-center gap-1 turf"
                        >
                          <IconCheck size={12} />
                          {c.contactName}
                          {canManage ? (
                            <span className="ml-2">
                              <NoShowForm action={noShowAction} claimId={c.claimId} />
                            </span>
                          ) : null}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
                <span className="flex flex-col items-end gap-1">
                  <span
                    className="t-data"
                    style={{ color: view.spotsLeft === 0 ? "var(--accent)" : "var(--warn)" }}
                  >
                    {view.slot.capacity - view.spotsLeft} / {view.slot.capacity}
                  </span>
                  {canManage && view.claimed.length === 0 ? (
                    <DeleteSlotForm action={deleteSlotAction} slotId={view.slot.id} />
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {canManage ? (
        <CreateSlotForm
          action={createSlotAction}
          games={games}
          defaultDate={season.startsOn > todayIso() ? season.startsOn : todayIso()}
        />
      ) : null}

      <p className="t-secondary mt-6 flex items-start gap-2" style={{ color: "var(--fg-3)" }}>
        <IconHandRaise size={16} />
        Claims come from a family&apos;s own page — one tap, no account. Capacity is enforced in the
        database, so two parents tapping the last snack-bar spot at the same moment cannot both get
        it.
      </p>
    </main>
  );
}
