import type { Metadata } from "next";
import { requireShop } from "@/lib/auth";
import { billingState, confirmSubscription } from "@/lib/billing";
import { count } from "@/lib/format";
import { PLAN_ORDER, plan as planDef } from "@/lib/plans";
import { PlanPicker } from "./PlanPicker";

export const metadata: Metadata = { title: "Plans and billing" };
export const dynamic = "force-dynamic";

/**
 * Plans and billing. There is no card form here on purpose: App Store distribution
 * requires charges to run through Shopify Billing, so the charge lands on the
 * merchant's existing Shopify invoice and approval happens on Shopify's own screen.
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ charge?: string }>;
}) {
  const { shop } = await requireShop();
  const params = await searchParams;

  // Returning from Shopify's approval screen. The plan is only written after
  // Shopify's own view of the installation says the charge is active — the query
  // string is attacker-supplied and proves nothing.
  let confirmNote: string | null = null;
  if (params.charge === "confirm" && !shop.isDemo) {
    try {
      const result = await confirmSubscription(shop);
      confirmNote = result.plan
        ? `Approved — you are on ${planDef(result.plan).name}.`
        : "Shopify has not marked that charge active yet. Refresh in a moment.";
    } catch {
      confirmNote = "Shopify Billing could not be reached to confirm that charge.";
    }
  }

  const billing = billingState(shop);

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <h1 className="t-h2">Plans and billing</h1>
        <p className="t-data mt-2" style={{ color: "var(--color-fg-2)" }}>
          {billing.planName.toUpperCase()} · {count(billing.cap.used)} OF{" "}
          {count(billing.cap.cap)} SKUS
        </p>
        {billing.trialActive ? (
          <p className="t-data mt-1" style={{ color: "var(--color-kraft)" }}>
            TRIAL · {billing.trialDaysLeft} DAY{billing.trialDaysLeft === 1 ? "" : "S"} LEFT ·
            BACKROOM FEATURES
          </p>
        ) : null}
      </header>

      {confirmNote ? (
        <p className="panel mb-6 p-4 t-secondary" role="status">
          {confirmNote}
        </p>
      ) : null}

      {billing.cap.overCap ? (
        <section className="panel mb-6 p-4">
          <p className="t-title">
            {count(billing.cap.over)} SKUs beyond this plan&rsquo;s cap
          </p>
          <p className="t-secondary mt-2">
            Forecasting covers the {count(billing.cap.cap)} SKUs that sold most recently. Nothing
            has been deleted, and the rest resume the moment the cap moves.
          </p>
        </section>
      ) : null}

      <p className="t-secondary">
        Billing runs through Shopify, so the charge appears on your existing Shopify invoice —
        there is no card to enter here. Every plan includes the 14-day trial, and the trial gives
        you Backroom so you can send a real PO before deciding.
      </p>

      <div className="mt-6 flex flex-col gap-5">
        {PLAN_ORDER.map((id) => {
          const def = planDef(id);
          const current = shop.plan === id;
          return (
            <section key={id} className="panel p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="t-title">{def.name}</h2>
                <span className="t-data" style={{ fontSize: 15 }}>
                  ${def.priceCents / 100}/MO
                </span>
              </div>
              <p className="t-secondary mt-2">{def.blurb}</p>
              <ul className="mt-3">
                {def.features.map((feature) => (
                  <li key={feature} className="hairline-t py-2">
                    <span className="t-data" style={{ color: "var(--color-fg-2)" }}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="t-data mt-3" style={{ color: "var(--color-fg-3)" }}>
                UP TO {count(def.skuCap)} SKUS · {def.locations} LOCATION
                {def.locations === 1 ? "" : "S"}
              </p>
              <PlanPicker
                plan={id}
                planName={def.name}
                priceLabel={`$${def.priceCents / 100}/mo`}
                current={current}
                disabledReason={billing.unavailableReason}
              />
            </section>
          );
        })}
      </div>
    </main>
  );
}
