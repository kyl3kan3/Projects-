import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getSubscription } from "@/lib/billing";
import { PLANS, plan } from "@/lib/plans";
import { formatShortDate } from "@/lib/dates";
import { has } from "@/lib/env";
import { IconCheck, IconChevronLeft } from "@/components/icons";
import { PlanButtons } from "../SettingsForms";
import { openPortalAction, startCheckoutAction } from "../actions";

export const metadata: Metadata = { title: "Billing" };

const LADDER = [
  {
    id: "free" as const,
    lines: ["3 new documents a month", "E-signature with full audit trail", "Tax CSV export"],
  },
  {
    id: "solo" as const,
    lines: [
      "Unlimited documents",
      "Deposit invoice raised on signature",
      "Automatic 3-step reminders",
      "Your logo, colours, and sender domain",
    ],
  },
  {
    id: "studio" as const,
    lines: ["Everything in Solo", "3 brands", "3 seats (rolling out)", "API access (rolling out)"],
  },
];

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string }>;
}) {
  const { upgraded } = await searchParams;
  const user = await requireUser();
  const subscription = await getSubscription(user.id);
  const current = plan(user.plan);
  const stripeReady = has("STRIPE_SECRET_KEY");

  return (
    <main className="screen pt-6">
      <Link href="/settings" className="btn-quiet mb-4 inline-flex items-center gap-1">
        <IconChevronLeft size={16} />
        Settings
      </Link>

      <h1 className="t-h2">Billing</h1>
      {upgraded ? (
        <p className="t-secondary mt-2" style={{ color: "var(--color-wax)" }}>
          Thank you — your plan updates as soon as Stripe confirms it, usually within seconds.
        </p>
      ) : null}
      <p className="t-secondary mt-2">
        You are on {current.name}
        {subscription?.currentPeriodEnd
          ? `, renewing ${formatShortDate(subscription.currentPeriodEnd)}`
          : ""}
        {subscription?.cancelAtPeriodEnd ? " — set to cancel at the end of the period" : ""}.
      </p>

      <section className="mt-8 flex flex-col gap-8">
        {LADDER.map(({ id, lines }) => {
          const p = PLANS[id];
          const isCurrent = id === user.plan;
          return (
            <div key={id} className={isCurrent ? "" : "hairline-t pt-6"}>
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="t-h2">{p.name}</h2>
                <span className="t-money">
                  {p.priceMonthly === 0 ? "Free" : `$${p.priceMonthly}/mo`}
                </span>
              </div>
              {p.priceYearly > 0 ? (
                <p className="t-secondary mt-1">or ${p.priceYearly}/year</p>
              ) : null}
              <ul className="mt-3 list-none p-0">
                {lines.map((line) => (
                  <li key={line} className="t-body flex items-start gap-2 py-1">
                    <span style={{ color: "var(--color-wax)" }} aria-hidden="true">
                      <IconCheck size={18} />
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
              {isCurrent ? <p className="t-label mt-3">Your plan</p> : null}
            </div>
          );
        })}
      </section>

      <section className="mt-10">
        {stripeReady ? (
          <PlanButtons
            currentPlan={user.plan}
            checkout={startCheckoutAction}
            portal={openPortalAction}
          />
        ) : (
          <p className="t-secondary">
            Payments are not configured on this deployment. Set STRIPE_SECRET_KEY,
            STRIPE_WEBHOOK_SECRET, and the two price IDs to switch upgrades on — see the README.
          </p>
        )}
      </section>

      <p className="t-secondary mt-8 max-w-[46ch]">
        Against Bonsai at $25/mo and HoneyBook at $36/mo, Solo is $12 — and it does the one job those
        suites bury: proposal to contract to deposit, without retyping anything.
      </p>
    </main>
  );
}
