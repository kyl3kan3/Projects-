import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { annualPriceCents, documentCapacity, formatPlanPrice, PLANS, PLAN_ORDER, plan } from "@/lib/plans";
import { currentPeriod, usageFor } from "@/lib/org";
import { formatCents } from "@/lib/money";
import { stripeConfigured } from "@/lib/stripe";
import { BillingPortalButton, PlanPicker } from "./BillingForms";
import { IconArrowLeft } from "@/components/icons";

export const metadata: Metadata = { title: "Plans and billing" };
export const dynamic = "force-dynamic";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { org } = await requireUser();
  const params = await searchParams;
  const usage = await usageFor(org.id, currentPeriod(org));
  const capacity = documentCapacity(org.plan, usage.documentsExtracted);
  const configured = stripeConfigured();
  const trialing = org.trialEndsAt !== null && org.trialEndsAt.getTime() > Date.now();

  return (
    <main className="screen">
      <header className="pt-8">
        <Link href="/settings" className="btn-quiet inline-flex items-center gap-1.5" style={{ color: "var(--color-fg-2)" }}>
          <IconArrowLeft size={18} />
          Settings
        </Link>
        <h1 className="t-h2 mt-4">Plans and billing</h1>
        <p className="t-secondary mt-2">
          A year of LedgerLens costs less than one January cleanup fee. Annual billing is
          two months free — {formatCents(annualPriceCents("operator"))} for the Operator
          plan instead of {formatCents(PLANS.operator.priceCents * 12)}.
        </p>
      </header>

      {params.checkout === "done" ? (
        <p
          className="t-secondary mt-5 rounded-[12px] border p-3"
          style={{ color: "var(--color-ledger)", borderColor: "var(--color-ledger)" }}
          role="status"
        >
          Checkout complete. Your plan updates as soon as Stripe confirms the subscription —
          usually within a few seconds.
        </p>
      ) : null}
      {params.checkout === "cancelled" ? (
        <p className="t-secondary mt-5" style={{ color: "var(--color-fg-2)" }}>
          Checkout cancelled. Nothing changed.
        </p>
      ) : null}

      <section className="panel mt-6 p-4">
        <span className="t-label">Current</span>
        <p className="t-h2 mt-1">{plan(org.plan).name}</p>
        <p className="t-secondary mt-1">
          {formatPlanPrice(org.plan)} · {capacity.extracted} of {capacity.cap} documents used
          this month
          {trialing ? ` · trial ends ${org.trialEndsAt?.toISOString().slice(0, 10)}` : ""}
        </p>
        <p className="t-secondary mt-3" style={{ color: "var(--color-fg-3)" }}>
          Documents past the cap queue until the next cycle. There is no overage charge and
          nothing is deleted.
        </p>
      </section>

      {!configured ? (
        <p
          className="t-secondary mt-6 rounded-[12px] border p-3"
          style={{ color: "var(--color-flag)", borderColor: "var(--color-flag)" }}
        >
          Stripe is not configured on this deployment, so checkout is unavailable. Set
          STRIPE_SECRET_KEY and the three price ids to take payment.
        </p>
      ) : null}

      <PlanPicker
        plans={PLAN_ORDER.map((id) => ({
          id,
          name: PLANS[id].name,
          price: formatPlanPrice(id),
          cap: PLANS[id].documentCap,
          blurb: PLANS[id].blurb,
        }))}
        currentPlan={org.plan}
        configured={configured}
      />

      <section className="mt-8">
        <span className="t-label">Billing</span>
        <BillingPortalButton configured={configured && Boolean(org.stripeCustomerId)} />
        {!org.stripeCustomerId ? (
          <p className="t-secondary mt-2" style={{ color: "var(--color-fg-3)" }}>
            The portal opens once you have a subscription.
          </p>
        ) : null}
      </section>
    </main>
  );
}
