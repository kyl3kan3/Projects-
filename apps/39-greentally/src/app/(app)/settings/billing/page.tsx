import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/auth";
import { stripeConfigured } from "@/lib/env";
import { annualCents, effectiveMonthlyCents, isPaid, PAID_PLANS, PLANS } from "@/lib/plans";
import { PlanChooser, type PlanCard } from "./BillingForms";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

const money = (cents: number) => `$${(cents / 100).toFixed(0)}`;

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { checkout } = await searchParams;
  const { org } = await requireOnboarded();

  const plans: PlanCard[] = PAID_PLANS.map((id) => ({
    id,
    name: PLANS[id].name,
    monthly: money(PLANS[id].monthlyCents),
    annualMonthly: money(effectiveMonthlyCents(id, "year")),
    annualTotal: money(annualCents(id)),
    blurb: PLANS[id].blurb,
    features: PLANS[id].features,
    current: org.plan === id,
  }));

  return (
    <main className="screen pt-5">
      <h1 className="t-h2">Plans</h1>
      <p className="t-secondary mt-1" style={{ maxWidth: "52ch" }}>
        A first footprint and questionnaire support from a consultant is quoted at
        $10,000–$30,000, every year. This is the same job, done in a week.
      </p>

      {checkout === "done" && (
        <p className="t-secondary mt-4" style={{ color: "var(--color-accent-text)" }}>
          Checkout complete. Your plan updates as soon as Stripe confirms the subscription —
          usually within a few seconds.
        </p>
      )}
      {checkout === "cancelled" && (
        <p className="t-secondary mt-4" style={{ color: "var(--color-fg-2)" }}>
          Checkout cancelled. Nothing was charged.
        </p>
      )}

      <PlanChooser
        plans={plans}
        stripeReady={stripeConfigured()}
        currentIsPaid={isPaid(org.plan)}
      />

      <section className="mt-10">
        <h2 className="t-label">What the free preview includes</h2>
        <p className="t-body mt-2" style={{ maxWidth: "50ch" }}>
          One site, one utility bill, a real partial Scope 2 figure with the factor it came
          from, and the report cover — watermarked, not downloadable. No card, and no
          expiry.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="t-label">Annual billing</h2>
        <p className="t-body mt-2" style={{ maxWidth: "50ch" }}>
          Ten months for twelve. The job recurs annually with the reporting cycle, which is
          the only reason the discount exists.
        </p>
      </section>
    </main>
  );
}
