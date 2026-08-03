import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { creditBalance, ledger } from "@/lib/billing";
import { stripeConfigured, devCreditsAllowed } from "@/lib/env";
import { formatCents, NO_ROLLOVER_NOTE, OVERAGE_CENTS, PLAN_ORDER, PLANS } from "@/lib/plans";
import { BillingActions } from "./BillingActions";
import { IconCheck } from "@/components/icons";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage() {
  const { account } = await requireUser();
  const credits = await creditBalance(account.id);
  const rows = await ledger(account.id, 12);
  const plan = PLANS[account.plan];

  return (
    <main className="screen">
      <header className="pt-8">
        <h1 className="t-h2">Billing</h1>
        <p className="t-data mt-2" style={{ color: credits > 0 ? "var(--color-text-2)" : "var(--color-oxblood)" }}>
          {credits} {credits === 1 ? "REVIEW" : "REVIEWS"} LEFT · {plan.name.toUpperCase()}
        </p>
        {plan.monthlyCredits > 0 && <p className="t-secondary mt-1">{NO_ROLLOVER_NOTE}</p>}
      </header>

      <BillingActions
        currentPlan={account.plan}
        stripeReady={stripeConfigured()}
        devGrantAvailable={devCreditsAllowed()}
        overagePrice={formatCents(OVERAGE_CENTS)}
      />

      <section className="mt-10">
        <p className="t-label">Plans</p>
        {PLAN_ORDER.map((id) => {
          const spec = PLANS[id];
          const current = id === account.plan;
          return (
            <article key={id} className="hairline-b py-5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="t-title">{spec.name}</p>
                <p className="t-data">
                  {spec.monthlyCents > 0
                    ? `${formatCents(spec.monthlyCents)}/mo`
                    : `${formatCents(spec.perContractCents)} each`}
                </p>
              </div>
              <p className="t-secondary mt-1">{spec.blurb}</p>
              <ul className="mt-3" style={{ listStyle: "none", padding: 0 }}>
                {spec.features.map((feature) => (
                  <li key={feature} className="t-secondary flex items-start gap-2 py-0.5">
                    <span style={{ color: "var(--color-sage)", marginTop: 2 }}>
                      <IconCheck size={18} />
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              {current && <p className="t-label mt-3">Your plan</p>}
            </article>
          );
        })}
      </section>

      {rows.length > 0 && (
        <section className="mt-8">
          <p className="t-label">Credit ledger</p>
          <ul className="mt-2" style={{ listStyle: "none", padding: 0 }}>
            {rows.map((row) => (
              <li key={row.id} className="hairline-b flex items-baseline gap-3 py-3">
                <span className="t-data" style={{ color: "var(--color-text-3)", minWidth: 84 }}>
                  {row.createdAt.toISOString().slice(0, 10)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="t-body block">{row.note ?? row.kind.replace(/_/g, " ")}</span>
                  <span className="t-secondary block" style={{ color: "var(--color-text-3)" }}>
                    {row.credits - row.creditsUsed} of {row.credits} left
                    {row.expiresAt ? ` · expires ${row.expiresAt.toISOString().slice(0, 10)}` : " · no expiry"}
                  </span>
                </span>
                <span className="t-data">{formatCents(row.amountCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
