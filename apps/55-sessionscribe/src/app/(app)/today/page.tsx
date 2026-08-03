import type { Metadata } from "next";
import Link from "next/link";
import { requirePractice } from "@/lib/auth";
import { sessionsForDay } from "@/lib/sessions";
import { inFlightCount } from "@/lib/pipeline";
import { listClients } from "@/lib/clients";
import { displayStatus, formatClock, formatDayLabel } from "@/lib/format";
import { SessionRow } from "@/components/SessionRow";
import { IconClockRound, IconPencilLine, IconPeople } from "@/components/icons";

export const metadata: Metadata = { title: "Today" };
export const dynamic = "force-dynamic";

/**
 * Today. The day label, the between-sessions clock, the day's rows, and one
 * primary action in the thumb zone.
 *
 * The clock is the product's device: while the pipeline is live it shows the
 * current time with what is happening beside it; otherwise it gives the day's
 * tally. Both are read from the same rows the list below renders, so the number
 * and the list can never disagree.
 */
export default async function TodayPage() {
  const { user, practice } = await requirePractice();
  const now = new Date();
  const [rows, inFlight, clients] = await Promise.all([
    sessionsForDay(practice.id, practice.timezone, now),
    inFlightCount(practice.id),
    listClients(practice.id),
  ]);

  const statuses = rows.map((row) =>
    displayStatus(
      {
        sessionStatus: row.session.status,
        noteStatus: row.note?.status ?? null,
        draftGeneratedAt: row.note?.draftGeneratedAt ?? null,
      },
      now,
    ),
  );
  const signed = statuses.filter((s) => s === "signed").length;
  const ready = statuses.filter((s) => s === "ready" || s === "unsigned").length;
  const failed = statuses.filter((s) => s === "failed").length;

  const firstRun = clients.length === 0 || rows.length === 0;

  return (
    <main className="screen pt-6">
      <p className="t-label">{formatDayLabel(now, practice.timezone)}</p>

      <div className="mt-3 flex items-baseline gap-3">
        <span className="t-clock">{formatClock(now, practice.timezone)}</span>
        <span className="t-secondary">
          {inFlight > 0 ? (
            <>
              {inFlight} session{inFlight === 1 ? "" : "s"} in the pipeline · drafts land
              here
            </>
          ) : rows.length > 0 ? (
            <>
              {rows.length} session{rows.length === 1 ? "" : "s"} · {signed} signed ·{" "}
              {ready} to review
              {failed > 0 ? ` · ${failed} failed` : ""}
            </>
          ) : (
            <>no sessions captured yet today</>
          )}
        </span>
      </div>

      {firstRun && (
        <section className="mt-6">
          <h2 className="t-label mb-3">First three steps</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <FirstRunCard
              done={Boolean(user.credentials)}
              icon={<IconPencilLine size={18} />}
              title={`Format set: ${user.defaultFormat.toUpperCase()}`}
              body={`Every draft arrives in ${user.defaultFormat.toUpperCase()} unless a client's template says otherwise.`}
              href="/settings"
              cta="Change format"
            />
            <FirstRunCard
              done={clients.length > 0}
              icon={<IconPeople size={18} />}
              title={
                clients.length > 0
                  ? `${clients.length} client label${clients.length === 1 ? "" : "s"}`
                  : "Add a client label"
              }
              body="Initials or a slot — never a full name. The product does not need one."
              href="/clients"
              cta={clients.length > 0 ? "Manage clients" : "Add a client"}
            />
            <FirstRunCard
              done={rows.length > 0}
              icon={<IconClockRound size={18} />}
              title="Capture a session"
              body="Record, upload a file, or type shorthand. A draft comes back in about two minutes."
              href="/capture"
              cta="Capture session"
            />
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="t-label mb-1">Today&rsquo;s sessions</h2>
        {rows.length === 0 ? (
          <p className="t-secondary py-4">
            Nothing captured today. When you finish a session, capture it here and the
            draft will be waiting before your next client sits down.
          </p>
        ) : (
          <div>
            {rows.map((row, i) => (
              <div
                key={row.session.id}
                className="enter"
                style={{ animationDelay: `${Math.min(i, 8) * 24}ms` }}
              >
                <SessionRow row={row} timeZone={practice.timezone} now={now} />
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="sticky-action">
        <Link className="btn btn-primary btn-full" href="/capture">
          Capture session
        </Link>
      </div>
    </main>
  );
}

function FirstRunCard({
  done,
  icon,
  title,
  body,
  href,
  cta,
}: {
  done: boolean;
  icon: React.ReactNode;
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="panel p-4">
      <div
        className="mb-2 flex items-center gap-2"
        style={{ color: done ? "var(--color-sage-text)" : "var(--color-ink-2)" }}
      >
        {icon}
        <span className="t-label" style={{ color: "inherit" }}>
          {done ? "done" : "next"}
        </span>
      </div>
      <p className="t-title mb-1">{title}</p>
      <p className="t-secondary mb-3">{body}</p>
      <Link className="btn-quiet btn-quiet-sm" href={href}>
        {cta}
      </Link>
    </div>
  );
}
