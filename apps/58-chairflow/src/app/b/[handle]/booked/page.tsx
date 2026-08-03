import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { DetailRow } from "@/components/ui";
import { stylistByHandle } from "@/lib/auth";
import { formatWhen } from "@/lib/dates";
import { money, moneyShort } from "@/lib/format";
import { policySummary } from "@/lib/policy";
import { appointmentBundle, policyTerms } from "@/server/appointments";

export const metadata: Metadata = {
  title: "You're booked",
  // A manage link is a bearer credential into one appointment. This page carries one in its
  // query string, so it must never be indexed.
  robots: { index: false, follow: false },
};

/**
 * The confirmation. It exists to do two things: prove the booking happened, and hand over the
 * manage link — the one URL that lets somebody reschedule or cancel without an account.
 *
 * The policy is restated here with the stamp, because a confirmation that quietly drops the
 * thing the client agreed to is a confirmation that will be argued with later.
 */
export default async function BookedPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ a?: string; t?: string }>;
}) {
  const { handle } = await params;
  const query = await searchParams;
  const stylist = await stylistByHandle(handle);
  if (!stylist) notFound();

  const bundle = query.a ? await appointmentBundle(query.a) : null;
  if (!bundle || bundle.stylist.id !== stylist.id) {
    return (
      <main className="screen-plain" style={{ maxWidth: 480, paddingTop: 40 }}>
        <h1 className="t-h2" style={{ margin: 0 }}>
          We could not find that booking
        </h1>
        <p className="t-secondary" style={{ margin: "8px 0 24px" }}>
          If you have a confirmation text or email, the link in it still works. Otherwise, book
          again — nothing was charged.
        </p>
        <Link className="btn btn-primary" href={`/b/${handle}`}>
          Back to booking
        </Link>
      </main>
    );
  }

  const manageToken = query.t ?? null;

  return (
    <main className="screen-plain" style={{ maxWidth: 480, paddingTop: 40 }}>
      <span style={{ color: "var(--color-green)", display: "inline-flex" }}>
        <Icon name="check" size={22} />
      </span>
      <h1 className="t-h2" style={{ margin: "8px 0 0" }}>
        You&apos;re booked
      </h1>
      <p className="t-secondary" style={{ margin: "4px 0 24px" }}>
        {bundle.client.firstName}, {stylist.displayName} has you down. A confirmation is on its
        way to your phone.
      </p>

      <section className="card" style={{ padding: 16, marginBottom: 20 }}>
        <DetailRow term={bundle.service.name}>
          {moneyShort(bundle.appointment.priceCents)}
        </DetailRow>
        <DetailRow term="When">
          {formatWhen(stylist.timezone, bundle.appointment.startsAt)}
        </DetailRow>
        {stylist.chairLocation && <DetailRow term="Where">{stylist.chairLocation}</DetailRow>}
        {bundle.appointment.depositCents > 0 && (
          <DetailRow term="Deposit paid">{money(bundle.appointment.depositCents)}</DetailRow>
        )}
        {bundle.client.cardLast4 && (
          <DetailRow term="Card on file">····{bundle.client.cardLast4}</DetailRow>
        )}
      </section>

      {bundle.policy && (
        <section className="policy-panel" style={{ marginBottom: 20 }}>
          <p className="t-label" style={{ margin: 0 }}>
            What you agreed to
          </p>
          <p className="t-secondary" style={{ margin: "4px 0 12px" }}>
            {policySummary(policyTerms(bundle.policy))}
          </p>
          <p className="t-policy" style={{ margin: 0 }}>
            {bundle.policy.policyText}
          </p>
          <p
            className="t-mono"
            style={{
              margin: "12px 0 0",
              paddingTop: 12,
              borderTop: "1px solid var(--color-hairline)",
              color: "var(--color-ink-2)",
            }}
          >
            Agreed {bundle.appointment.policyAgreedAt.toISOString().slice(0, 16).replace("T", " ")} UTC
            · policy v{bundle.appointment.policyVersion}
          </p>
        </section>
      )}

      {manageToken && (
        <Link className="btn btn-secondary btn-full" href={`/a/${manageToken}`}>
          Reschedule or cancel
        </Link>
      )}
      <p className="t-secondary" style={{ margin: "16px 0 0" }}>
        Keep that link — it is the only thing you need to change this appointment. No account, no
        password.
      </p>
    </main>
  );
}
