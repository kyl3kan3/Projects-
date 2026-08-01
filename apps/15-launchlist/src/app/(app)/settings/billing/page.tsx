import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getSubscription } from "@/lib/billing";
import { countLists, listsFor } from "@/lib/lists";
import { billableSignupCount } from "@/lib/lists";
import { monthlyEmailUsage } from "@/lib/blasts";
import { PLANS, limitLabel, plan } from "@/lib/plans";
import { has } from "@/lib/env";
import { isoDate } from "@/lib/format";
import { IconCheck, IconChevronLeft } from "@/components/icons";
import { PortalButton, UpgradeButton } from "../BillingButtons";

export const metadata: Metadata = { title: "Plan and billing" };
export const dynamic = "force-dynamic";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string }>;
}) {
  const user = await requireUser();
  const { upgraded } = await searchParams;
  const current = plan(user.plan);
  const configured = has("STRIPE_SECRET_KEY") && (has("STRIPE_PRICE_GROWTH") || has("STRIPE_PRICE_PRO"));

  const [subscription, lists, listCount] = await Promise.all([
    getSubscription(user.id),
    listsFor(user.id),
    countLists(user.id),
  ]);
  const signupTotals = await Promise.all(lists.map((l) => billableSignupCount(l.id)));
  const biggest = Math.max(0, ...signupTotals);
  const emailsThisMonth = await monthlyEmailUsage(lists.map((l) => l.id));

  return (
    <main className="screen">
      <header style={{ paddingTop: 32, paddingBottom: 24 }}>
        <Link href="/lists" className="btn-quiet" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <IconChevronLeft size={18} />
          Lists
        </Link>
        <h1 className="t-h2" style={{ marginTop: 16 }}>
          Plan and billing
        </h1>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          On {current.name} · {listCount} of {limitLabel(current.lists)} lists · biggest list{" "}
          {biggest} of {limitLabel(current.signupsPerList)} signups
          {current.emailBlasts ? ` · ${emailsThisMonth} blast emails this month` : ""}
        </p>
      </header>

      {upgraded ? (
        <p className="panel t-secondary" role="status" style={{ padding: 16, marginBottom: 24, color: "var(--color-mint)" }}>
          Payment received. Your new limits are live.
        </p>
      ) : null}

      {!configured ? (
        <p className="panel t-secondary" role="status" style={{ padding: 16, marginBottom: 24 }}>
          Stripe isn&apos;t configured on this deployment, so the upgrade buttons can&apos;t open a
          checkout. Set <span className="t-data">STRIPE_SECRET_KEY</span>,{" "}
          <span className="t-data">STRIPE_PRICE_GROWTH</span> and{" "}
          <span className="t-data">STRIPE_PRICE_PRO</span>, and point the webhook at{" "}
          <span className="t-data">/api/webhooks/stripe</span>.
        </p>
      ) : null}

      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {Object.values(PLANS).map((p) => {
          const isCurrent = p.id === user.plan;
          return (
            <article
              key={p.id}
              className="panel"
              style={{ padding: 16, borderColor: isCurrent ? "var(--color-flare)" : undefined }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
                <p className="t-title">{p.name}</p>
                <p className="t-data">{p.priceMonthly === 0 ? "free" : `$${p.priceMonthly}/mo`}</p>
              </div>

              <ul style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                <Feature>{limitLabel(p.signupsPerList)} signups per list</Feature>
                <Feature>
                  {limitLabel(p.lists)} list{p.lists === 1 ? "" : "s"}
                </Feature>
                <Feature>{p.canHideBadge ? "Badge optional" : "LaunchList badge on the page"}</Feature>
                <Feature>{p.customDomain ? "Custom domain" : "Hosted address"}</Feature>
                <Feature>
                  {p.emailBlasts
                    ? `Email blasts (${limitLabel(p.monthlyEmailQuota)} a month)`
                    : "No email blasts"}
                </Feature>
                <Feature>{p.webhooks ? "Webhooks, API and Zapier" : "CSV export"}</Feature>
              </ul>

              <div style={{ marginTop: 16 }}>
                {isCurrent ? (
                  <p className="t-label" style={{ color: "var(--color-flare)" }}>
                    Current plan
                  </p>
                ) : p.id === "free" ? (
                  <p className="t-secondary">
                    Downgrade from the Stripe portal. Nothing is deleted — the page stops taking new
                    signups once it is over the free cap and the badge comes back.
                  </p>
                ) : (
                  <UpgradeButton
                    planId={p.id as "growth" | "pro"}
                    label={`Upgrade to ${p.name}`}
                    disabled={!configured}
                  />
                )}
              </div>
            </article>
          );
        })}
      </section>

      {subscription ? (
        <section className="hairline-t" style={{ marginTop: 32, paddingTop: 24 }}>
          <p className="t-label">Subscription</p>
          <p className="t-data" style={{ marginTop: 8, color: "var(--color-text-2)" }}>
            {subscription.status}
            {subscription.currentPeriodEnd
              ? ` · renews ${isoDate(subscription.currentPeriodEnd)}`
              : ""}
            {subscription.cancelAtPeriodEnd ? " · cancels at period end" : ""}
          </p>
          <div style={{ marginTop: 16 }}>
            <PortalButton />
          </div>
        </section>
      ) : null}

      <section className="hairline-t" style={{ marginTop: 32, paddingTop: 24 }}>
        <p className="t-label">What you would otherwise pay</p>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          Prefinery starts at $49/mo. Carrd plus ConvertKit is about $28/mo and has no referral
          engine — you would build position tracking, unique links and fraud filtering yourself.
          Growth is $19/mo with all three working on the first signup.
        </p>
      </section>
    </main>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="t-secondary" style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <span style={{ color: "var(--color-text-3)", display: "inline-flex", marginTop: 1 }}>
        <IconCheck size={16} />
      </span>
      {children}
    </li>
  );
}
