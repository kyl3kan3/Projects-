import type { Metadata } from "next";
import Link from "next/link";
import { CopyLink } from "@/app/(app)/page/CopyLink";
import { Banner, DetailRow, EmptyState, ScreenHeader } from "@/components/ui";
import { requireStylist } from "@/lib/auth";
import { duration, moneyShort } from "@/lib/format";
import { bookingPageLive, entitlement, type Billable } from "@/lib/plans";
import { depositRuleLabel, parseDepositRule, policySummary } from "@/lib/policy";
import { activeServices, currentPolicy, policyTerms } from "@/server/appointments";
import { waitlistFor } from "@/server/waitlist";

export const metadata: Metadata = { title: "Your booking page" };

/**
 * The link that goes in the bio, and an honest account of what a client sees when they tap
 * it right now — including the two states that make it useless: no services, and a closed
 * page.
 */
export default async function YourPagePage() {
  const { stylist } = await requireStylist();
  const base = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3058";
  const url = `${base}/b/${stylist.handle}`;
  const [services, policy, waitlist] = await Promise.all([
    activeServices(stylist.id),
    currentPolicy(stylist.id),
    waitlistFor(stylist.id),
  ]);
  const live = bookingPageLive(stylist as Billable);
  const ent = entitlement(stylist as Billable);

  return (
    <>
      <ScreenHeader label={`@${stylist.handle}`} title="Your booking page" />

      <section className="card" style={{ padding: 16, marginBottom: 20 }}>
        <CopyLink url={url} />
        <p style={{ margin: "12px 0 0" }}>
          <Link className="btn-quiet" href={`/b/${stylist.handle}`} target="_blank" rel="noreferrer">
            Open it the way a client sees it
          </Link>
        </p>
      </section>

      {!live && (
        <Banner tone="red">
          Your page is showing &quot;fully booked&quot; to anybody who opens it. {ent.state === "lapsed" ? ent.reason : ""}{" "}
          It never shows a client an error or a payment problem — your brand is not the
          hostage — but it is not taking bookings either.
        </Banner>
      )}

      {services.length === 0 ? (
        <EmptyState
          icon="policy-scroll"
          title="Nothing to book yet"
          body="A client who opens your link right now sees your name and nothing to tap. Add a service with a duration, a price and a deposit rule."
          action={{ href: "/settings/services", label: "Add your services" }}
        />
      ) : (
        <section style={{ paddingBottom: 20 }}>
          <p className="t-label" style={{ margin: "0 0 8px" }}>
            What they can book
          </p>
          {services.map((s) => (
            <DetailRow key={s.id} term={`${s.name} · ${duration(s.durationMinutes)}`}>
              {moneyShort(s.priceCents)}
              <span className="t-secondary" style={{ display: "block" }}>
                {depositRuleLabel(parseDepositRule(s.depositRule), s.priceCents)}
              </span>
            </DetailRow>
          ))}
        </section>
      )}

      <section style={{ paddingBottom: 20 }}>
        <p className="t-label" style={{ margin: "0 0 8px" }}>
          The policy they agree to
        </p>
        {policy ? (
          <>
            <p className="t-secondary" style={{ margin: "0 0 8px" }}>
              Version {policy.version} · {policySummary(policyTerms(policy))}
            </p>
            <div className="policy-panel">
              <p className="t-policy" style={{ margin: 0 }}>
                {policy.policyText}
              </p>
            </div>
            <p style={{ marginTop: 12 }}>
              <Link className="btn-quiet" href="/settings/policy">
                Edit the policy
              </Link>
            </p>
          </>
        ) : (
          <EmptyState
            icon="policy-scroll"
            title="No policy yet"
            body="Without a policy your page cannot take bookings — there would be nothing for a client to agree to, and nothing to justify a fee."
            action={{ href: "/settings/policy", label: "Set your policy" }}
          />
        )}
      </section>

      <section style={{ paddingBottom: 20 }}>
        <p className="t-label" style={{ margin: "0 0 8px" }}>
          Card on file
        </p>
        <p className="t-secondary" style={{ margin: 0 }}>
          {stylist.connectStatus === "active"
            ? "Stripe is connected, so deposits and no-show fees run on your own account. Client money never touches ours."
            : "Stripe is not connected yet, so your page takes bookings without holding a card. Clients still agree to your policy at booking — but there is nothing to charge if they do not show."}
        </p>
        {stylist.connectStatus !== "active" && (
          <p style={{ marginTop: 12 }}>
            <Link className="btn-quiet" href="/setup">
              Connect Stripe
            </Link>
          </p>
        )}
      </section>

      <section style={{ paddingBottom: 20 }}>
        <p className="t-label" style={{ margin: "0 0 8px" }}>
          Waitlist
        </p>
        {waitlist.length === 0 ? (
          <p className="t-secondary" style={{ margin: 0 }}>
            Nobody waiting. When a client asks for a time you do not have, add them from their
            card and the next cancellation offers itself to them.
          </p>
        ) : (
          <div className="stack">
            {waitlist.map(({ entry, client, service }) => (
              <DetailRow
                key={entry.id}
                term={`${client.firstName} ${client.lastName ?? ""} · ${service.name}`}
              >
                {entry.status === "offered" ? "offer out" : "waiting"}
              </DetailRow>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
