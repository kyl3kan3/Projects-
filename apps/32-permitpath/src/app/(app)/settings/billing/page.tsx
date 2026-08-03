import type { Metadata } from "next";
import Link from "next/link";
import { IconArrowLeft } from "@/components/icons";
import { PlanPicker } from "./PlanPicker";
import { requireUser } from "@/lib/auth";
import { entitlement, trialDaysLeft } from "@/lib/billing";
import { billingConfigured } from "@/lib/env";
import { longDate } from "@/lib/format";
import { applicableCredit } from "@/lib/plans";

export const metadata: Metadata = { title: "Plan and billing" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; blocked?: string }>;
}) {
  const { checkout, blocked } = await searchParams;
  const { org } = await requireUser();
  const state = entitlement(org);
  const daysLeft = trialDaysLeft(org);
  const credit = applicableCredit(org.contributionCreditCents, org.plan, org.planInterval);

  return (
    <main className="screen pt-6">
      <Link href="/settings" className="btn-quiet btn-quiet-sm">
        <IconArrowLeft size={18} />
        Settings
      </Link>

      <h1 className="t-h2 mt-4">Plan and billing</h1>
      <p className="t-secondary mt-2">
        One stopped job costs more than a year of this. Flat monthly tiers, metered on the things
        that scale with company size: users, active jobs, jurisdictions watched.
      </p>

      {blocked === "jobs" && (
        <div className="banner mt-5">
          <span className="min-w-0 flex-1">
            <span className="t-title block">Active-job limit reached</span>
            <span className="t-secondary block">
              Close a finished job to free a slot, or move up a tier.
            </span>
          </span>
        </div>
      )}

      {checkout === "complete" && (
        <p className="t-secondary mt-4" style={{ color: "var(--color-brick)" }}>
          Checkout complete. Stripe confirms subscriptions by webhook, so the plan on this page
          updates as soon as that arrives.
        </p>
      )}
      {checkout === "cancelled" && (
        <p className="t-secondary mt-4">Checkout cancelled — nothing was charged.</p>
      )}

      {state === "trialing" && daysLeft !== null && (
        <p className="t-data mt-4" style={{ color: "var(--color-fg-3)" }}>
          Trial ends {org.trialEndsAt ? longDate(org.trialEndsAt) : ""} — {daysLeft}{" "}
          {daysLeft === 1 ? "day" : "days"} left
        </p>
      )}
      {org.currentPeriodEnd && state === "active" && (
        <p className="t-data mt-4" style={{ color: "var(--color-fg-3)" }}>
          Renews {longDate(org.currentPeriodEnd)}
        </p>
      )}

      {!billingConfigured() && (
        <div className="card mt-5">
          <p className="t-label">Billing not configured</p>
          <p className="t-body mt-2">
            This deployment has no Stripe key, so checkout is unavailable. Plan limits still apply and
            the tiers below are the real prices — set <span className="t-mono">STRIPE_SECRET_KEY</span>{" "}
            and the price ids from <span className="t-mono">.env.example</span> to enable it.
          </p>
        </div>
      )}

      <PlanPicker
        currentPlan={org.plan}
        currentInterval={org.planInterval}
        hasSubscription={Boolean(org.stripeSubscriptionId)}
        billingConfigured={billingConfigured()}
        creditApplicableCents={credit.appliedCents}
        creditCarriedCents={credit.carriedCents}
      />

      <p className="t-secondary mt-8">
        No free tier: keeping municipal records true costs real money, and a free tier funds one-off
        homeowner lookups instead of coverage. The 14-day trial is scoped to your own jurisdictions.
      </p>
    </main>
  );
}
