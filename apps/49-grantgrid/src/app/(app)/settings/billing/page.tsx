import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { IconChevronLeft } from "@/components/icons";
import { effectivePlan, entitlement, stripeConfigured } from "@/lib/billing";
import { isUnlimited, plan } from "@/lib/plans";
import { grantCount } from "@/lib/grants";
import { PlanPicker, PortalButton } from "./BillingForms";

export const metadata: Metadata = { title: "Plan and billing" };
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const { org } = await requireUser();
  const ent = entitlement(org);
  const activePlan = effectivePlan(org);
  const spec = plan(activePlan);
  const count = await grantCount(org.id);
  const configured = stripeConfigured();

  return (
    <div className="screen">
      <div className="pt-6">
        <Link href="/settings" className="btn-quiet" style={{ minHeight: 44 }}>
          <IconChevronLeft size={18} />
          Settings
        </Link>
      </div>

      <header className="rule-b pb-4 pt-2">
        <h1 className="t-h2">Plan and billing</h1>
        <p className="t-data mt-2" style={{ color: "var(--color-ink-2)" }}>
          {spec.name.toUpperCase()}
          {ent.state === "trialing" && ent.trialDaysLeft !== null
            ? ` · TRIAL, ${ent.trialDaysLeft} ${ent.trialDaysLeft === 1 ? "DAY" : "DAYS"} LEFT`
            : ent.state === "trial_expired"
              ? " · TRIAL ENDED"
              : ent.state === "past_due"
                ? " · PAYMENT FAILING"
                : ""}
          {isUnlimited(spec.trackedGrants)
            ? " · UNLIMITED GRANTS"
            : ` · ${count}/${spec.trackedGrants} GRANTS`}
        </p>
      </header>

      {ent.state === "past_due" ? (
        <p className="t-secondary rule-b py-3">
          A payment has failed and Stripe is retrying. Your plan is still active and
          reminders are still sending — losing a deadline over an expired card would be
          indefensible. Update the card when you can.
        </p>
      ) : null}

      {!configured ? (
        <p className="t-secondary rule-b py-3">
          <strong style={{ color: "var(--color-brick-text)" }}>
            Stripe is not configured on this deployment.
          </strong>{" "}
          Set <code className="t-data">STRIPE_SECRET_KEY</code> and the three{" "}
          <code className="t-data">STRIPE_PRICE_*</code> variables and checkout will open
          from the buttons below. Until then, plan entitlements are honoured from the
          database and the trial clock, so the app is fully usable — you simply cannot
          pay for it here.
        </p>
      ) : null}

      <section className="pt-6">
        <PlanPicker currentPlan={activePlan} />
      </section>

      <section className="pt-8">
        <h2 className="t-label">What happens if you downgrade</h2>
        <p className="t-body mt-2" style={{ color: "var(--color-ink-2)" }}>
          Nothing is deleted, hidden, or stops being reminded about. If you drop to Seed
          holding more than 25 tracked grants, everything you have stays exactly as it is
          and reminders keep going out — you simply cannot add a 26th until you close one
          out or move back up. A nonprofit should never lose a deadline because of a
          billing decision.
        </p>
      </section>

      {org.stripeCustomerId ? (
        <section className="pt-8">
          <h2 className="t-label">Invoices and card</h2>
          <div className="pt-4">
            <PortalButton />
          </div>
        </section>
      ) : null}

      <p className="t-secondary rule-t mt-8 pt-4" style={{ color: "var(--color-ink-2)" }}>
        Annual billing is ten months&rsquo; money for twelve months — nonprofits budget
        annually, so it is the cheaper way to buy this.
      </p>
    </div>
  );
}
