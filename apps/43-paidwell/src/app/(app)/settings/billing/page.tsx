import type { Metadata } from "next";
import { ScreenHeader } from "@/components/ScreenHeader";
import { requireFirm } from "@/lib/auth";
import { openInvoiceCount } from "@/lib/invoices";
import { invoiceCapacity, plan } from "@/lib/plans";
import { stripeConfigured } from "@/lib/stripe";
import { ConnectStripeButton, ManageSubscriptionButton, PlanPicker } from "./BillingForms";

export const metadata: Metadata = { title: "Plan and billing" };
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const { firm } = await requireFirm();
  const features = plan(firm.plan);
  const openCount = await openInvoiceCount(firm.id);
  const capacity = invoiceCapacity(firm.plan, openCount);

  return (
    <main>
      <ScreenHeader firmName={firm.name} meta={`${features.name} plan`} />

      <section className="gutter">
        <h1 className="t-h2">Plan and billing</h1>
        <p className="t-body" style={{ color: "var(--color-text-2)", marginTop: 8 }}>
          {capacity.limit === Number.MAX_SAFE_INTEGER
            ? `${openCount} open invoices, unlimited on ${features.name}.`
            : `${openCount} of ${capacity.limit} open invoices used on ${features.name}.`}{" "}
          No per-invoice fees and no percentage of what you collect — ever.
        </p>
        {!stripeConfigured() ? (
          <p className="t-secondary" style={{ marginTop: 12, color: "var(--color-text-2)" }}>
            Stripe is not configured on this deployment, so checkout and Connect onboarding
            cannot open. Plan gating, limits and the payment-webhook path all work.
          </p>
        ) : null}
      </section>

      <section className="gutter" style={{ marginTop: 32 }}>
        <p className="t-label" style={{ marginBottom: 12 }}>
          Taking client payments
        </p>
        <ConnectStripeButton connected={Boolean(firm.stripeAccountId)} />
      </section>

      <section className="gutter" style={{ marginTop: 40 }}>
        <p className="t-label" style={{ marginBottom: 12 }}>
          Plans
        </p>
        <PlanPicker current={firm.plan} />
      </section>

      {firm.stripeCustomerId ? (
        <section className="gutter" style={{ marginTop: 32, marginBottom: 40 }}>
          <ManageSubscriptionButton />
        </section>
      ) : (
        <div style={{ height: 40 }} />
      )}
    </main>
  );
}
