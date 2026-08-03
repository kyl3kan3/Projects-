import type { Metadata } from "next";
import Link from "next/link";
import { PlanButton, PortalButton } from "@/app/(app)/settings/billing/BillingActions";
import { Banner, DetailRow, ScreenHeader } from "@/components/ui";
import { requireStylist } from "@/lib/auth";
import { stripeConfigured } from "@/lib/env";
import { money } from "@/lib/format";
import { PLAN_SPECS, entitlement, planName, trialDaysLeft, type Billable, type BillablePlan } from "@/lib/plans";

export const metadata: Metadata = { title: "Plan and billing" };

const ORDER: BillablePlan[] = ["chair", "book", "shop"];

/**
 * ChairFlow's own subscription. Three plans, a 14-day trial with no card, and the customer
 * portal for changes.
 *
 * What a lapsed plan does is stated here rather than discovered: the booking page closes and
 * nothing is sent or charged, while the client book, history and ledger stay readable. That
 * asymmetry is deliberate and it is worth being explicit about, because the alternative —
 * locking a stylist out of their own client list — is what makes people distrust software
 * they rent.
 */
export default async function BillingPage() {
  const { stylist } = await requireStylist();
  const ent = entitlement(stylist as Billable);
  const configured = stripeConfigured();

  return (
    <>
      <ScreenHeader label="Settings" title="Plan and billing" />

      <section style={{ paddingBottom: 20 }}>
        <DetailRow term="Current plan">{planName(stylist.plan)}</DetailRow>
        <DetailRow term="Status">
          {ent.state === "trial"
            ? `Trial · ${trialDaysLeft(stylist.trialEndsAt)} days left`
            : ent.state === "subscribed"
              ? `Subscribed · ${ent.status}`
              : ent.state === "past_due"
                ? "Payment failed · everything still working"
                : "Lapsed"}
        </DetailRow>
      </section>

      {ent.state === "lapsed" && (
        <Banner tone="red">
          {ent.reason} Your booking page shows &quot;fully booked&quot;, reminders and nudges
          are paused, and no fee will be charged. Your clients, their history and the ledger
          stay readable.
        </Banner>
      )}

      {!configured && (
        <Banner tone="amber">
          Stripe is not configured in this environment, so checkout cannot open. The plans and
          what they include are below; the buttons will say the same thing if you tap them.
        </Banner>
      )}

      <section style={{ paddingTop: 16 }}>
        {ORDER.map((plan) => {
          const spec = PLAN_SPECS[plan];
          const isCurrent =
            (plan === "chair" && (stylist.plan === "chair" || stylist.plan === "shop_member")) ||
            (plan === "book" && stylist.plan === "book");
          return (
            <div
              key={plan}
              className="card"
              style={{ padding: 16, marginBottom: 12, display: "grid", gap: 8 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                <span className="t-title">{spec.name}</span>
                <span className="t-mono" style={{ fontSize: "1.0625rem" }}>
                  {money(spec.priceCents)}/mo
                </span>
              </div>
              <p className="t-secondary" style={{ margin: 0 }}>
                {spec.tagline}
              </p>
              <ul className="t-secondary" style={{ margin: 0, paddingLeft: 20 }}>
                {spec.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <PlanButton
                plan={plan}
                current={isCurrent}
                label={isCurrent ? `Stay on ${spec.name}` : `Switch to ${spec.name}`}
              />
            </div>
          );
        })}
      </section>

      <section style={{ paddingBottom: 24 }}>
        <p className="t-secondary" style={{ margin: "0 0 12px" }}>
          Annual billing is two months free. Deposits and no-show fees are processed on your
          own Stripe account at Stripe&apos;s standard rates — ChairFlow takes no cut of them.
        </p>
        <PortalButton />
      </section>

      <p>
        <Link className="btn-quiet" href="/settings">
          Back to settings
        </Link>
      </p>
    </>
  );
}
