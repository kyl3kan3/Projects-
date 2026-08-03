import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ScreenHeader } from "@/components/ScreenHeader";
import { IconChevronLeft, IconChevronRight, IconFlag } from "@/components/icons";
import {
  addDays,
  addMonths,
  daysBetween,
  describeDue,
  formatCivilShort,
  formatMonthLabel,
  isCivilDate,
  monthGrid,
  monthOf,
  parseCivil,
  todayIn,
  weekStrip,
  weekdayLetter,
} from "@/lib/dates";
import { deadlineKindLabel } from "@/lib/ics";
import { listAllDeadlines, orgToday } from "@/lib/grants";
import { formatCents } from "@/lib/money";
import { toggleDeadlineAction } from "../pipeline/actions";

export const metadata: Metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; on?: string }>;
}) {
  const { org } = await requireUser();
  const params = await searchParams;
  const today = orgToday(org);
  const anchor = params.on && isCivilDate(params.on) ? params.on : today;
  const view = params.view === "month" ? "month" : "week";

  const rows = await listAllDeadlines(org.id);

  const days = view === "month" ? monthGrid(anchor) : weekStrip(anchor);
  const rangeStart = days[0];
  const rangeEnd = days[days.length - 1];

  const inRange = rows.filter(
    (r) =>
      daysBetween(rangeStart, r.deadline.dueOn) >= 0 &&
      daysBetween(r.deadline.dueOn, rangeEnd) >= 0,
  );

  const upcoming = rows
    .filter((r) => r.deadline.completedAt === null && daysBetween(today, r.deadline.dueOn) >= 0)
    .slice(0, 12);
  const overdue = rows.filter(
    (r) => r.deadline.completedAt === null && daysBetween(today, r.deadline.dueOn) < 0,
  );

  const previous =
    view === "month" ? addMonths(anchor, -1) : addDays(anchor, -7);
  const next = view === "month" ? addMonths(anchor, 1) : addDays(anchor, 7);

  function link(patch: { view?: string; on?: string }): string {
    const next = new URLSearchParams();
    if ((patch.view ?? view) === "month") next.set("view", "month");
    const on = patch.on ?? anchor;
    if (on !== today) next.set("on", on);
    const query = next.toString();
    return query ? `/calendar?${query}` : "/calendar";
  }

  function ticksFor(day: string) {
    const forDay = inRange.filter((r) => r.deadline.dueOn === day);
    return {
      count: forDay.length,
      overdue: forDay.some(
        (r) => r.deadline.completedAt === null && daysBetween(today, day) < 0,
      ),
      hasReport: forDay.some(
        (r) => r.deadline.kind === "report" || r.deadline.kind === "renewal",
      ),
    };
  }

  const agenda = view === "month" ? inRange : upcoming;

  return (
    <div className="screen">
      <ScreenHeader
        title="Calendar"
        summary={`${upcoming.length} UPCOMING${overdue.length ? ` · ${overdue.length} PAST DUE` : ""}`}
      />

      <div className="flex items-center gap-2 rule-b py-3">
        <Link href={link({ view: "week" })} className="chip" data-active={view === "week"}>
          Week
        </Link>
        <Link href={link({ view: "month" })} className="chip" data-active={view === "month"}>
          Month
        </Link>
        <span className="ml-auto flex items-center gap-1">
          <Link
            href={link({ on: previous })}
            aria-label="Previous"
            className="inline-flex items-center justify-center"
            style={{ width: 44, height: 44, color: "var(--color-ink-2)" }}
          >
            <IconChevronLeft size={20} />
          </Link>
          <Link
            href={link({ on: next })}
            aria-label="Next"
            className="inline-flex items-center justify-center"
            style={{ width: 44, height: 44, color: "var(--color-ink-2)" }}
          >
            <IconChevronRight size={20} />
          </Link>
        </span>
      </div>

      <p className="t-label pt-4">
        {view === "month" ? formatMonthLabel(anchor) : `Week of ${formatCivilShort(rangeStart)}`}
      </p>

      {/*
        The strip / grid, with gold ticks under dated days.

        In month view the weekday letters are a single header row rather than one
        per cell: repeating S M T W five times is noise, and the greyed-out copies
        measured 1.2:1 against the paper — invisible, and a contrast failure.
        Cells outside the anchor month are left blank for the same reason; a day
        number nobody can read is not information.
      */}
      {view === "month" ? (
        <div
          className="mt-3 grid gap-1"
          style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
          aria-hidden="true"
        >
          {days.slice(0, 7).map((day) => (
            <span key={`head-${day}`} className="t-label text-center">
              {weekdayLetter(day)}
            </span>
          ))}
        </div>
      ) : null}
      <div
        className="mt-2 grid gap-1"
        style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
      >
        {days.map((day) => {
          const ticks = ticksFor(day);
          const isToday = day === today;
          const otherMonth = view === "month" && monthOf(day) !== monthOf(anchor);
          if (otherMonth) {
            return <div key={day} className="py-1" aria-hidden="true" />;
          }
          return (
            <div key={day} className="flex flex-col items-center gap-1 py-1">
              {view === "week" ? (
                <span className="t-label">{weekdayLetter(day)}</span>
              ) : null}
              <span
                className="t-data inline-flex items-center justify-center"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  color: isToday ? "var(--color-manila)" : "var(--color-ink)",
                  background: isToday ? "var(--color-ink)" : "transparent",
                }}
              >
                {parseCivil(day).day}
              </span>
              <span
                className="day-tick"
                data-overdue={ticks.overdue}
                style={{
                  width: ticks.count ? 16 : 0,
                  opacity: ticks.count ? 1 : 0,
                }}
                aria-hidden="true"
              />
              {ticks.hasReport ? (
                <span style={{ color: "var(--color-gold-text)", lineHeight: 0 }}>
                  <IconFlag size={12} />
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      {overdue.length ? (
        <section className="pt-8">
          <h2 className="t-label" style={{ color: "var(--color-brick-text)" }}>
            Past due
          </h2>
          <div className="mt-2">
            {overdue.map((row) => (
              <div key={row.deadline.id} className="row">
                {/* One target, not a 21px link inside a row: the whole block is
                    the link, and the Done button sits outside it. */}
                <Link
                  href={`/pipeline/${row.deadline.grantId}`}
                  className="flex min-w-0 flex-1 flex-col justify-center no-underline"
                  style={{ minHeight: 44 }}
                >
                  <span
                    className="t-data block"
                    style={{ color: "var(--color-brick-text)" }}
                  >
                    {formatCivilShort(row.deadline.dueOn).toUpperCase()} ·{" "}
                    {deadlineKindLabel(row.deadline.kind).toUpperCase()} ·{" "}
                    {describeDue(row.deadline.dueOn, today).toUpperCase()}
                  </span>
                  <span className="t-title block truncate">{row.funderName}</span>
                  <span className="t-secondary block truncate">{row.deadline.label}</span>
                </Link>
                <form action={toggleDeadlineAction} className="shrink-0">
                  <input type="hidden" name="deadlineId" value={row.deadline.id} />
                  <input type="hidden" name="grantId" value={row.deadline.grantId} />
                  <input type="hidden" name="done" value="1" />
                  <button className="btn-quiet" type="submit">
                    Done
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="pt-8">
        <h2 className="t-label">
          {view === "month" ? `Everything in ${formatMonthLabel(anchor)}` : "Coming up"}
        </h2>

        {agenda.length === 0 ? (
          <div className="pt-4">
            <p className="t-body" style={{ color: "var(--color-ink-2)" }}>
              {view === "month"
                ? "No dates this month."
                : "Nothing dated yet. A grant with no date is a grant nothing can remind you about."}
            </p>
            <Link href="/pipeline" className="btn btn-primary mt-4 w-full lg:w-auto">
              Add a grant and its deadline
            </Link>
          </div>
        ) : (
          <div className="mt-2">
            {agenda.map((row) => {
              const late =
                row.deadline.completedAt === null &&
                daysBetween(today, row.deadline.dueOn) < 0;
              const isReport =
                row.deadline.kind === "report" || row.deadline.kind === "renewal";
              return (
                <Link
                  key={row.deadline.id}
                  href={`/pipeline/${row.deadline.grantId}`}
                  className="row"
                >
                  <span
                    className="t-data shrink-0"
                    style={{
                      width: 62,
                      color: late ? "var(--color-brick-text)" : "var(--color-ink-2)",
                      textDecoration: row.deadline.completedAt ? "line-through" : "none",
                    }}
                  >
                    {formatCivilShort(row.deadline.dueOn).toUpperCase()}
                  </span>
                  {isReport ? (
                    <span style={{ color: "var(--color-gold-text)", lineHeight: 0 }}>
                      <IconFlag size={16} />
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="t-title block truncate">{row.funderName}</span>
                    <span className="t-secondary block truncate">
                      {deadlineKindLabel(row.deadline.kind)} ·{" "}
                      {row.deadline.completedAt
                        ? "done"
                        : describeDue(row.deadline.dueOn, today)}
                      {row.askAmountCents ? ` · ${formatCents(row.askAmountCents)}` : ""}
                    </span>
                    <span
                      className="t-secondary block truncate"
                      style={{ color: "var(--color-ink-2)" }}
                    >
                      {row.deadline.label}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <p className="t-secondary rule-t mt-8 pt-4" style={{ color: "var(--color-ink-2)" }}>
        All dates are calendar dates in {org.timezone}, your organization&rsquo;s
        timezone — not UTC instants, so nothing shifts by a day when the clocks change.{" "}
        <Link href="/settings" className="btn-quiet" style={{ minHeight: 0 }}>
          Subscribe in Google or Outlook
        </Link>
      </p>
    </div>
  );
}
