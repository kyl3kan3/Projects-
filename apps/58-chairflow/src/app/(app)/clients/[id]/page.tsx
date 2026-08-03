import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ConsentForm,
  NotesForm,
  NudgeNowForm,
  RemoveWaitlistForm,
  WaitlistForm,
} from "@/app/(app)/clients/[id]/ClientForms";
import { Icon } from "@/components/icons";
import { DetailRow, Figure, ScreenHeader, StatePill } from "@/components/ui";
import { requireStylist } from "@/lib/auth";
import { derivedState } from "@/lib/appointments";
import { daysOverdue, parseSettings } from "@/lib/cadence";
import {
  formatClockMeridiem,
  formatDayFull,
  formatDayShort,
  intervalPhrase,
  todayInTimezone,
} from "@/lib/dates";
import { moneyShort, phoneDisplay, phoneHref } from "@/lib/format";
import { featureAllowed, type Billable } from "@/lib/plans";
import {
  activeServices,
  clientHistory,
  clientMessages,
  clientWaitlist,
} from "@/server/appointments";
import { cadencesForClient, nudgeHistory } from "@/server/cadence";
import { clientById } from "@/server/clients";

export const metadata: Metadata = { title: "Client" };

/**
 * One client's card: their rhythm, their history, their card-on-file state, their no-show
 * record, and the two quiet actions DESIGN.md names — nudge now, waitlist add.
 *
 * Everything is readable whatever the subscription is doing; only the actions are gated,
 * and each gate says which plan it belongs to rather than hiding the control.
 */
export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { stylist } = await requireStylist();
  const { id } = await params;
  const client = await clientById(id, stylist.id);
  if (!client) notFound();

  const now = new Date();
  const today = todayInTimezone(stylist.timezone, now);
  const settings = parseSettings(stylist.settings);

  const [history, cadences, messages, waitlist, services, nudges] = await Promise.all([
    clientHistory(client.id),
    cadencesForClient(client.id),
    clientMessages(client.id),
    clientWaitlist(client.id),
    activeServices(stylist.id),
    nudgeHistory(client.id),
  ]);

  const notesGate = featureAllowed(stylist as Billable, "client_notes", now);
  const nudgeGate = featureAllowed(stylist as Billable, "cadence_nudges", now);
  const waitlistGate = featureAllowed(stylist as Billable, "waitlist", now);
  const completed = history.filter((h) => h.appointment.status === "completed");
  const rebooked = nudges.filter((n) => n.nudge.resultedAppointmentId).length;

  return (
    <>
      <ScreenHeader
        label={phoneDisplay(client.phone)}
        title={`${client.firstName} ${client.lastName ?? ""}`.trim()}
        action={
          <a className="btn-quiet" href={phoneHref(client.phone)}>
            Call
          </a>
        }
      />

      <section
        style={{
          display: "flex",
          gap: 24,
          flexWrap: "wrap",
          paddingBottom: 20,
          borderBottom: "1px solid var(--color-hairline)",
        }}
      >
        <Figure label="Visits" value={String(completed.length)} />
        <Figure
          label="No-shows"
          value={String(client.noShowCount)}
          tone={client.noShowCount > 0 ? "red" : undefined}
        />
        <Figure
          label="Card on file"
          value={client.defaultPaymentMethodId ? `····${client.cardLast4 ?? "----"}` : "none"}
          tone={client.defaultPaymentMethodId ? "cobalt" : "quiet"}
        />
        {rebooked > 0 && <Figure label="Rebooked by nudge" value={String(rebooked)} tone="green" />}
      </section>

      {cadences.length > 0 && (
        <section style={{ padding: "20px 0", borderBottom: "1px solid var(--color-hairline)" }}>
          <p className="t-label" style={{ margin: "0 0 8px" }}>
            Rhythm
          </p>
          {cadences.map(({ cadence, service }) => {
            const overdue = daysOverdue(cadence.nextDueOn, today);
            const drifted = overdue >= settings.nudgeGraceDays;
            return (
              <p
                key={cadence.id}
                className="t-secondary"
                style={{ margin: "0 0 4px", display: "flex", gap: 8, alignItems: "center" }}
              >
                {drifted && (
                  <span style={{ color: "var(--color-amber-text)", display: "inline-flex" }}>
                    <Icon name="pulse-return" size={18} />
                  </span>
                )}
                <span>
                  {service.name}:{" "}
                  <span className="t-mono">{intervalPhrase(cadence.medianIntervalDays)}</span>
                  {" · due "}
                  <span className="t-mono">{formatDayShort(cadence.nextDueOn)}</span>
                  {cadence.sampleCount < 2
                    ? " (estimated from an imported visit)"
                    : ` (from ${cadence.sampleCount} visits)`}
                  {drifted ? ` · ${overdue} days past due` : ""}
                </span>
              </p>
            );
          })}
          <div style={{ marginTop: 8 }}>
            <NudgeNowForm clientId={client.id} allowed={nudgeGate.ok} />
            {!nudgeGate.ok && (
              <p className="t-secondary" style={{ margin: "4px 0 0" }}>
                {nudgeGate.reason}
              </p>
            )}
          </div>
        </section>
      )}

      <section style={{ padding: "20px 0", borderBottom: "1px solid var(--color-hairline)" }}>
        <p className="t-label" style={{ margin: "0 0 8px" }}>
          Texts
        </p>
        <ConsentForm
          clientId={client.id}
          consent={client.smsConsent}
          optedOut={Boolean(client.smsOptedOutAt)}
        />
      </section>

      <section style={{ padding: "20px 0", borderBottom: "1px solid var(--color-hairline)" }}>
        <p className="t-label" style={{ margin: "0 0 8px" }}>
          History
        </p>
        {history.length === 0 ? (
          <p className="t-secondary" style={{ margin: 0 }}>
            No appointments yet. Their first booking through your page will show up here.
          </p>
        ) : (
          <div className="stack">
            {history.slice(0, 20).map(({ appointment, service }) => (
              <div key={appointment.id} className="row" style={{ minHeight: 48 }}>
                <span className="t-mono" style={{ minWidth: 88 }}>
                  {formatDayShort(todayInTimezone(stylist.timezone, appointment.startsAt))}
                </span>
                <span style={{ minWidth: 0, display: "grid", gap: 2, flex: 1 }}>
                  <span className="t-secondary" style={{ color: "var(--color-ink)" }}>
                    {service.name} · {formatClockMeridiem(stylist.timezone, appointment.startsAt)}
                  </span>
                  <StatePill state={derivedState(appointment, now)} />
                </span>
                <span className="t-mono">{moneyShort(appointment.priceCents)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ padding: "20px 0", borderBottom: "1px solid var(--color-hairline)" }}>
        <p className="t-label" style={{ margin: "0 0 8px" }}>
          Waitlist
        </p>
        {waitlist.length > 0 && (
          <div className="stack" style={{ gap: 8, paddingBottom: 12 }}>
            {waitlist.map(({ entry, service }) => (
              <RemoveWaitlistForm
                key={entry.id}
                clientId={client.id}
                entryId={entry.id}
                label={`${service.name} · ${entry.status === "offered" ? "offer out now" : "waiting"}`}
              />
            ))}
          </div>
        )}
        {services.length > 0 ? (
          <>
            <WaitlistForm clientId={client.id} services={services} allowed={waitlistGate.ok} />
            {!waitlistGate.ok && (
              <p className="t-secondary" style={{ margin: "8px 0 0" }}>
                {waitlistGate.reason}
              </p>
            )}
          </>
        ) : (
          <p className="t-secondary" style={{ margin: 0 }}>
            Add a service first and they can wait for it.
          </p>
        )}
      </section>

      <section style={{ padding: "20px 0", borderBottom: "1px solid var(--color-hairline)" }}>
        {notesGate.ok ? (
          <NotesForm clientId={client.id} notes={client.notes ?? ""} />
        ) : (
          <>
            <p className="t-label" style={{ margin: "0 0 4px" }}>
              Notes
            </p>
            <p className="t-secondary" style={{ margin: 0 }}>
              {client.notes || "No notes."}
            </p>
            <p className="t-secondary" style={{ margin: "8px 0 0" }}>
              {notesGate.reason}
            </p>
          </>
        )}
      </section>

      <section style={{ padding: "20px 0" }}>
        <p className="t-label" style={{ margin: "0 0 8px" }}>
          What we have sent them
        </p>
        {messages.length === 0 ? (
          <p className="t-secondary" style={{ margin: 0 }}>
            Nothing yet.
          </p>
        ) : (
          <div className="stack">
            {messages.map((m) => (
              <DetailRow
                key={m.id}
                term={`${m.kind.replace(/_/g, " ")} · ${m.channel}`}
              >
                {formatDayFull(todayInTimezone(stylist.timezone, m.occurredAt))}
                {m.simulated ? " · recorded, not sent" : m.status === "failed" ? " · failed" : ""}
              </DetailRow>
            ))}
          </div>
        )}
      </section>

      <p>
        <Link className="btn-quiet" href="/clients">
          <Icon name="chevron-left" size={18} />
          All clients
        </Link>
      </p>
    </>
  );
}
