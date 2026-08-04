import type { Metadata } from "next";
import Link from "next/link";
import { CancelRow } from "@/app/(app)/today/CancelRow";
import { ResolveCard, type FeeMath } from "@/app/(app)/today/ResolveCard";
import { Icon } from "@/components/icons";
import {
  CardOnFile,
  EmptyState,
  ProtectedStat,
  ScreenHeader,
  StatePill,
} from "@/components/ui";
import { requireStylist } from "@/lib/auth";
import { derivedState } from "@/lib/appointments";
import { formatClock, formatDayLabel, todayInTimezone } from "@/lib/dates";
import { moneyShort } from "@/lib/format";
import { summarizeLedger, summarySentence } from "@/lib/ledger";
import { computeFee, parseDepositRule } from "@/lib/policy";
import {
  activeServices,
  currentPolicy,
  dayAppointments,
  openSlots,
  policyForVersion,
  policyTerms,
} from "@/server/appointments";
import { awaitingVerdict } from "@/server/jobs";
import { ledgerRows } from "@/server/ledger";

export const metadata: Metadata = { title: "Today" };

/**
 * The stylist's home screen: what is happening today, what needs a verdict, and the
 * running total of money the policy has protected this month.
 *
 * The appointment rows carry their state as a pill as well as by colour, and the state is
 * derived from the clock rather than read from a status column — so a row never says
 * "Booked" about an appointment that ended on Tuesday.
 */
export default async function TodayPage() {
  const { stylist } = await requireStylist();
  const now = new Date();
  const today = todayInTimezone(stylist.timezone, now);

  const [rows, awaiting, ledger, services, policy] = await Promise.all([
    dayAppointments(stylist.id, stylist.timezone, today),
    awaitingVerdict(stylist.id, now),
    ledgerRows({ stylistId: stylist.id, timezone: stylist.timezone, now }),
    activeServices(stylist.id),
    currentPolicy(stylist.id),
  ]);

  const summary = summarizeLedger(ledger);

  // Open slots use the shortest active service: it is the most optimistic honest answer
  // to "what could still be booked today", and a longer service simply sees fewer.
  const shortest = services.reduce<(typeof services)[number] | null>(
    (best, s) => (!best || s.durationMinutes < best.durationMinutes ? s : best),
    null,
  );
  const open = shortest
    ? ((await openSlots({ stylist, service: shortest, days: [today], now }))[0]?.slots ?? [])
    : [];

  const feeMaths = new Map<string, FeeMath>();
  for (const row of awaiting) {
    const bookedUnder =
      (await policyForVersion(stylist.id, row.appointment.policyVersion)) ?? policy;
    if (!bookedUnder) continue;
    const computation = computeFee({
      priceCents: row.appointment.priceCents,
      depositCents: row.appointment.depositCents,
      terms: policyTerms(bookedUnder),
      kind: "no_show_fee",
    });
    feeMaths.set(row.appointment.id, {
      priceCents: row.appointment.priceCents,
      percent: computation.percent,
      feeCents: computation.feeCents,
      depositCents: row.appointment.depositCents,
      depositAppliedCents: computation.depositAppliedCents,
      chargeCents: computation.chargeCents,
      policyVersion: bookedUnder.version,
      hasCardOnFile: Boolean(row.client.defaultPaymentMethodId),
      cardLast4: row.client.cardLast4,
    });
  }

  const timeline = [
    ...rows.map((r) => ({ kind: "appointment" as const, at: r.appointment.startsAt, row: r })),
    ...open.map((s) => ({ kind: "open" as const, at: s.startsAt, row: null })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <>
      <ScreenHeader
        label={formatDayLabel(today)}
        title="Today"
        action={
          <Link className="btn-quiet" href="/page" style={{ whiteSpace: "nowrap" }}>
            Share your link
          </Link>
        }
      />

      <section style={{ paddingBottom: 24 }}>
        <p className="t-label" style={{ margin: 0 }}>
          Protected this month
        </p>
        <ProtectedStat cents={summary.protectedCents} hint={summarySentence(summary)} />
      </section>

      {awaiting.length > 0 && (
        <section className="stack" style={{ gap: 12, paddingBottom: 24 }}>
          <p className="t-label" style={{ margin: 0 }}>
            {awaiting.length} {awaiting.length === 1 ? "appointment needs" : "appointments need"} a
            verdict
          </p>
          {awaiting.map((row) => {
            const math = feeMaths.get(row.appointment.id);
            if (!math) return null;
            return (
              <ResolveCard
                key={row.appointment.id}
                appointmentId={row.appointment.id}
                clientName={`${row.client.firstName} ${row.client.lastName ?? ""}`.trim()}
                serviceName={row.service.name}
                timeLabel={formatClock(stylist.timezone, row.appointment.startsAt)}
                math={math}
              />
            );
          })}
        </section>
      )}

      <section className="stack" style={{ gap: 8 }}>
        <p className="t-label" style={{ margin: 0 }}>
          The day
        </p>

        {timeline.length === 0 ? (
          <EmptyState
            icon="day-grid"
            title="Nothing on the book today"
            body={
              services.length === 0
                ? "Add your services and your policy first — then your booking page can start filling this in."
                : "Share your booking link and the day fills itself. You can also add an appointment by hand."
            }
            action={
              services.length === 0
                ? { href: "/settings/services", label: "Add your services" }
                : { href: "/page", label: "Share your booking link" }
            }
          />
        ) : (
          timeline.map((item, i) =>
            item.kind === "appointment" ? (
              <AppointmentSlot
                key={item.row.appointment.id}
                index={i}
                timezone={stylist.timezone}
                row={item.row}
                now={now}
              />
            ) : (
              <div
                key={`open-${item.at.toISOString()}`}
                className="slot slot-open enter"
                style={{ animationDelay: `${Math.min(i, 8) * 24}ms` }}
              >
                <span className="slot-time">{formatClock(stylist.timezone, item.at)}</span>
                <span className="t-secondary">open</span>
              </div>
            ),
          )
        )}
      </section>

      <div className="thumb-bar">
        <Link className="btn btn-primary" href="/today/new">
          <Icon name="plus" size={18} />
          Add appointment
        </Link>
      </div>
    </>
  );
}

function AppointmentSlot({
  row,
  timezone,
  now,
  index,
}: {
  row: Awaited<ReturnType<typeof dayAppointments>>[number];
  timezone: string;
  now: Date;
  index: number;
}) {
  const state = derivedState(row.appointment, now);
  const deposit = parseDepositRule(row.service.depositRule);
  return (
    <div>
    <Link
      href={`/clients/${row.client.id}`}
      className="slot enter"
      data-state={row.appointment.status}
      style={{ animationDelay: `${Math.min(index, 8) * 24}ms` }}
    >
      <span className="slot-time">{formatClock(timezone, row.appointment.startsAt)}</span>
      <span style={{ minWidth: 0, display: "grid", gap: 2 }}>
        <span className="t-title" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.client.firstName} {row.client.lastName ?? ""}
        </span>
        <span className="t-secondary">
          {row.service.name}
          {row.appointment.depositCents > 0
            ? ` · ${moneyShort(row.appointment.depositCents)} deposit`
            : deposit.kind === "none"
              ? ""
              : " · no deposit taken"}
        </span>
        <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <StatePill state={state} />
          {row.charge?.status === "failed" && (
            <span className="t-secondary" style={{ color: "var(--color-red)" }}>
              fee declined
            </span>
          )}
        </span>
      </span>
      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        {row.client.defaultPaymentMethodId && <CardOnFile last4={row.client.cardLast4} />}
        <span className="slot-price">{moneyShort(row.appointment.priceCents)}</span>
      </span>
    </Link>
      {state === "upcoming" && (
        <CancelRow
          appointmentId={row.appointment.id}
          label={`${formatClock(timezone, row.appointment.startsAt)} ${row.client.firstName}`}
        />
      )}
    </div>
  );
}
