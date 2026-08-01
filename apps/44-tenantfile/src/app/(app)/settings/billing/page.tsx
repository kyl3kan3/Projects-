import type { Metadata } from "next";
import Link from "next/link";
import { requireLandlord } from "@/lib/auth";
import { countUnits } from "@/lib/ledger";
import { getSubscription } from "@/lib/stripe";
import { PLANS, PLAN_ORDER, overflowUnits, plan, planForUnits } from "@/lib/plans";
import { has } from "@/lib/env";
import { IconCheck } from "@/components/icons";
import { BillingButtons } from "./BillingButtons";

export const metadata: Metadata = { title: "Plan and billing" };
export const dynamic = "force-dynamic";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ upgraded?: string }> }) {
  const { landlord } = await requireLandlord();
  const { upgraded } = await searchParams;
  const [used, subscription] = await Promise.all([countUnits(landlord.id), getSubscription(landlord.id)]);
  const current = plan(landlord.plan);
  const configured = has("STRIPE_SECRET_KEY");
  const needed = planForUnits(used);
  const overflow = overflowUnits(landlord.plan, Array.from({ length: used }, (_, i) => i));

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <Link href="/settings" className="btn-quiet no-underline">
          Settings
        </Link>
        <h1 className="t-h2 mt-4">Plan and billing</h1>
        <p className="t-secondary mt-1">
          On {current.name} · {used} of {current.units} units
        </p>
      </header>

      {upgraded ? (
        <p className="notice mb-6" data-tone="good" role="status">
          <span className="t-secondary">Payment received. Your new limits are live.</span>
        </p>
      ) : null}

      {overflow.length > 0 ? (
        <div className="notice mb-6" data-tone="warn">
          <p className="t-title">You have more units than this plan covers.</p>
          <p className="t-secondary mt-2">
            Nothing has been deleted and nothing will be — the {overflow.length} newest unit
            {overflow.length === 1 ? "" : "s"} and their ledgers are all still here. {PLANS[needed].name} covers{" "}
            {PLANS[needed].units}.
          </p>
        </div>
      ) : null}

      {!configured ? (
        <div className="notice mb-6" data-tone="warn">
          <p className="t-title">Billing is not configured on this deployment.</p>
          <p className="t-secondary mt-2">
            STRIPE_SECRET_KEY is unset, so checkout will not open. Everything else in TenantFile works; you are effectively
            on {current.name} with no card.
          </p>
        </div>
      ) : null}

      <section className="mb-8 flex flex-col gap-4">
        {PLAN_ORDER.map((id) => {
          const p = PLANS[id];
          const isCurrent = id === landlord.plan;
          return (
            <article key={id} className="card p-4" style={{ borderColor: isCurrent ? "var(--color-frontdoor)" : undefined }}>
              <div className="flex items-baseline justify-between gap-4">
                <p className="t-title">{p.name}</p>
                <p className="t-data">${p.priceMonthly}/mo</p>
              </div>
              <p className="t-secondary mt-2">{p.blurb}</p>
              <ul className="mt-3 flex list-none flex-col gap-2 p-0">
                <Feature>Up to {p.units} units</Feature>
                <Feature>{p.collaborators === 1 ? "One person" : `${p.collaborators} people`}</Feature>
                {p.eSign ? <Feature>Lease e-sign included</Feature> : null}
                {p.lateFeeAutomation ? <Feature>Late fees applied automatically</Feature> : null}
                {p.documentVault ? <Feature>Document vault</Feature> : null}
                {p.multiPropertyDashboard ? <Feature>Multi-property dashboard</Feature> : null}
                {p.exportableLedgers ? <Feature>Exportable ledgers for tax season</Feature> : null}
              </ul>
              {isCurrent ? <p className="t-label mt-4">Your plan</p> : <BillingButtons plan={id} label={`Move to ${p.name}`} disabled={!configured} />}
            </article>
          );
        })}
      </section>

      {subscription ? (
        <section className="mb-8">
          <h2 className="t-label mb-3">Subscription</h2>
          <div className="row">
            <span className="t-body flex-1">Status</span>
            <span className="t-data">{subscription.status}</span>
          </div>
          {subscription.currentPeriodEnd ? (
            <div className="row">
              <span className="t-body flex-1">{subscription.cancelAtPeriodEnd ? "Ends" : "Renews"}</span>
              <span className="t-data">{subscription.currentPeriodEnd.toISOString().slice(0, 10)}</span>
            </div>
          ) : null}
          <div className="mt-4">
            <BillingButtons portal label="Manage payment and invoices" disabled={!configured} />
          </div>
        </section>
      ) : null}

      <p className="t-secondary">
        Applicant screening reports are paid directly to the screening company by the applicant. TenantFile takes no cut
        and never handles that money.
      </p>
    </main>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span style={{ color: "var(--color-rent-green)" }} className="mt-1">
        <IconCheck size={16} />
      </span>
      <span className="t-secondary">{children}</span>
    </li>
  );
}
