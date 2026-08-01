import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getSubscription } from "@/lib/billing";
import { formatIso } from "@/lib/dates";
import { activeHouseholdCount } from "@/lib/roster";
import { can, plan, PLAN_ORDER, PLANS, unitUsage } from "@/lib/plans";
import { stripeConfigured } from "@/lib/stripe";
import { env } from "@/lib/env";
import { Notice, Pill } from "@/components/ledger";
import { IconCheck, IconChevronLeft } from "@/components/icons";
import { billingPortalAction, upgradeAction } from "../actions";

export const metadata: Metadata = { title: "DuesDesk plan" };
export const dynamic = "force-dynamic";

const FEATURES: { key: keyof (typeof PLANS)["block"]; label: string }[] = [
  { key: "sms", label: "Text-message announcements" },
  { key: "lateFeeRules", label: "Late-fee rules" },
  { key: "paymentPlans", label: "Payment plans" },
  { key: "documentLibrary", label: "Document library" },
  { key: "boardRoles", label: "Board roles and permissions" },
  { key: "exports", label: "Roster and ledger exports" },
  { key: "multiProperty", label: "Multiple properties" },
  { key: "apiExport", label: "API export" },
];

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string }>;
}) {
  const { user, association } = await requireUser();
  const params = await searchParams;
  const canEdit = can(user.role, "settings");
  const subscription = await getSubscription(association.id);
  const usage = unitUsage(association.plan, await activeHouseholdCount(association.id));
  const configured = stripeConfigured();
  const current = plan(association.plan);
  const perDoor = usage.used > 0 ? current.priceMonthly / usage.used : current.priceMonthly;

  return (
    <main className="screen">
      <header className="pt-8">
        <Link href="/settings" className="btn-quiet inline-flex items-center gap-1">
          <IconChevronLeft size={18} />
          Settings
        </Link>
        <h1 className="t-h2 mt-6">DuesDesk&apos;s own bill.</h1>
        <p className="t-secondary mt-2">
          Priced by units, because that is the honest scale axis. Board seats are unlimited and free
          on every plan.
        </p>
      </header>

      {params.upgraded ? (
        <section className="mt-6">
          <Notice>
            Stripe took the payment. Your plan changes the moment Stripe&apos;s webhook confirms the
            subscription — that webhook is the only thing allowed to change it, so nothing here is
            guessed from a redirect.
          </Notice>
        </section>
      ) : null}

      <section className="mt-8">
        <div className="panel p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="t-label">Current plan</p>
              <p className="t-title mt-1">
                {current.name} · ${current.priceMonthly}/mo
              </p>
              <p className="t-secondary mt-1">
                {usage.used} of {usage.included} units — about ${perDoor.toFixed(2)} per door per
                month
              </p>
            </div>
            {usage.over > 0 ? <Pill tone="warn">Over</Pill> : <Pill tone="good">Within</Pill>}
          </div>

          {subscription ? (
            <div className="hairline-t mt-4 pt-4">
              <Field label="Stripe status">{subscription.status}</Field>
              {subscription.currentPeriodEnd ? (
                <Field label="Renews">
                  {formatIso(subscription.currentPeriodEnd.toISOString().slice(0, 10))}
                </Field>
              ) : null}
              {subscription.cancelAtPeriodEnd ? (
                <Field label="Cancelling">at the end of this period</Field>
              ) : null}
            </div>
          ) : null}

          {usage.over > 0 ? (
            <div className="mt-4">
              <Notice tone="warn">
                You are billing {usage.used} units on a plan that includes {usage.included}. Nothing
                is blocked: every household is still invoiced, every record is intact, and no
                reminder is withheld. Upgrading is a favour to us, not a ransom.
              </Notice>
            </div>
          ) : null}

          {!configured ? (
            <div className="mt-4">
              <Notice>
                This deployment has no <span className="t-data">STRIPE_SECRET_KEY</span>, so
                checkout and the billing portal are unavailable. The plan shown above is whatever the
                database holds.
              </Notice>
            </div>
          ) : null}

          {canEdit && configured && subscription ? (
            <form action={billingPortalAction} className="mt-4">
              <button className="btn btn-secondary" type="submit">
                Manage in Stripe
              </button>
            </form>
          ) : null}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="t-h2">Plans</h2>
        <div className="mt-4 flex flex-col gap-4 md:grid md:grid-cols-3">
          {PLAN_ORDER.map((id) => {
            const p = PLANS[id];
            const isCurrent = id === association.plan;
            return (
              <article key={id} className="panel p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="t-label">{p.name}</p>
                  {isCurrent ? <Pill tone="good">Current</Pill> : null}
                </div>
                <p className="t-stat mt-2" style={{ fontSize: 32 }}>
                  ${p.priceMonthly}
                </p>
                <p className="t-secondary">per month · up to {p.units} units</p>

                <div className="hairline-t mt-4 pt-3">
                  {FEATURES.map((feature) => (
                    <div key={feature.key} className="flex items-center gap-2 py-1">
                      {p[feature.key] ? (
                        <IconCheck size={16} className="green" />
                      ) : (
                        <span className="dot dot-none" />
                      )}
                      <span
                        className="t-secondary"
                        style={{ color: p[feature.key] ? "var(--color-ink)" : undefined }}
                      >
                        {feature.label}
                      </span>
                    </div>
                  ))}
                </div>

                {canEdit && configured && !isCurrent ? (
                  <form action={upgradeAction} className="mt-4">
                    <input type="hidden" name="plan" value={id} />
                    <button className="btn btn-primary btn-full" type="submit">
                      Move to {p.name}
                    </button>
                  </form>
                ) : null}
                {!env.stripePrices[id] && configured ? (
                  <p className="t-secondary mt-3">
                    No Stripe price is configured for this plan on this deployment.
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="t-h2">What you are comparing against</h2>
        <div className="panel mt-4 p-5">
          <p className="t-body">
            Professional management runs $10-25 per door per month. For {usage.used || 60} units that
            is ${(10 * (usage.used || 60)).toLocaleString("en-US")} to $
            {(25 * (usage.used || 60)).toLocaleString("en-US")} a month.
          </p>
          <p className="t-secondary mt-2">
            The other comparison is the one most boards actually make: a volunteer&apos;s evenings.
            DuesDesk is priced to sit under most boards&apos; no-vote discretionary threshold, so a
            treasurer can start without waiting for a meeting.
          </p>
        </div>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="t-secondary">{label}</span>
      <span className="t-data">{children}</span>
    </div>
  );
}
