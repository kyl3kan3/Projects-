import type { Metadata } from "next";
import Link from "next/link";
import { CancelForm, RescheduleForm } from "@/app/a/[token]/ManageForms";
import { DetailRow } from "@/components/ui";
import { cancelConsequence, derivedState, stateLabel } from "@/lib/appointments";
import { formatWhen } from "@/lib/dates";
import { money, moneyShort, phoneDisplay } from "@/lib/format";
import { cancellationOutcome, computeFee, policySummary } from "@/lib/policy";
import { hashMatches, verifyToken } from "@/lib/tokens";
import { appointmentBundle, bookableDays, openSlots, policyTerms } from "@/server/appointments";

export const metadata: Metadata = {
  title: "Your appointment",
  robots: { index: false, follow: false },
};

/**
 * Manage one appointment, from the link in a confirmation. No account, no password.
 *
 * The policy window does the talking. Outside it, both actions are free and instant. Inside
 * it, the page states the consequence in plain words *before* the tap — and the words come
 * from the same arithmetic that would run the charge, so what it says is what happens.
 *
 * An expired or superseded link gets a calm page with the stylist's name, never a stack trace:
 * the person holding a stale link did nothing wrong.
 */
export default async function ManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ moved?: string; cancelled?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;

  const verified = await verifyToken("manage", token);
  const bundle = verified ? await appointmentBundle(verified.subjectId) : null;

  if (!verified || !bundle) return <Expired />;
  if (!hashMatches(bundle.appointment.manageTokenHash, verified.hash)) {
    return <Superseded stylistName={bundle.stylist.displayName} handle={bundle.stylist.handle} />;
  }

  const now = new Date();
  const { appointment, client, service, stylist, policy } = bundle;
  const state = derivedState(appointment, now);
  const terms = policy ? policyTerms(policy) : null;

  if (query.cancelled === "1" || appointment.status === "cancelled" || appointment.status === "late_cancelled") {
    return (
      <main className="screen-plain" style={{ maxWidth: 480, paddingTop: 40 }}>
        <p className="t-label" style={{ margin: 0 }}>
          {stylist.displayName}
        </p>
        <h1 className="t-h2" style={{ margin: "4px 0 8px" }}>
          Cancelled
        </h1>
        <p className="t-secondary" style={{ margin: "0 0 24px" }}>
          Your {service.name.toLowerCase()} on {formatWhen(stylist.timezone, appointment.startsAt)} is
          cancelled.
          {appointment.status === "late_cancelled"
            ? " It was inside the cancellation window, so the policy you agreed to applied."
            : ""}
        </p>
        <Link className="btn btn-primary btn-full" href={`/b/${stylist.handle}`}>
          Book again
        </Link>
      </main>
    );
  }

  if (appointment.status !== "booked") {
    return (
      <main className="screen-plain" style={{ maxWidth: 480, paddingTop: 40 }}>
        <p className="t-label" style={{ margin: 0 }}>
          {stylist.displayName}
        </p>
        <h1 className="t-h2" style={{ margin: "4px 0 8px" }}>
          {stateLabel(state)}
        </h1>
        <p className="t-secondary" style={{ margin: "0 0 24px" }}>
          This appointment is closed, so there is nothing left to change here.
        </p>
        <Link className="btn btn-primary btn-full" href={`/b/${stylist.handle}`}>
          Book again
        </Link>
      </main>
    );
  }

  const outcome = terms
    ? cancellationOutcome({
        startsAt: appointment.startsAt,
        now,
        cancelWindowHours: terms.cancelWindowHours,
      })
    : "free";
  const computation = terms
    ? computeFee({
        priceCents: appointment.priceCents,
        depositCents: appointment.depositCents,
        terms,
        kind: "late_cancel_fee",
      })
    : null;
  const consequence = cancelConsequence({
    outcome,
    cancelWindowHours: terms?.cancelWindowHours ?? 24,
    feeCents: computation?.feeCents ?? 0,
    depositAppliedCents: computation?.depositAppliedCents ?? 0,
  });

  const days = bookableDays(stylist, 14, now);
  const slotDays = await openSlots({
    stylist,
    service,
    days,
    now,
    excludeAppointmentId: appointment.id,
  });
  const slots = slotDays
    .flatMap((d) => d.slots.map((s) => ({ iso: s.startsAt.toISOString(), day: d.day, startsAt: s.startsAt })))
    .slice(0, 60)
    .map((s) => ({ iso: s.iso, day: s.day, label: formatWhen(stylist.timezone, s.startsAt) }));

  return (
    <main className="screen-plain" style={{ maxWidth: 480, paddingTop: 40 }}>
      <p className="t-label" style={{ margin: 0 }}>
        {stylist.displayName}
      </p>
      <h1 className="t-h2" style={{ margin: "4px 0 8px" }}>
        Your appointment
      </h1>
      {query.moved === "1" && (
        <p className="t-secondary" style={{ margin: "0 0 16px", color: "var(--color-green)" }}>
          Moved. Your old time has been freed up for somebody else.
        </p>
      )}

      <section className="card" style={{ padding: 16, marginBottom: 20 }}>
        <DetailRow term={service.name}>{moneyShort(appointment.priceCents)}</DetailRow>
        <DetailRow term="When">{formatWhen(stylist.timezone, appointment.startsAt)}</DetailRow>
        {stylist.chairLocation && <DetailRow term="Where">{stylist.chairLocation}</DetailRow>}
        <DetailRow term="Booked for">{`${client.firstName} · ${phoneDisplay(client.phone)}`}</DetailRow>
        {appointment.depositCents > 0 && (
          <DetailRow term="Deposit paid">{money(appointment.depositCents)}</DetailRow>
        )}
      </section>

      {policy && (
        <section className="policy-panel" style={{ marginBottom: 20 }}>
          <p className="t-label" style={{ margin: 0 }}>
            The policy you agreed to
          </p>
          <p className="t-secondary" style={{ margin: "4px 0 12px" }}>
            {policySummary(policyTerms(policy))}
          </p>
          <p className="t-policy" style={{ margin: 0 }}>
            {policy.policyText}
          </p>
        </section>
      )}

      <section style={{ paddingBottom: 24 }}>
        <p className="t-label" style={{ margin: "0 0 12px" }}>
          Move it
        </p>
        <RescheduleForm token={token} slots={slots} />
        <p className="t-secondary" style={{ margin: "8px 0 0" }}>
          Moving is always free, whenever you do it. Only not turning up costs anything.
        </p>
      </section>

      <section
        style={{ paddingTop: 20, paddingBottom: 24, borderTop: "1px solid var(--color-hairline)" }}
      >
        <p className="t-label" style={{ margin: "0 0 12px" }}>
          Cancel it
        </p>
        <CancelForm
          token={token}
          consequence={consequence}
          feeLabel={
            outcome === "late_cancel" && computation && computation.feeCents > 0
              ? money(computation.chargeCents > 0 ? computation.chargeCents : computation.feeCents)
              : null
          }
        />
      </section>
    </main>
  );
}

function Expired() {
  return (
    <main className="screen-plain" style={{ maxWidth: 480, paddingTop: 40 }}>
      <h1 className="t-h2" style={{ margin: 0 }}>
        This link has expired
      </h1>
      <p className="t-secondary" style={{ margin: "8px 0 0" }}>
        Manage links last a few months and are replaced whenever an appointment moves. If you
        need to change something, the most recent confirmation you were sent has the current
        link — or just text your stylist.
      </p>
    </main>
  );
}

function Superseded({ stylistName, handle }: { stylistName: string; handle: string }) {
  return (
    <main className="screen-plain" style={{ maxWidth: 480, paddingTop: 40 }}>
      <h1 className="t-h2" style={{ margin: 0 }}>
        There is a newer link
      </h1>
      <p className="t-secondary" style={{ margin: "8px 0 24px" }}>
        This appointment has moved since this link was sent, so it no longer opens it. Your most
        recent confirmation from {stylistName} has the current one.
      </p>
      <Link className="btn btn-secondary btn-full" href={`/b/${handle}`}>
        Book with {stylistName}
      </Link>
    </main>
  );
}
