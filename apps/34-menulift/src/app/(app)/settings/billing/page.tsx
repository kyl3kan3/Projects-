import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { billingView } from "@/lib/billing";
import { TRIAL_DAYS, trialDaysLeft } from "@/lib/plans";
import { money, shortDate } from "@/lib/format";
import { PlanPicker, PortalButton } from "./BillingUi";

export const metadata: Metadata = { title: "Billing" };

const STATUS_COPY: Record<string, string> = {
  trialing: "Trial",
  active: "Active",
  past_due: "Payment failed",
  canceled: "Canceled",
  none: "No subscription",
};

export default async function BillingPage() {
  const { organization, location } = await requireUser();
  const view = await billingView(organization.id);
  const daysLeft = trialDaysLeft(view.trialEndsAt, new Date());

  return (
    <main className="screen" style={{ paddingTop: 24 }}>
      <h1 className="t-h2" style={{ marginTop: 0, marginBottom: 8 }}>
        Billing
      </h1>
      <p className="t-data" style={{ marginTop: 0, color: "var(--fg-3)" }}>
        {STATUS_COPY[view.status] ?? view.status}
        {view.status === "trialing" && view.trialEndsAt
          ? ` · ${daysLeft} of ${TRIAL_DAYS} days left, ends ${shortDate(view.trialEndsAt, location.timezone)}`
          : ""}
        {" · "}
        {money(view.monthlyTotalCents)}/mo for {view.locationCount}{" "}
        {view.locationCount === 1 ? "location" : "locations"}
      </p>

      {!view.configured ? (
        <p className="t-body" style={{ color: "#b8863b" }}>
          Billing is not configured on this deployment — `STRIPE_SECRET_KEY` is unset, so checkout
          cannot open. Everything else works; the trial simply never converts.
        </p>
      ) : null}

      <section style={{ marginTop: 24 }}>
        <PlanPicker
          currentPlan={view.plan}
          locationCount={view.locationCount}
          configured={view.configured}
        />
      </section>

      {view.hasSubscription ? (
        <section className="hairline-t" style={{ marginTop: 32, paddingTop: 24 }}>
          <h2 className="t-label" style={{ marginTop: 0, marginBottom: 12 }}>
            Card and invoices
          </h2>
          <PortalButton />
        </section>
      ) : null}

      <section className="hairline-t" style={{ marginTop: 32, paddingTop: 24 }}>
        <h2 className="t-label" style={{ marginTop: 0, marginBottom: 8 }}>
          What happens if a payment fails
        </h2>
        <p className="t-secondary" style={{ margin: 0 }}>
          Nothing comes off your menus. A declined card puts the account in a grace state and nags you
          here — taking a restaurant&apos;s menu off the wall in the middle of service over a expired
          card would be indefensible.
        </p>
      </section>
    </main>
  );
}
