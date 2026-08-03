import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Icon } from "@/components/icons";
import { EmptyState, Figure, Pill, ScreenHeader } from "@/components/ui";
import { visitValueCentsFor, windowDaysFor } from "@/lib/attribution";
import { formatDay } from "@/lib/dates";
import { count, money, pluralize } from "@/lib/format";
import { holdoutComparison, ledgerRows, recoveredSummary } from "@/server/ledger";
import { unkeptBookings } from "@/server/queue";

export const metadata: Metadata = { title: "Attribution ledger" };
export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  const { practice, location } = await requireUser();
  const now = new Date();
  const windowDays = windowDaysFor(practice.settings);
  const visitValueCents = visitValueCentsFor(practice.settings);

  const [summary, rows, holdout, unkept] = await Promise.all([
    recoveredSummary({ locationId: location.id, now }),
    ledgerRows({ locationId: location.id, limit: 60 }),
    holdoutComparison({ locationId: location.id, days: 90, now }),
    unkeptBookings(location.id),
  ]);

  return (
    <main className="screen">
      <ScreenHeader
        label="Recovered production"
        title="The ledger"
        action={
          <Link href="/api/reports/owner" className="btn-quiet" prefetch={false}>
            <Icon name="download" size={18} />
          </Link>
        }
      />

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 16,
          paddingBottom: 16,
        }}
      >
        <Figure label="This month" value={money(summary.monthCents)} tone="aqua" />
        <Figure label="This quarter" value={money(summary.quarterCents)} />
        <Figure label="All time" value={money(summary.allTimeCents)} />
      </section>

      <p className="t-secondary" style={{ marginTop: 0 }}>
        A booking counts only when a touch reached the patient within {windowDays} days before it. Each
        attributed row is {money(visitValueCents)} — this practice&rsquo;s own estimated visit value at
        the moment of attribution. {summary.unattributedBookings}{" "}
        {pluralize(summary.unattributedBookings, "booking")} below{" "}
        {summary.unattributedBookings === 1 ? "has" : "have"} no qualifying touch and{" "}
        {summary.unattributedBookings === 1 ? "counts" : "count"} nothing.
      </p>

      {rows.length === 0 ? (
        <EmptyState
          icon="ledger-book"
          title="No bookings recorded yet"
          body="Every booking appears here — from a booking link, a front-desk call, or entered by hand — with the touch that earned it or the words “no qualifying touch”. There is no second, friendlier number anywhere in RecallDesk."
          action={{ href: "/queue", label: "Work today's queue" }}
        />
      ) : (
        <section style={{ marginTop: 8 }}>
          {rows.map((row) => (
            <details key={row.bookingId} className="hairline-b" style={{ padding: "12px 0" }}>
              <summary
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  cursor: "pointer",
                  listStyle: "none",
                }}
              >
                <span className="t-mono" style={{ color: "var(--color-ink-2)", whiteSpace: "nowrap" }}>
                  {formatDay(row.bookedAt)}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="t-title" style={{ display: "block" }}>
                    {row.patientName}
                  </span>
                  <span
                    className="t-secondary"
                    style={{ color: row.attribution ? "var(--color-ink-2)" : "var(--color-ink-2)" }}
                  >
                    {row.attribution
                      ? `${channelWord(row.attribution.touchChannel)} · ${row.attribution.daysBefore} ${pluralize(row.attribution.daysBefore, "day")} before`
                      : "no qualifying touch"}
                  </span>
                </span>
                <span
                  className="t-mono"
                  style={{ color: row.attribution ? "var(--color-ink)" : "var(--color-ink-2)" }}
                >
                  {row.attribution ? money(row.attribution.productionCents) : "—"}
                </span>
                <Icon name="chevron-right" size={18} style={{ color: "var(--color-ink-2)" }} />
              </summary>

              <div style={{ paddingTop: 12, display: "grid", gap: 6 }}>
                <Receipt term="Booked">{formatDay(row.bookedAt)}</Receipt>
                <Receipt term="Appointment">
                  {row.appointmentOn ? formatDay(row.appointmentOn) : "date not recorded"}
                </Receipt>
                <Receipt term="Source">{sourceWord(row.source)}</Receipt>
                {row.attribution ? (
                  <>
                    <Receipt term="Credited touch">
                      {channelWord(row.attribution.touchChannel)} on{" "}
                      {formatDay(row.attribution.touchOccurredAt)} ({row.attribution.touchStatus})
                    </Receipt>
                    <Receipt term="Window math">
                      {row.attribution.daysBefore} of {row.attribution.windowDays} days
                    </Receipt>
                    <Receipt term="Recovered">{money(row.attribution.productionCents)}</Receipt>
                    <p style={{ margin: "6px 0 0" }}>
                      <Pill tone="aqua">Attributed</Pill>
                    </p>
                  </>
                ) : (
                  <p className="t-secondary" style={{ margin: "6px 0 0" }}>
                    Nothing reached this patient in the {row.attribution ? "" : `${windowDays}-day `}window
                    before they booked, so this booking earns no attribution row. It is still a booking —
                    it is just not one we can claim credit for.
                  </p>
                )}
                <p style={{ margin: "6px 0 0" }}>
                  <Link href={`/patients/${row.patientId}`} className="btn-quiet">
                    Open patient
                  </Link>
                </p>
              </div>
            </details>
          ))}
        </section>
      )}

      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 16 }}>
        <p className="t-label" style={{ margin: "0 0 8px" }}>
          Would they have come back anyway?
        </p>
        {holdout.touchedPatients === 0 && holdout.untouchedPatients === 0 ? (
          <p className="t-secondary" style={{ margin: 0 }}>
            Not enough overdue history yet to compare contacted and uncontacted patients. This
            comparison appears once a campaign has been running for a few weeks.
          </p>
        ) : (
          <p className="t-secondary" style={{ margin: 0 }}>
            Over the last {holdout.days} days, {count(holdout.touchedReturned)} of{" "}
            {count(holdout.touchedPatients)} contacted overdue patients came back (
            {(holdout.touchedRate * 100).toFixed(1)}%). Of the {count(holdout.untouchedPatients)} nobody
            contacted, {count(holdout.untouchedReturned)} came back on their own (
            {(holdout.untouchedRate * 100).toFixed(1)}%). Difference:{" "}
            {holdout.liftPoints.toFixed(1)} percentage points.
          </p>
        )}
        {unkept > 0 && (
          <p className="t-secondary" style={{ marginTop: 8, marginBottom: 0 }}>
            {count(unkept)} {pluralize(unkept, "booking")} not yet confirmed as kept. A later import
            with appointment history fills that in, and the ledger will show no-shows honestly.
          </p>
        )}
      </section>
    </main>
  );
}

function Receipt({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
      <span className="t-secondary">{term}</span>
      <span className="t-mono" style={{ textAlign: "right" }}>
        {children}
      </span>
    </div>
  );
}

function channelWord(channel: "email" | "sms" | "call"): string {
  return channel === "sms" ? "Text" : channel === "email" ? "Email" : "Call";
}

function sourceWord(source: "booking_link" | "call" | "front_desk_manual"): string {
  return source === "booking_link"
    ? "booking link"
    : source === "call"
      ? "front-desk call"
      : "entered by hand";
}
