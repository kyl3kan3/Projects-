import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { stripeConfigured } from "@/lib/env";
import { PAID_PLANS, PLANS, planFor, priceLabel, trialState, vendorCap } from "@/lib/plans";
import { countVendors } from "@/lib/vendors";
import { PortalButton, SubscribeButton } from "./BillingActions";

export const metadata: Metadata = { title: "Plans and billing" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ subscribed?: string }>;
}) {
  const { user, org } = await requireUser();
  const { subscribed } = await searchParams;
  const plan = planFor(org.plan);
  const trial = trialState(org);
  const cap = vendorCap(org.plan, await countVendors(org.id));

  return (
    <main style={{ padding: "24px var(--gutter) 0" }}>
      <Link href="/settings" className="btn-quiet">
        Settings
      </Link>
      <h1 className="t-h2" style={{ marginTop: 12 }}>
        Plans and billing
      </h1>

      {subscribed && (
        <p className="t-secondary" role="status" style={{ marginTop: 8 }}>
          Thank you. Your plan updates as soon as Stripe confirms the subscription — usually within a
          few seconds.
        </p>
      )}

      <p className="t-body" style={{ marginTop: 12 }}>
        You are on <strong>{plan.name}</strong>
        {trial.onTrial && !trial.expired
          ? ` with ${trial.daysLeft} day${trial.daysLeft === 1 ? "" : "s"} left`
          : ""}
        {trial.expired ? " — the trial has ended and the file is read-only" : ""}.{" "}
        {cap.limit != null
          ? `${cap.used} of ${cap.limit} vendors.`
          : `${cap.used} vendors, no cap.`}
      </p>
      <p className="t-secondary" style={{ marginTop: 8, maxWidth: "62ch" }}>
        Priced per company, not per certificate. Upload as many certificates for a vendor as their
        agent sends — the incumbents charge per certificate, which punishes exactly the diligence you
        are paying for.
      </p>

      <div style={{ marginTop: 24, display: "grid", gap: 16 }}>
        {PAID_PLANS.map((id) => {
          const p = PLANS[id];
          const current = org.plan === id;
          return (
            <section
              key={id}
              className="panel"
              style={{
                padding: 20,
                boxShadow: current ? "inset 0 0 0 1px var(--color-seal)" : undefined,
              }}
            >
              <div className="flex items-baseline justify-between" style={{ gap: 12 }}>
                <h2 className="t-h2">{p.name}</h2>
                <span className="t-mono-lg">{priceLabel(p)}</span>
              </div>
              <p className="t-secondary" style={{ marginTop: 6 }}>
                {p.blurb}
              </p>
              <ul
                className="t-secondary"
                style={{ marginTop: 12, paddingLeft: 18, listStyle: "disc" }}
              >
                <li>{p.vendors == null ? "Unlimited vendors" : `Up to ${p.vendors} vendors`}</li>
                <li>{p.users} user{p.users === 1 ? "" : "s"}</li>
                <li>Parsing, the compliance engine, chasing and binder exports</li>
                <li>
                  {p.hooks
                    ? "Work-order compliance hook (JSON and CSV)"
                    : "Compliance hook not included"}
                </li>
              </ul>
              <div style={{ marginTop: 16 }}>
                <SubscribeButton
                  plan={id}
                  label={`Choose ${p.name}`}
                  current={current}
                  disabled={user.role !== "admin" || !stripeConfigured()}
                />
              </div>
              {user.role !== "admin" && !current && (
                <p className="field-help">Only an admin can change the plan.</p>
              )}
            </section>
          );
        })}
      </div>

      {!stripeConfigured() && (
        <p className="t-secondary" style={{ marginTop: 24, maxWidth: "62ch" }}>
          Stripe is not configured in this deployment, so checkout is disabled. Plan limits, the trial
          countdown and the read-only behaviour all work regardless — they are driven by the org
          record, which the Stripe webhook is the only thing allowed to change.
        </p>
      )}

      {org.stripeCustomerId && user.role === "admin" && <PortalButton />}

      <section style={{ marginTop: 40 }}>
        <h2 className="t-h2">If you stop paying</h2>
        <p className="t-secondary" style={{ marginTop: 8, maxWidth: "62ch" }}>
          Nothing is deleted. The file goes read-only: certificates, verdicts and history stay exactly
          as they are, and <strong>binder exports keep working</strong>. Holding an audit binder
          hostage over $99 is not a business model. Adding vendors and sending chases resume the
          moment a plan is active again.
        </p>
      </section>
    </main>
  );
}
