import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getSubscription } from "@/lib/billing";
import { countConnections } from "@/lib/connections";
import { PLAN_ORDER, PLANS, databasesLabel, plan } from "@/lib/plans";
import { has } from "@/lib/env";
import { IconCheck } from "@/components/icons";
import { portalAction, upgradeAction } from "../actions";

export const metadata: Metadata = { title: "Plan and billing" };
export const dynamic = "force-dynamic";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string }>;
}) {
  const { org } = await requireUser();
  const { upgraded } = await searchParams;
  const [subscription, used] = await Promise.all([getSubscription(org.id), countConnections(org.id)]);
  const current = plan(org.plan);
  const configured = has("STRIPE_SECRET_KEY");

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <Link href="/settings" className="btn-quiet no-underline">
          Settings
        </Link>
        <h1 className="t-h2 mt-3">Plan and billing</h1>
        <p className="t-secondary mt-1">
          On {current.name} · {used} of {databasesLabel(current)} databases
        </p>
      </header>

      {upgraded ? (
        <p
          className="panel t-secondary mb-6 p-4"
          style={{ color: "var(--color-seal)" }}
          role="status"
        >
          Payment received. Your new limits are live, and existing schedules have already been moved
          onto them.
        </p>
      ) : null}

      <section className="mb-8 flex flex-col gap-4">
        {PLAN_ORDER.map((id) => {
          const p = PLANS[id];
          const isCurrent = id === org.plan;
          return (
            <article
              key={id}
              className="panel p-4"
              style={{ borderColor: isCurrent ? "var(--color-brass)" : undefined }}
            >
              <div className="flex items-baseline justify-between gap-4">
                <p className="t-title">{p.name}</p>
                <p className="t-data">${p.priceMonthly}/mo</p>
              </div>

              <ul className="mt-3 flex flex-col gap-1.5">
                <Feature>{databasesLabel(p)} databases</Feature>
                <Feature>{p.maxFrequency === "hourly" ? "Hourly or daily" : "Daily"} backups</Feature>
                <Feature>
                  {p.retentionDays === 365 ? "1 year" : `${p.retentionDays} days`} of retention
                </Feature>
                <Feature>
                  {p.maxDrill === "none"
                    ? "Manual restore drills"
                    : `${p.maxDrill === "weekly" ? "Weekly" : "Monthly"} automated restore drills`}
                </Feature>
                <Feature>Bring your own S3 or R2 bucket</Feature>
                <Feature>Envelope encryption, AES-256-GCM per snapshot</Feature>
                {p.complianceReport ? <Feature>Monthly compliance PDF</Feature> : null}
              </ul>

              <div className="mt-4">
                {isCurrent ? (
                  <p className="t-label" style={{ color: "var(--color-brass)" }}>
                    Current plan
                  </p>
                ) : configured ? (
                  <form action={upgradeAction}>
                    <input type="hidden" name="plan" value={id} />
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
        <section className="mb-8">
          <p className="t-label mb-3">Subscription</p>
          <dl className="panel p-4">
            <Row label="Status" value={subscription.status} />
            {subscription.currentPeriodEnd ? (
              <Row
                label={subscription.cancelAtPeriodEnd ? "Ends" : "Renews"}
                value={subscription.currentPeriodEnd.toISOString().slice(0, 10)}
              />
            ) : null}
          </dl>
          <form action={portalAction} className="mt-4">
            <button className="btn btn-secondary btn-full" type="submit">
              Manage payment and invoices
            </button>
          </form>
        </section>
      ) : org.trialEndsAt ? (
        <section className="mb-8">
          <p className="t-label mb-3">Trial</p>
          <p className="t-secondary">
            No card on file. Your trial runs to {org.trialEndsAt.toISOString().slice(0, 10)} and
            backups keep running on Hobby limits until you pick a plan.
          </p>
        </section>
      ) : null}

      <p className="t-secondary pb-8">
        A downgrade never deletes anything. Databases beyond the new limit are disabled with their
        schedules intact, retention and frequency are pulled back inside the plan, and snapshots
        already in your bucket stay exactly where they are.
        {configured ? "" : " Billing is not configured in this environment."}
      </p>
    </main>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span style={{ color: "var(--color-brass)", marginTop: 2 }}>
        <IconCheck size={16} />
      </span>
      <span className="t-secondary">{children}</span>
    </li>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="hairline-b flex items-baseline justify-between gap-4 py-2.5 last:border-0">
      <dt className="t-label">{label}</dt>
      <dd className="t-data text-right">{value}</dd>
    </div>
  );
}
