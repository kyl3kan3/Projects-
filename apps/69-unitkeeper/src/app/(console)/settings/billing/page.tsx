import type { Metadata } from "next";
import Link from "next/link";
import { ChoosePlanForm, PortalForm } from "@/app/(console)/settings/billing/BillingButtons";
import { requireOwner } from "@/lib/auth";
import { billingConfigured } from "@/lib/billing";
import { PAID_PLANS, PLANS } from "@/lib/plans";
import { unitCount } from "@/lib/units";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage() {
  const { owner, ent } = await requireOwner();
  const used = await unitCount(owner.id);
  const configured = billingConfigured();

  return (
    <main style={{ padding: "20px 20px 40px", maxWidth: 680 }}>
      <Link href="/settings" className="t-secondary">
        ← Settings
      </Link>
      <h1 className="t-h2" style={{ marginTop: 8 }}>
        Billing
      </h1>
      <p className="t-secondary" style={{ marginTop: 4 }}>
        {ent.trialing
          ? `Trial — ${ent.trialDaysLeft} day${ent.trialDaysLeft === 1 ? "" : "s"} left, no card taken.`
          : `${ent.spec.name} · ${owner.subscriptionStatus ?? "active"}`}
        {" · "}
        {used} unit{used === 1 ? "" : "s"} in use
      </p>

      {ent.locked && ent.lockReason ? (
        <p className="rail-stop" style={{ marginTop: 16 }}>
          {ent.lockReason}
        </p>
      ) : null}

      {!configured ? (
        <p className="t-secondary" style={{ marginTop: 16 }}>
          Stripe is not configured in this deployment, so checkout will refuse rather than pretend.
          Set <span className="t-mono">STRIPE_SECRET_KEY</span> and the three price ids to take
          payments. UnitKeeper&rsquo;s own subscription is separate from tenant rent, which rides your
          Stripe Connect account.
        </p>
      ) : null}

      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 20 }}>
        {PAID_PLANS.map((planId) => {
          const plan = PLANS[planId];
          const current = ent.plan === planId && !ent.trialing;
          const tooSmall = used > plan.units;
          return (
            <div key={planId} className="hairline-b" style={{ padding: "16px 0" }}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="t-title">{plan.name}</h2>
                <p className="t-mono-lg">${plan.priceMonthly}/mo</p>
              </div>
              <p className="t-secondary" style={{ marginTop: 4 }}>
                {plan.blurb}
              </p>
              <p className="t-secondary" style={{ marginTop: 4 }}>
                {plan.units} units · {plan.facilities} facilit{plan.facilities === 1 ? "y" : "ies"} ·{" "}
                {plan.lienEngine ? "lien engine" : "no lien engine"} ·{" "}
                {plan.gateExports ? "gate CSV" : "no gate CSV"}
              </p>
              <div style={{ marginTop: 12 }}>
                {current ? (
                  <p className="placard" data-tone="paid">
                    Current plan
                  </p>
                ) : tooSmall ? (
                  <p className="field-help">
                    You have {used} units, which is past this plan&rsquo;s {plan.units}. Nothing would
                    be deleted, but those units would go read-only.
                  </p>
                ) : (
                  <ChoosePlanForm plan={planId} label={`Choose ${plan.name} — $${plan.priceMonthly}/mo`} />
                )}
              </div>
            </div>
          );
        })}
      </section>

      {owner.stripeCustomerId ? (
        <section className="hairline-t" style={{ marginTop: 24, paddingTop: 20 }}>
          <h2 className="t-label">Card and invoices</h2>
          <div style={{ marginTop: 12 }}>
            <PortalForm />
          </div>
        </section>
      ) : null}

      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 20 }}>
        <h2 className="t-label">Tenant rent is separate</h2>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          Rent is charged on your own Stripe account through Connect, so the money lands in your bank
          without passing through ours. Push ACH to your tenants: 0.8% capped at $5 beats 2.9% + 30¢
          on a $129 unit, and on 140 units that is real money every month.
        </p>
      </section>
    </main>
  );
}
