import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Icon } from "@/components/icons";
import { WeekStrip } from "@/components/WeekStrip";
import { Banner, EmptyState, Figure, MoneyStat, Pill } from "@/components/ui";
import { visitValueCentsFor, windowDaysFor } from "@/lib/attribution";
import { formatDayShort } from "@/lib/dates";
import { count, money, pluralize } from "@/lib/format";
import { monthlyCents, sendingAllowed } from "@/lib/plans";
import { ledgerRows, recoveredSummary, weekStrip } from "@/server/ledger";
import { overdueSummary } from "@/server/overdue";
import { queueProgress, queueDateFor, pendingBookingRequests } from "@/server/queue";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

export default async function DashboardPage() {
  const { practice, location, locations } = await requireUser();
  const now = new Date();
  const visitValueCents = visitValueCentsFor(practice.settings);
  const windowDays = windowDaysFor(practice.settings);
  const queueDate = queueDateFor(location.timezone, now);

  const [overdue, recovered, strip, recent, progress, requests] = await Promise.all([
    overdueSummary({ locationId: location.id, visitValueCents, today: now }),
    recoveredSummary({ locationId: location.id, now }),
    weekStrip({ locationId: location.id, now }),
    ledgerRows({ locationId: location.id, limit: 6 }),
    queueProgress({ locationId: location.id, queueDate }),
    pendingBookingRequests(location.id),
  ]);

  const gate = sendingAllowed(practice, now);
  const subscription = monthlyCents(practice.plan, Math.max(locations.length, practice.billedLocations));
  const multiple = subscription > 0 ? recovered.monthCents / subscription : 0;

  if (overdue.rosterSize === 0) {
    return (
      <main className="screen">
        <header style={{ paddingTop: 24, paddingBottom: 8 }}>
          <p className="t-label" style={{ margin: 0 }}>
            {MONTHS[now.getUTCMonth()]}
          </p>
          <h1 className="t-h2" style={{ margin: "4px 0 0" }}>
            Nothing imported yet
          </h1>
        </header>
        <EmptyState
          icon="arrow-up-doc"
          title="Your overdue list is one CSV away"
          body="Export an active-patient list from Dentrix, Eaglesoft, Open Dental or anything that writes a CSV. RecallDesk maps the columns, shows you a dry run, and only then touches your roster."
          action={{ href: "/imports", label: "Import your patient list" }}
        />
        <div className="thumb-bar">
          <Link href="/imports" className="btn btn-primary">
            Import your patient list
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="screen">
      <header
        style={{
          paddingTop: 24,
          paddingBottom: 4,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <p className="t-label" style={{ margin: 0 }}>
          {MONTHS[now.getUTCMonth()]} · RECOVERED
        </p>
        <Link href="/api/reports/owner" className="btn-quiet" prefetch={false}>
          Run report
        </Link>
      </header>

      <MoneyStat
        cents={recovered.monthCents}
        hint={`${count(recovered.monthBookings)} ${pluralize(recovered.monthBookings, "booking")} attributed · ${money(overdue.totalValueCents)} still overdue`}
      />

      {recovered.monthCents > 0 && subscription > 0 && (
        <p className="t-secondary" style={{ marginTop: 8, color: "var(--color-aqua-text)" }}>
          {multiple.toFixed(1)}× the {money(subscription)}/mo subscription, counted with a {windowDays}-day
          window.
        </p>
      )}

      {!gate.ok && <div style={{ marginTop: 16 }}><Banner tone="amber">{gate.reason}</Banner></div>}

      <div style={{ marginTop: 24 }}>
        <WeekStrip
          slots={strip.slots}
          recentAttributions={recent}
          totalAttributed={recovered.monthBookings}
        />
      </div>

      <section
        className="hairline-t"
        style={{
          marginTop: 24,
          paddingTop: 16,
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 16,
        }}
      >
        <Figure label="Overdue" value={count(overdue.totalPatients)} />
        <Figure label="Touches sent" value={count(recovered.touchesSentThisMonth)} />
        <Figure label="Quarter" value={money(recovered.quarterCents)} tone="aqua" />
      </section>

      {requests.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <p className="t-label" style={{ margin: 0 }}>
              Booking requests
            </p>
            <Link href="/queue" className="btn-quiet">
              Work them
            </Link>
          </div>
          {requests.slice(0, 3).map((request) => (
            <div key={request.id} className="row" style={{ gap: 10 }}>
              <span style={{ color: "var(--color-aqua)", lineHeight: 0 }}>
                <Icon name="link-token" size={18} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="t-title" style={{ display: "block" }}>
                  {request.patientName}
                </span>
                <span className="t-secondary">
                  asked for {request.preferredWindows.length}{" "}
                  {pluralize(request.preferredWindows.length, "window")} · {formatDayShort(request.createdAt)}
                </span>
              </span>
              <Pill tone="aqua">New</Pill>
            </div>
          ))}
        </section>
      )}

      <section style={{ marginTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <p className="t-label" style={{ margin: 0 }}>
            Latest ledger rows
          </p>
          <Link href="/ledger" className="btn-quiet">
            The ledger
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 8 }}>
            No bookings recorded yet. The first one will appear here with its receipt — or with
            &ldquo;no qualifying touch&rdquo; if nothing reached that patient inside the window.
          </p>
        ) : (
          recent.slice(0, 4).map((row) => (
            <div key={row.bookingId} className="row" style={{ gap: 10 }}>
              <span
                style={{
                  color: row.attribution ? "var(--color-aqua)" : "var(--color-ink-3)",
                  lineHeight: 0,
                }}
              >
                <Icon name={row.attribution ? "check-seat" : "calendar-slot"} size={18} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="t-title" style={{ display: "block" }}>
                  {row.patientName}
                </span>
                <span className="t-secondary">
                  {row.attribution
                    ? `${channelWord(row.attribution.touchChannel)} ${formatDayShort(row.attribution.touchOccurredAt)} → booked ${formatDayShort(row.bookedAt)}`
                    : `booked ${formatDayShort(row.bookedAt)} · no qualifying touch`}
                </span>
              </span>
              <span
                className="t-mono"
                style={{ color: row.attribution ? "var(--color-ink)" : "var(--color-ink-2)" }}
              >
                {row.attribution ? money(row.attribution.productionCents) : "—"}
              </span>
            </div>
          ))
        )}
      </section>

      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 16 }}>
        <p className="t-secondary" style={{ margin: 0 }}>
          Today&rsquo;s queue: {progress.worked} of {progress.total} worked
          {progress.booked > 0 ? `, ${progress.booked} booked` : ""}.
        </p>
      </section>

      <div className="thumb-bar">
        <Link href="/overdue" className="btn btn-primary">
          See your overdue list
        </Link>
      </div>
    </main>
  );
}

function channelWord(channel: "email" | "sms" | "call"): string {
  return channel === "sms" ? "Text" : channel === "email" ? "Email" : "Call";
}
