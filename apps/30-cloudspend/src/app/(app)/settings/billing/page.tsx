import type { Metadata } from "next";
import Link from "next/link";
import { requireOrg } from "@/lib/auth";
import { PLAN_ORDER, PLANS } from "@/lib/plans";
import { billingConfigured, priceIdFor, trialDaysLeft } from "@/lib/billing";
import { listAccounts } from "@/lib/accounts";
import { IconArrowLeft, IconCheck } from "@/components/icons";
import { ChoosePlanButton, PortalButton } from "./BillingForms";

export const metadata: Metadata = { title: "Plan and billing" };
export const dynamic = "force-dynamic";

const FEATURES: Array<{ label: string; read: (plan: (typeof PLANS)["solo"]) => string }> = [
  { label: "AWS accounts", read: (p) => String(p.accounts) },
  { label: "Anomaly alerts + daily digest", read: () => "yes" },
  { label: "Hourly granularity", read: (p) => (p.hourlyGranularity ? "yes" : "daily") },
  { label: "Deploy correlation", read: (p) => (p.deployCorrelation ? "yes" : "no") },
  { label: "Budgets with burn-rate alerts", read: (p) => (p.budgets ? "yes" : "no") },
  { label: "Waste report", read: () => "yes" },
  { label: "GCP, API, SSO, custom rules", read: (p) => (p.sso ? "yes" : "no") },
];

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { org } = await requireOrg();
  const params = await searchParams;
  const accounts = await listAccounts(org.id);
  const configured = billingConfigured();
  const trial = trialDaysLeft(org);

  return (
    <main>
      <header
        className="gutter"
        style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 12, paddingBottom: 8 }}
      >
        <Link
          href="/settings"
          aria-label="Back to settings"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            marginLeft: -10,
            color: "var(--color-text-2)",
          }}
        >
          <IconArrowLeft size={22} />
        </Link>
        <span className="t-data" style={{ color: "var(--color-text-2)" }}>
          {org.name}
        </span>
      </header>

      <section className="gutter">
        <h1 className="t-h2">Plan and billing</h1>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          Flat monthly price. We never take a percentage of your cloud bill — the
          more you save, the more the price makes sense.
        </p>
        <p className="t-data" style={{ color: "var(--color-text-2)", marginTop: 12 }}>
          {PLANS[org.plan].name.toUpperCase()} · {org.billingStatus.toUpperCase()}
          {trial !== null ? ` · ${trial}D LEFT` : ""} · {accounts.length}/
          {PLANS[org.plan].accounts} ACCOUNTS
        </p>
      </section>

      {params.checkout === "done" ? (
        <section className="gutter" style={{ paddingTop: 16 }}>
          <p
            className="t-secondary"
            role="status"
            style={{ color: "var(--color-green)", display: "flex", gap: 8 }}
          >
            <IconCheck size={18} />
            <span>
              Stripe has your card. The plan changes the moment Stripe confirms the
              subscription — refresh in a few seconds if it still says trialing.
            </span>
          </p>
        </section>
      ) : null}
      {params.checkout === "cancelled" ? (
        <section className="gutter" style={{ paddingTop: 16 }}>
          <p className="t-secondary" role="status">
            Checkout cancelled. Nothing changed.
          </p>
        </section>
      ) : null}

      {!configured ? (
        <section className="gutter" style={{ paddingTop: 24 }}>
          <div className="card" style={{ padding: 16 }}>
            <p className="t-title" style={{ margin: 0 }}>
              Billing is not configured on this deployment
            </p>
            <p className="t-secondary" style={{ marginTop: 8 }}>
              Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and the three price ids to
              take payments. The plan ladder below is still enforced — it is read from
              the org record, not from Stripe.
            </p>
          </div>
        </section>
      ) : null}

      <section className="gutter" style={{ paddingTop: 32, display: "grid", gap: 24 }}>
        {PLAN_ORDER.map((id) => {
          const p = PLANS[id];
          const current = org.plan === id;
          const priceMissing = configured && !priceIdFor(id);
          return (
            <div key={id} className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                <h2 className="t-title" style={{ margin: 0 }}>
                  {p.name}
                </h2>
                <p className="t-data-lg" style={{ margin: 0, color: "var(--color-paper)" }}>
                  ${p.priceMonthly}
                  <span className="t-data" style={{ color: "var(--color-text-3)" }}>
                    /MO
                  </span>
                </p>
              </div>
              <p className="t-secondary" style={{ marginTop: 8 }}>
                {p.blurb}
              </p>
              <div style={{ marginTop: 12 }}>
                {FEATURES.map((feature) => (
                  <div
                    key={feature.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "6px 0",
                      borderBottom: "1px solid var(--color-hairline)",
                    }}
                  >
                    <span className="t-secondary">{feature.label}</span>
                    <span className="t-data" style={{ color: "var(--color-text)" }}>
                      {feature.read(p).toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16 }}>
                <ChoosePlanButton
                  plan={id}
                  label={`Choose ${p.name}`}
                  current={current}
                  disabled={!configured || priceMissing}
                />
                {priceMissing ? (
                  <p className="t-secondary" style={{ marginTop: 8, color: "var(--color-amber)" }}>
                    No Stripe price id is configured for {p.name}.
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </section>

      {org.stripeCustomerId ? (
        <section className="gutter" style={{ paddingTop: 24, paddingBottom: 56 }}>
          <PortalButton />
        </section>
      ) : (
        <div style={{ paddingBottom: 56 }} />
      )}
    </main>
  );
}
