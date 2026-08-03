import type { Metadata } from "next";
import { hasRole, requireUser } from "@/lib/auth";
import { Icon } from "@/components/icons";
import { Banner, ScreenHeader } from "@/components/ui";
import { stripeConfigured } from "@/lib/env";
import { money } from "@/lib/format";
import { PLANS, PLAN_SPECS, monthlyCents, trialDaysLeft } from "@/lib/plans";
import { recoveredSummary } from "@/server/ledger";
import { CheckoutButton, PortalButton } from "./BillingActions";
import { openPortalAction, startCheckoutAction } from "./actions";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireUser();
  const params = await searchParams;
  const checkout = Array.isArray(params.checkout) ? params.checkout[0] : params.checkout;
  const isOwner = hasRole(ctx.user, "owner");
  const configured = stripeConfigured();
  const recovered = await recoveredSummary({ locationId: ctx.location.id });
  const locationCount = ctx.locations.length;

  return (
    <main className="screen">
      <ScreenHeader label="Per location, per month" title="Billing" />

      {checkout === "done" && (
        <Banner tone="aqua">
          Checkout complete. Stripe confirms the subscription by webhook — this page updates as soon as
          it lands.
        </Banner>
      )}
      {checkout === "cancelled" && <Banner tone="amber">Checkout cancelled. Nothing was charged.</Banner>}

      {!configured && (
        <Banner tone="amber">
          Stripe is not configured on this deployment, so checkout is unavailable. The plans and their
          gates are live — SMS steps and location limits behave exactly as they will in production.
        </Banner>
      )}

      <section style={{ paddingTop: 16 }}>
        <p className="t-secondary" style={{ marginTop: 0 }}>
          {ctx.practice.stripeSubscriptionId
            ? `Subscribed on ${PLAN_SPECS[ctx.practice.plan].name}, ${ctx.practice.subscriptionStatus ?? "active"}, ${ctx.practice.billedLocations} ${ctx.practice.billedLocations === 1 ? "location" : "locations"}.`
            : `Trial · ${trialDaysLeft(ctx.practice.trialEndsAt)} days left. No card on file.`}{" "}
          Recovered this month: {money(recovered.monthCents)} against{" "}
          {money(monthlyCents(ctx.practice.plan, locationCount))} of subscription.
        </p>
      </section>

      <section style={{ display: "grid", gap: 16, paddingTop: 8 }}>
        {PLANS.map((plan) => {
          const spec = PLAN_SPECS[plan];
          const current = ctx.practice.plan === plan && Boolean(ctx.practice.stripeSubscriptionId);
          const tooFewLocations = locationCount < spec.minLocations;
          return (
            <div key={plan} className="card" style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                <p className="t-title" style={{ margin: 0, fontWeight: 700 }}>
                  {spec.name}
                </p>
                <p className="t-mono" style={{ margin: 0, fontSize: "1.0625rem" }}>
                  {money(spec.priceCents)}
                  <span className="t-secondary"> /location</span>
                </p>
              </div>
              <p className="t-secondary" style={{ marginTop: 6 }}>
                {spec.tagline}
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 16px", display: "grid", gap: 6 }}>
                {spec.features.map((feature) => (
                  <li key={feature} className="t-secondary" style={{ display: "flex", gap: 8 }}>
                    <span style={{ color: "var(--color-aqua)", lineHeight: 0, flex: "none", marginTop: 2 }}>
                      <Icon name="check-seat" size={16} />
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>
              <p className="t-secondary" style={{ marginTop: 0, marginBottom: 12 }}>
                {money(monthlyCents(plan, Math.max(locationCount, spec.minLocations)))}/mo for{" "}
                {Math.max(locationCount, spec.minLocations)}{" "}
                {Math.max(locationCount, spec.minLocations) === 1 ? "location" : "locations"}
                {tooFewLocations ? ` · needs ${spec.minLocations}+ locations` : ""}
              </p>
              {current ? (
                <p className="t-label" style={{ margin: 0, color: "var(--color-green)" }}>
                  Current plan
                </p>
              ) : (
                <CheckoutButton
                  action={startCheckoutAction}
                  plan={plan}
                  label={`Choose ${spec.name}`}
                  primary={plan === "recall_engine"}
                  disabled={!configured || !isOwner || tooFewLocations}
                />
              )}
            </div>
          );
        })}
      </section>

      {ctx.practice.stripeCustomerId && isOwner && configured && (
        <section className="hairline-t" style={{ marginTop: 24, paddingTop: 16 }}>
          <PortalButton action={openPortalAction} />
        </section>
      )}

      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 16 }}>
        <p className="t-secondary" style={{ margin: 0 }}>
          If a payment fails, campaign sending pauses. Your roster, overdue list and ledger stay open —
          your patient data is never held hostage over a card.
        </p>
      </section>
    </main>
  );
}
