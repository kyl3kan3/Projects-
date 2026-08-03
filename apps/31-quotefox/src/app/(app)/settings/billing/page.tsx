import type { Metadata } from "next";
import { ScreenHeader } from "@/components/ScreenHeader";
import { requireOnboardedUser } from "@/lib/auth";
import { plural } from "@/lib/display";
import {
  formatPlanPrice,
  isTrialing,
  orgAsGatable,
  PLANS,
  PLAN_ORDER,
  quoteCapacity,
  trialDaysLeft,
  TRIAL_QUOTE_LIMIT,
} from "@/lib/plans";
import { BillingControls } from "./BillingControls";

export const metadata: Metadata = { title: "Plan and billing" };
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const { org } = await requireOnboardedUser();
  const gatable = orgAsGatable(org);
  const capacity = quoteCapacity(gatable);
  const trialLeft = trialDaysLeft(gatable);

  return (
    <main>
      <ScreenHeader
        title="Plan and billing"
        meta={
          isTrialing(gatable)
            ? `Trial · ${plural(trialLeft ?? 0, "day")} left · ${capacity.used}/${TRIAL_QUOTE_LIMIT} quotes used`
            : `${PLANS[org.plan].name} · ${capacity.used}/${capacity.limit} quotes this period`
        }
        backHref="/settings"
        backLabel="Settings"
        showSettings={false}
      />

      <section className="gutter" style={{ paddingBottom: 24 }}>
        <p className="t-secondary" style={{ maxWidth: "44ch" }}>
          {isTrialing(gatable)
            ? `Your trial includes ${TRIAL_QUOTE_LIMIT} AI-drafted quotes and every feature, deposits included — enough to win one real job. No card until you pick a plan.`
            : "The metered unit is AI-drafted quotes. Capture and sending are never metered."}
        </p>
        <p className="t-secondary" style={{ marginTop: 12, color: "var(--color-text-3)" }}>
          Anchored against the alternative: one evening a week at the kitchen table, or one job a month
          lost to the contractor who answered first.
        </p>
      </section>

      <section className="gutter">
        <BillingControls
          hasSubscription={Boolean(org.billingStripeCustomerId)}
          connectLabel={
            org.stripeConnectAccountId
              ? org.stripeConnectReady
                ? "Stripe connected — review the account"
                : "Finish Stripe verification"
              : "Connect Stripe to take deposits"
          }
          plans={PLAN_ORDER.map((id) => ({
            id,
            name: PLANS[id].name,
            price: formatPlanPrice(id),
            blurb: PLANS[id].blurb,
            bullets: PLANS[id].bullets,
            current: !isTrialing(gatable) && org.plan === id,
          }))}
        />
      </section>
    </main>
  );
}
