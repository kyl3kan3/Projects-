import type { Metadata } from "next";
import { requirePractice } from "@/lib/auth";
import { billingFacts, stripeConfigured } from "@/lib/billing";
import { PLANS, entitlement, meter } from "@/lib/plans";
import { currentPeriodUsage, periodCostMicros } from "@/lib/usage";
import { formatCents, formatMicros } from "@/lib/format";
import { PlanButton, PortalButton } from "./BillingActions";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

/**
 * Billing. Three plans, the meter, and the per-note drafting cost this period —
 * the COGS telemetry ROADMAP Phase 1 asks for, shown to the clinician rather than
 * hidden in an ops dashboard, because it is also the honest answer to "what does
 * this actually cost to run?"
 */
export default async function BillingPage() {
  const { practice } = await requirePractice();
  const now = new Date();
  const ent = entitlement(billingFacts(practice), now);
  const [usage, cost] = await Promise.all([
    currentPeriodUsage(practice.id, practice.timezone, now),
    periodCostMicros(practice.id, practice.timezone, now),
  ]);
  const m = meter(usage.notesDrafted, ent.noteLimit);

  return (
    <main className="screen pt-6">
      <h1 className="t-h2 mb-1">Billing</h1>
      <p className="t-secondary mb-6">
        {ent.plan.name} ·{" "}
        {ent.trialing
          ? `trial, ${ent.trialDaysLeft} day${ent.trialDaysLeft === 1 ? "" : "s"} left`
          : ent.state === "active"
            ? "active"
            : ent.state === "past_due"
              ? "payment failed"
              : "no active subscription"}
      </p>

      <section className="panel mb-6 p-4">
        <h2 className="t-label mb-2">This period</h2>
        <p className="t-clock">{usage.notesDrafted}</p>
        <p className="t-secondary">
          {m.label}
          {m.exceeded ? " — capture is paused until you upgrade or the period rolls" : ""}
        </p>
        <p className="t-secondary t-faint mt-2">
          Drafting cost so far this period: {formatMicros(cost.costMicros)} across{" "}
          {cost.notes} note{cost.notes === 1 ? "" : "s"}
          {cost.costMicros === 0
            ? " — this install runs the built-in drafter, which costs nothing to call."
            : "."}
        </p>
      </section>

      {ent.notice && (
        <p className="panel mb-6 p-4" style={{ fontSize: 13, lineHeight: 1.45 }}>
          {ent.notice}
        </p>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        {Object.values(PLANS).map((plan) => (
          <div key={plan.id} className="panel p-4">
            <p className="t-label mb-1">{plan.name}</p>
            <p className="t-h2 mb-1">
              {formatCents(plan.priceCents)}
              <span className="t-secondary"> /mo</span>
            </p>
            <p className="t-secondary mb-3">{plan.blurb}</p>
            <ul className="mb-4">
              {plan.includes.map((line) => (
                <li key={line} className="t-secondary mb-1">
                  {line}
                </li>
              ))}
            </ul>
            {plan.id === practice.plan && !ent.trialing && ent.state === "active" ? (
              <p className="t-secondary" style={{ color: "var(--color-sage-text)" }}>
                Current plan
              </p>
            ) : (
              <PlanButton
                plan={plan.id}
                label={`Choose ${plan.name}`}
              />
            )}
          </div>
        ))}
      </section>

      <section className="mt-6">
        <PortalButton />
        {!stripeConfigured() && (
          <p className="t-secondary mt-3">
            Stripe is not configured on this install, so the plan buttons will explain
            rather than open checkout. Everything else — capture, review, signing,
            export — works regardless.
          </p>
        )}
        <p className="t-secondary mt-3">
          Whatever happens with a subscription, signed notes stay readable and
          exportable. A documentation product that held finished notes hostage would be
          indefensible.
        </p>
      </section>
    </main>
  );
}
