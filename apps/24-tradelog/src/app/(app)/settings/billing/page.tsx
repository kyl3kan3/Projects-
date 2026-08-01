import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getSubscription } from "@/lib/billing";
import { PLANS, monthlyEquivalent, plan } from "@/lib/plans";
import { has } from "@/lib/env";
import { formatDateKey } from "@/lib/tz";
import { openPortalAction, startCheckoutAction } from "../actions";
import { IconCheck } from "@/components/icons";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

const FEATURES: { label: string; of: (p: (typeof PLANS)[keyof typeof PLANS]) => string }[] = [
  {
    label: "Trades a month",
    of: (p) => (Number.isFinite(p.tradesPerMonth) ? String(p.tradesPerMonth) : "Unlimited"),
  },
  { label: "Brokerage accounts", of: (p) => String(p.accounts) },
  {
    label: "Leak findings",
    of: (p) => (Number.isFinite(p.findingsVisible) ? `Top ${p.findingsVisible}` : "All of them"),
  },
  { label: "Segment analytics", of: (p) => (p.segmentAnalytics ? "Yes" : "—") },
  { label: "Playbook and per-setup expectancy", of: (p) => (p.setups ? "Yes" : "—") },
  { label: "Chart snapshots", of: (p) => (p.chartImages ? "Yes" : "—") },
  { label: "Data export", of: (p) => (p.dataExport ? "Yes" : "—") },
  { label: "Mentor share link", of: (p) => (p.mentorSharing ? "Yes" : "—") },
];

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string }>;
}) {
  const user = await requireUser();
  const { upgraded } = await searchParams;
  const current = plan(user.plan);
  const subscription = await getSubscription(user.id);
  const stripeReady = has("STRIPE_SECRET_KEY");

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <Link href="/settings" className="t-label no-underline">
          Settings
        </Link>
        <h1 className="t-h2 mt-3">Billing</h1>
        <p className="t-secondary mt-1">
          You are on {current.name}
          {subscription?.currentPeriodEnd
            ? ` · renews ${formatDateKey(subscription.currentPeriodEnd.toISOString().slice(0, 10))}`
            : ""}
          {subscription?.cancelAtPeriodEnd ? " · cancels at the end of the period" : ""}
        </p>
        {upgraded ? (
          <p className="t-secondary mt-3" style={{ color: "var(--color-blue)" }} role="status">
            Thanks — your plan updates as soon as Stripe confirms the payment.
          </p>
        ) : null}
      </header>

      <section className="mb-8">
        <h2 className="t-label mb-3">What each tier covers</h2>
        <div className="table-scroll">
          <table className="exec">
            <thead>
              <tr>
                <th scope="col">&nbsp;</th>
                {Object.values(PLANS).map((p) => (
                  <th key={p.id} scope="col">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Monthly</td>
                {Object.values(PLANS).map((p) => (
                  <td key={p.id}>{p.priceMonthly === 0 ? "$0" : `$${p.priceMonthly}`}</td>
                ))}
              </tr>
              <tr>
                <td>Yearly</td>
                {Object.values(PLANS).map((p) => (
                  <td key={p.id}>
                    {p.priceYearly === 0 ? "—" : `$${p.priceYearly}`}
                    {p.priceYearly > 0 ? ` ($${monthlyEquivalent(p.id)}/mo)` : ""}
                  </td>
                ))}
              </tr>
              {FEATURES.map((feature) => (
                <tr key={feature.label}>
                  <td>{feature.label}</td>
                  {Object.values(PLANS).map((p) => (
                    <td key={p.id}>{feature.of(p)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="t-secondary mt-4">
          A downgrade never deletes anything. Your executions, trades, notes and snapshots stay
          exactly as they are; only the features above your tier stop being available.
        </p>
      </section>

      {!stripeReady ? (
        <section className="card p-5">
          <p className="t-finding">Checkout is not configured on this deployment.</p>
          <p className="t-secondary mt-2">
            Set <span className="t-mono">STRIPE_SECRET_KEY</span> and the price ids from{" "}
            <span className="t-mono">.env.example</span> to take payments. Everything else in the app
            works without them.
          </p>
        </section>
      ) : user.plan === "free" ? (
        <section className="flex flex-col gap-6">
          {(["trader", "pro"] as const).map((planId) => (
            <div key={planId} className="card p-5">
              <p className="t-label">{PLANS[planId].name}</p>
              <p className="t-stat mt-2">${PLANS[planId].priceMonthly}</p>
              <p className="t-secondary mt-1">a month, or ${PLANS[planId].priceYearly} a year</p>
              <p className="t-body mt-3">{PLANS[planId].pitch}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <form action={startCheckoutAction}>
                  <input type="hidden" name="plan" value={planId} />
                  <input type="hidden" name="interval" value="month" />
                  <button className="btn btn-primary" type="submit">
                    <IconCheck size={16} />
                    Monthly
                  </button>
                </form>
                <form action={startCheckoutAction}>
                  <input type="hidden" name="plan" value={planId} />
                  <input type="hidden" name="interval" value="year" />
                  <button className="btn btn-secondary" type="submit">
                    Yearly — two months free
                  </button>
                </form>
              </div>
            </div>
          ))}
          <p className="t-secondary">
            Tradezella starts at $49/mo and TraderSync at $29. TradeLog lands at $19 because the
            leak detector is the product, not the dashboard.
          </p>
        </section>
      ) : (
        <section>
          <form action={openPortalAction}>
            <button className="btn btn-primary btn-full" type="submit">
              Manage billing
            </button>
          </form>
          <p className="t-secondary mt-3">
            Card, invoices, plan changes and cancellation all live in Stripe&rsquo;s portal.
          </p>
        </section>
      )}
    </main>
  );
}
