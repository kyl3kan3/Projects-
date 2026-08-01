import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { clinicianCount } from "@/lib/practices";
import { PLANS, perClinicianCents, planDefinition, priceLabel, sendGate } from "@/lib/plans";
import { stripeConfigured } from "@/lib/env";
import { BillingActions } from "./BillingActions";
import { IconCheck } from "@/components/icons";

export const metadata: Metadata = { title: "Billing" };

/**
 * Billing. Priced per practice, not per clinician — the wedge against per-seat EHR
 * pricing — so the anchor is spelled out per plan rather than implied.
 *
 * With no Stripe key the screen degrades to a read-only plan list and says why,
 * instead of offering a checkout button that would throw.
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const params = await searchParams;
  const { practice } = await requireUser();
  const clinicians = await clinicianCount(practice.id);
  const current = planDefinition(practice.plan);
  const gate = sendGate({
    plan: practice.plan,
    clinicians,
    trialEndsAt: practice.trialEndsAt,
    subscriptionStatus: practice.subscriptionStatus,
  });

  return (
    <main className="screen pt-6">
      <Link href="/settings" className="btn-quiet mb-4 inline-block">
        Back to settings
      </Link>
      <h1 className="t-h2 mb-1">Billing</h1>
      <p className="t-secondary mb-6">
        One price per practice. {current.name} today
        {gate.trialDaysLeft !== null && gate.trialDaysLeft > 0
          ? `, with ${gate.trialDaysLeft} days left in the trial`
          : ""}
        .
      </p>

      {params.checkout === "complete" && (
        <p className="panel mb-6 p-4 t-secondary" style={{ color: "var(--color-moss)" }} role="status">
          Checkout finished. Stripe confirms the subscription by webhook, so the plan below updates
          within a few seconds.
        </p>
      )}
      {params.checkout === "cancelled" && (
        <p className="panel mb-6 p-4 t-secondary" role="status">
          Checkout cancelled. Nothing changed.
        </p>
      )}

      {!stripeConfigured() && (
        <div className="panel mb-6 p-4">
          <p className="t-title mb-1">Billing is not configured on this deployment</p>
          <p className="t-secondary">
            No Stripe key is present, so the plans below are a reference rather than a purchase.
            Reading, sending and exporting all work regardless.
          </p>
        </div>
      )}

      <ul className="list-none p-0">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === practice.plan;
          return (
            <li key={plan.id} className="panel mb-4 p-4">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <div>
                  <p className="t-title">{plan.name}</p>
                  <p className="t-secondary">{plan.blurb}</p>
                </div>
                <p className="t-data" style={{ fontSize: 15 }}>
                  {priceLabel(plan.id)}
                </p>
              </div>
              <p className="t-data mb-3" style={{ color: "var(--color-ink-3)" }}>
                ${(perClinicianCents(plan.id, plan.clinicianCap) / 100).toFixed(2)} PER CLINICIAN AT
                THE CAP
              </p>
              <ul className="mb-4 list-none p-0">
                {plan.includes.map((line) => (
                  <li key={line} className="t-secondary flex items-start gap-2 py-0.5">
                    <span style={{ color: "var(--color-teal)" }}>
                      <IconCheck size={16} />
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <p className="t-data" style={{ color: "var(--color-moss)" }}>
                  CURRENT PLAN
                </p>
              ) : (
                <BillingActions plan={plan.id} disabled={!stripeConfigured()} />
              )}
            </li>
          );
        })}
      </ul>

      <p className="t-secondary mt-6">
        Going over your clinician cap or letting a subscription lapse blocks new sends only. Reading
        packets, exporting PDFs and pulling the audit log keep working — a billing state must never
        put a practice between itself and its own records.
      </p>

      {practice.stripeCustomerId && stripeConfigured() && (
        <div className="mt-6">
          <BillingActions portal />
        </div>
      )}
    </main>
  );
}
