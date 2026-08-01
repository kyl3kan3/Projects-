import type { Metadata } from "next";
import Link from "next/link";
import { requireMerchant } from "@/lib/auth";
import { IconCheck } from "@/components/icons";
import { count, shortDate } from "@/lib/format";
import { has } from "@/lib/env";
import { getSubscription } from "@/lib/billing";
import { meteringFor } from "@/lib/metering";
import { PAID_TIERS, PLANS, plan, TIER_ORDER } from "@/lib/plans";
import { portalAction, upgradeAction } from "../actions";

export const metadata: Metadata = { title: "Plan and billing" };
export const dynamic = "force-dynamic";

const FEATURE_LABEL: Record<string, string> = {
  emailRequests: "Email review requests",
  photoReviews: "Photo reviews",
  incentives: "Discount incentives",
  smsRequests: "SMS requests",
  imports: "Review imports",
  videoReviews: "Video reviews",
  abTesting: "A/B testing",
  apiAccess: "API access",
};

/** Declared in the pricing table but not metered at MVP — said out loud, not hidden. */
const NOT_YET_BUILT = new Set(["smsRequests", "videoReviews", "abTesting", "apiAccess"]);

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string; error?: string }>;
}) {
  const { merchant } = await requireMerchant();
  const { upgraded, error } = await searchParams;
  const [subscription, metering] = await Promise.all([
    getSubscription(merchant.id),
    meteringFor(merchant.id, merchant.tier),
  ]);
  const current = plan(merchant.tier);
  const configured = has("STRIPE_SECRET_KEY");

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <Link href="/settings" className="btn-quiet no-underline">
          Settings
        </Link>
        <h1 className="t-h2 mt-3">Plan and billing</h1>
        <p className="t-secondary mt-1">
          On {current.name} &middot; {count(metering.used)} of{" "}
          {metering.limit === null ? "unlimited" : count(metering.limit)} orders this period
        </p>
      </header>

      {upgraded ? (
        <p className="card mb-6 p-4 t-secondary" role="status" style={{ color: "var(--color-leaf)" }}>
          Payment received. Your new limits are live, and the order period restarted from today.
        </p>
      ) : null}
      {error ? (
        <p className="card mb-6 p-4 t-secondary" role="alert" style={{ color: "var(--color-red)" }}>
          {error === "checkout"
            ? "Stripe would not open a checkout session. Nothing was charged."
            : "Stripe would not open the billing portal."}
        </p>
      ) : null}

      <section className="mb-10 flex flex-col gap-4">
        {TIER_ORDER.map((tier) => {
          const p = PLANS[tier];
          const isCurrent = tier === merchant.tier;
          return (
            <article
              key={tier}
              className="card p-4"
              style={{ borderColor: isCurrent ? "var(--color-gold)" : undefined }}
            >
              <div className="flex items-baseline justify-between gap-4">
                <p className="t-title">{p.name}</p>
                <p className="t-data" style={{ fontSize: 20 }}>
                  {p.priceMonthly === 0 ? "$0" : `$${p.priceMonthly}/mo`}
                </p>
              </div>
              <p className="t-secondary mt-1">{p.blurb}</p>

              <ul className="mt-3 flex flex-col gap-1.5">
                <Feature>
                  {p.ordersPerMonth === null
                    ? `Unlimited orders (fair use at ${count(p.softCapOrders ?? 0)})`
                    : `${count(p.ordersPerMonth)} orders a month`}
                </Feature>
                <Feature>
                  {p.widgetTypes.length === 1
                    ? "Badge widget"
                    : "Wall, carousel, badge, and star snippet"}
                </Feature>
                {p.features.map((feature) => (
                  <Feature key={feature} pending={NOT_YET_BUILT.has(feature)}>
                    {FEATURE_LABEL[feature]}
                    {NOT_YET_BUILT.has(feature) ? " — not shipped yet" : ""}
                  </Feature>
                ))}
                <Feature>
                  {p.branding === "removed"
                    ? "No TrustBadge branding"
                    : p.branding === "optional"
                      ? "Branding link optional"
                      : "Small “Reviews by TrustBadge” link"}
                </Feature>
              </ul>

              <div className="mt-4">
                {isCurrent ? (
                  <p className="t-label" style={{ color: "var(--color-gold)" }}>
                    Current plan
                  </p>
                ) : PAID_TIERS.includes(tier as Exclude<typeof tier, "free">) && configured ? (
                  <form action={upgradeAction}>
                    <input type="hidden" name="tier" value={tier} />
                    <button className="btn btn-primary btn-full" type="submit">
                      {current.priceMonthly < p.priceMonthly
                        ? `Upgrade to ${p.name}`
                        : `Switch to ${p.name}`}
                    </button>
                  </form>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>

      {subscription ? (
        <section className="mb-10">
          <p className="t-label mb-3">Subscription</p>
          <div className="card p-4">
            <Row label="Status" value={subscription.status} />
            {subscription.currentPeriodEnd ? (
              <Row
                label={subscription.cancelAtPeriodEnd ? "Ends" : "Renews"}
                value={shortDate(subscription.currentPeriodEnd)}
              />
            ) : null}
          </div>
          <form action={portalAction} className="mt-4">
            <button className="btn btn-secondary" type="submit">
              Manage payment and invoices
            </button>
          </form>
        </section>
      ) : null}

      <p className="t-secondary pb-8">
        Downgrades never delete anything. Drop to Free and your wall widget keeps its settings, its
        photos, and every imported review — the storefront falls back to the badge until you upgrade
        again. Going over an order limit stops new requests being scheduled; it never stops orders
        being recorded.
        {!configured ? " Billing is not configured on this deployment." : ""}
      </p>
    </main>
  );
}

function Feature({ children, pending }: { children: React.ReactNode; pending?: boolean }) {
  return (
    <li className="flex items-start gap-2">
      <span style={{ color: pending ? "var(--color-text-3)" : "var(--color-leaf)", marginTop: 2 }}>
        <IconCheck size={16} />
      </span>
      <span className="t-secondary">{children}</span>
    </li>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="hairline-b flex items-baseline justify-between gap-4 py-2.5 last:border-0">
      <span className="t-label">{label}</span>
      <span className="t-data text-right">{value}</span>
    </div>
  );
}
