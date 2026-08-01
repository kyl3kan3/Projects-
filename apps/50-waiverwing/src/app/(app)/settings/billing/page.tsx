import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { PLAN_ORDER, PLANS, plan, softCapState, trialActive } from "@/lib/plans";
import { monthlyVolume } from "@/lib/signatures";
import { stripeConfigured } from "@/lib/env";
import { BillingActions } from "./BillingActions";
import { IconCheck } from "@/components/icons";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const { account } = await requireUser();
  const volume = await monthlyVolume(account.id);
  const current = plan(account.plan);
  const state = softCapState(account.plan, volume);
  const onTrial = trialActive(account);
  const configured = stripeConfigured();

  return (
    <div className="px-5 lg:px-0">
      <h1 className="t-h2 pt-6">Billing</h1>
      <p className="t-secondary mt-2">
        Priced per location by signed-waiver volume. Caps are soft: going over shows this banner
        and never blocks a signature. A blocked waiver at a busy counter is not a thing we do.
      </p>

      <div className="panel mt-6 p-4">
        <p className="t-label">Current</p>
        <p className="t-h2 mt-1">
          {current.name} {onTrial ? "· trial" : ""}
        </p>
        <p className="t-data mt-2" style={{ color: "var(--color-text-2)" }}>
          {volume} / {current.waiversPerMonth} WAIVERS THIS MONTH ·{" "}
          {state === "ok" ? "WELL INSIDE" : state === "warn" ? "APPROACHING THE CAP" : "OVER THE CAP"}
        </p>
        {account.subscriptionStatus ? (
          <p className="t-secondary mt-2">
            Stripe subscription status: {account.subscriptionStatus}
          </p>
        ) : null}
      </div>

      {!configured ? (
        <p className="t-secondary mt-4" style={{ color: "var(--color-ember)" }}>
          Stripe is not configured on this deployment, so checkout is unavailable. Set
          STRIPE_SECRET_KEY and the three price IDs to enable it. Everything else in the product
          works without it.
        </p>
      ) : null}

      <div className="mt-8 flex flex-col gap-4">
        {PLAN_ORDER.map((id) => {
          const spec = PLANS[id];
          const isCurrent = id === account.plan;
          const features: string[] = [
            `${spec.waiversPerMonth.toLocaleString("en-US")} waivers a month`,
            `${spec.locations} ${spec.locations === 1 ? "location" : "locations"}`,
            "Waiver builder, guardian flow, QR signing, participant database, PDF export",
          ];
          if (spec.kiosk) features.push("Kiosk mode with offline queue, check-in board");
          if (spec.expiryRules) features.push("Expiry rules and re-sign prompts");
          if (spec.incidents) features.push("Incident notes linked to waivers");
          if (spec.csvExport) features.push("CSV export");
          if (spec.webhookOut) features.push("Webhook out, branded emails, unbranded posters");

          return (
            <div key={id} className="panel p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="t-h2">{spec.name}</p>
                <p className="t-data">
                  ${spec.priceMonthly}/MO · ${spec.priceAnnual}/YR
                </p>
              </div>
              <ul className="mt-3 flex flex-col gap-2">
                {features.map((f) => (
                  <li key={f} className="t-secondary flex items-start gap-2">
                    <IconCheck size={16} style={{ color: "var(--color-pine)", flex: "none" }} />
                    {f}
                  </li>
                ))}
              </ul>
              <p className="t-secondary mt-3">
                Annual is two months free. ${spec.priceAnnual} a year against ${" "}
                {spec.priceMonthly * 12} monthly.
              </p>
              <div className="mt-4">
                <BillingActions plan={id} isCurrent={isCurrent} configured={configured} />
              </div>
            </div>
          );
        })}
      </div>

      <p className="t-secondary mt-8">
        Cancelling never deletes the archive. Your signed waivers are a legal record with a
        multi-year retention period; a lapsed card drops features and caps, not evidence.
      </p>
    </div>
  );
}
