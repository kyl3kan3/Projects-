import type { Metadata } from "next";
import Link from "next/link";
import { requireFirm } from "@/lib/auth";
import { listDeadlines } from "@/lib/deadlines";
import { hasIcsToken } from "@/lib/ics";
import {
  deadlineKindLabel,
  deadlineTone,
  formatCountdown,
  formatDayTime,
  formatWeekday,
} from "@/lib/format";
import { CalendarTick } from "@/components/icons";
import { completeDeadlineAction } from "../pursuits/actions";

export const metadata: Metadata = { title: "Deadlines" };

/**
 * /deadlines — every date, in one list, in the firm's timezone.
 *
 * No boxes: full-bleed rows of at least 56px, hairline between, a dot on the left
 * whose colour matches the countdown on the right. The countdown turns amber at
 * T-7 and red once it is past — and it is computed as of now, every render, rather
 * than read from a status column a cron reconciles. That is how an invoice ends up
 * rendering "Due" 212 days late.
 */
export default async function DeadlinesPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { firm } = await requireFirm();
  const { show } = await searchParams;
  const includeCompleted = show === "all";
  const tz = firm.timezone;
  const now = new Date();

  const rows = await listDeadlines(firm.id, { includeCompleted });
  const hasFeed = await hasIcsToken(firm.id);

  const overdue = rows.filter(
    (row) => !row.deadline.completedAt && deadlineTone(row.deadline.dueAt, tz, null, now) === "over",
  );
  const soon = rows.filter(
    (row) => !row.deadline.completedAt && deadlineTone(row.deadline.dueAt, tz, null, now) === "soon",
  );

  return (
    <main className="pt-4">
      <h1 className="t-h2">Deadlines</h1>
      <p className="t-secondary mt-2">
        {overdue.length > 0 ? `${overdue.length} overdue · ` : ""}
        {soon.length} due within seven days · {rows.length} tracked · all times{" "}
        {tz.replace(/_/g, " ")}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Link href={includeCompleted ? "/deadlines" : "/deadlines?show=all"} className="btn-quiet">
          {includeCompleted ? "Hide completed" : "Show completed"}
        </Link>
        <Link href="/settings#calendar" className="btn-quiet">
          <CalendarTick size={18} /> {hasFeed ? "Calendar feed" : "Subscribe in your calendar"}
        </Link>
      </div>

      <section className="rows mt-5">
        {rows.map((row) => {
          const tone = deadlineTone(row.deadline.dueAt, tz, row.deadline.completedAt, now);
          const countdownColor =
            tone === "over"
              ? "var(--color-red)"
              : tone === "soon"
                ? "var(--color-amber-text)"
                : tone === "done"
                  ? "var(--color-green-text)"
                  : "var(--color-ink-3)";
          const dotColor =
            tone === "over"
              ? "var(--color-red)"
              : tone === "soon"
                ? "var(--color-amber)"
                : tone === "done"
                  ? "var(--color-green)"
                  : "var(--color-ink-3)";
          return (
            <div
              key={row.deadline.id}
              className="py-3 flex items-center gap-3 beat-row"
              style={{ minHeight: 56 }}
            >
              <span className="pill-dot" style={{ background: dotColor }} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="t-label">
                  {formatWeekday(row.deadline.dueAt, tz)} · {deadlineKindLabel(row.deadline.kind)}
                </p>
                <p className="t-title mt-1">
                  {row.pursuitId ? (
                    <Link
                      href={`/pursuits/${row.pursuitId}`}
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      {row.deadline.label}
                    </Link>
                  ) : (
                    row.deadline.label
                  )}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="t-mono">{formatDayTime(row.deadline.dueAt, tz)}</p>
                <p className="t-mono mt-1" style={{ color: countdownColor }}>
                  {row.deadline.completedAt
                    ? "done"
                    : formatCountdown(row.deadline.dueAt, tz, now)}
                </p>
              </div>
              <form action={completeDeadlineAction}>
                <input type="hidden" name="deadlineId" value={row.deadline.id} />
                <input type="hidden" name="complete" value={row.deadline.completedAt ? "0" : "1"} />
                <button className="btn-quiet" type="submit">
                  {row.deadline.completedAt ? "Reopen" : "Done"}
                </button>
              </form>
            </div>
          );
        })}

        {rows.length === 0 && (
          <div className="py-4">
            <p className="t-body">
              No dates yet. Pursuing a notice copies its published questions and proposal dates in
              here automatically, and you can add orals or internal milestones by hand on any
              pursuit.
            </p>
            <Link href="/radar" className="btn btn-primary w-full mt-4">
              Open the radar
            </Link>
          </div>
        )}
      </section>

      {rows.length > 0 && (
        <p className="t-secondary mt-5">
          Reminders go out at T-7, T-3 and T-1 — once each, to every seat, and to Slack if you have
          set a webhook. Marking a date done or closing its pursuit stops them.
        </p>
      )}
    </main>
  );
}
