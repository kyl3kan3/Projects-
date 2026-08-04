import type { Metadata } from "next";
import Link from "next/link";
import { PlanButton } from "./PlanButtons";
import { checkoutAction, portalAction } from "./actions";
import { requireSession } from "@/lib/auth";
import { billingConfigured } from "@/lib/billing";
import { entitlements, PAID_PLANS, PLANS } from "@/lib/plans";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; error?: string }>;
}) {
  const { checkout, error } = await searchParams;
  const { account, user } = await requireSession();
  const ent = entitlements(account);
  const configured = billingConfigured();

  return (
    <main style={{ paddingBottom: 40, maxWidth: 560 }}>
      <Link href="/settings" className="btn-quiet">
        Settings
      </Link>
      <h1 className="t-h2" style={{ marginTop: 12 }}>
        Billing
      </h1>
      <p className="t-secondary" style={{ marginTop: 4 }}>
        RigRent&rsquo;s own subscription. Customer deposits ride your Stripe account — their money
        never touches ours.
      </p>

      {checkout === "done" ? (
        <div className="banner" data-tone="accent" style={{ marginTop: 16 }} role="status">
          Checkout finished. The plan updates as soon as Stripe&rsquo;s webhook lands — usually a
          second or two.
        </div>
      ) : null}
      {checkout === "cancelled" ? (
        <div className="banner" style={{ marginTop: 16 }} role="status">
          Checkout was cancelled. Nothing changed.
        </div>
      ) : null}
      {error === "owner" ? (
        <div className="banner" data-tone="warn" style={{ marginTop: 16 }} role="alert">
          Only the owner can manage billing.
        </div>
      ) : null}
      {error === "unconfigured" ? (
        <div className="banner" data-tone="warn" style={{ marginTop: 16 }} role="alert">
          There is no Stripe customer on this account yet, so the portal has nothing to open.
        </div>
      ) : null}

      <div className="panel" style={{ marginTop: 20, padding: 16 }}>
        <p className="t-label">Right now</p>
        <p className="t-title" style={{ marginTop: 4 }}>
          {PLANS[ent.plan].name}
          {ent.trialing
            ? ` · trial, ${ent.trialDaysLeft} day${ent.trialDaysLeft === 1 ? "" : "s"} left`
            : account.subscriptionStatus
              ? ` · ${account.subscriptionStatus.replace(/_/g, " ")}`
              : ""}
        </p>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          {ent.lockReason ?? PLANS[ent.plan].blurb}
        </p>
        {account.currentPeriodEnd ? (
          <p className="t-mono tone-dim" style={{ marginTop: 8 }}>
            paid through {account.currentPeriodEnd.toISOString().slice(0, 10)}
          </p>
        ) : null}
      </div>

      {!configured ? (
        <div className="banner" data-tone="warn" style={{ marginTop: 16 }}>
          <strong>Stripe is not configured in this environment.</strong> Checkout and the customer
          portal need STRIPE_SECRET_KEY plus STRIPE_PRICE_YARD, STRIPE_PRICE_FLEET and
          STRIPE_PRICE_PRO. Plan changes arriving by webhook are applied idempotently whether or not
          anybody is watching this screen.
        </div>
      ) : null}

      <section style={{ marginTop: 32 }}>
        <h2 className="t-label">Plans</h2>
        <div className="stack" style={{ marginTop: 12, gap: 20 }}>
          {PAID_PLANS.map((plan) => {
            const spec = PLANS[plan];
            return (
              <div key={plan} className="panel" style={{ padding: 16 }}>
                <div className="between">
                  <div>
                    <p className="t-title">{spec.name}</p>
                    <p className="t-count" style={{ fontSize: 30, marginTop: 4 }}>
                      ${spec.priceMonthly}
                      <span className="t-secondary"> /mo</span>
                    </p>
                  </div>
                </div>
                <p className="t-secondary" style={{ marginTop: 8 }}>
                  {spec.blurb}
                </p>
                <ul className="stack" style={{ marginTop: 12, gap: 4, listStyle: "none" }}>
                  <Feature on>
                    {Number.isFinite(spec.users) ? `${spec.users} users` : "Unlimited users"}
                  </Feature>
                  <Feature on>Quantity-tracked availability, quotes, contracts, deposit holds</Feature>
                  <Feature on={spec.runs}>Delivery and pickup runs with load lists</Feature>
                  <Feature on={spec.damageClaims}>Damage claims against the deposit</Feature>
                  <Feature on={spec.serials}>Per-unit serials</Feature>
                  <Feature on={spec.maintenanceHolds}>Maintenance holds</Feature>
                </ul>
                <div style={{ marginTop: 16 }}>
                  <PlanButton
                    plan={plan}
                    label={`Move to ${spec.name}`}
                    action={checkoutAction}
                    current={ent.plan === plan}
                    disabled={!configured || user.role !== "owner"}
                    disabledReason={
                      user.role !== "owner"
                        ? "Only the owner can change the plan."
                        : "Stripe is not configured in this environment."
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {account.stripeCustomerId ? (
        <section style={{ marginTop: 32 }}>
          <h2 className="t-label">Card and invoices</h2>
          <form action={portalAction} style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn-secondary btn-full">
              Open the Stripe portal
            </button>
          </form>
        </section>
      ) : null}

      <p className="t-secondary" style={{ marginTop: 32 }}>
        Exports always work, on any plan and in any billing state. Losing access to your own order
        history because a card expired would be worse than any billing problem.
      </p>
    </main>
  );
}

function Feature({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <li className="t-secondary" style={{ color: on ? "var(--color-ink)" : "var(--color-dim)" }}>
      {on ? "included" : "not on this tier"} — {children}
    </li>
  );
}
