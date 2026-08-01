import type { Metadata } from "next";
import Link from "next/link";
import { canAdminister, requireUser } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { IconCheck } from "@/components/icons";
import { PLANS, PLAN_ORDER } from "@/lib/plans";
import { billingConfigured, trialState } from "@/lib/billing";
import { countActiveProjects } from "@/lib/projects";
import { billingPortalAction, checkoutAction } from "../actions";

export const metadata: Metadata = { title: "Plans and billing" };

export default async function BillingPage() {
  const { company, user } = await requireUser();
  const admin = canAdminister(user.role);
  const trial = trialState(company);
  const active = await countActiveProjects(company.id);
  const configured = billingConfigured();

  return (
    <main className="wrap">
      <header className="gutter" style={{ paddingBlock: "var(--s5)" }}>
        <Link href="/settings" className="t-secondary">
          ← Settings
        </Link>
        <h1 className="t-h2" style={{ marginTop: "var(--s3)" }}>
          Plans and billing
        </h1>
        <p className="t-secondary" style={{ marginTop: "var(--s2)" }}>
          Priced by active projects and seats — never per sub. Subs are free forever, with no
          account, which is the only reason they use it.
        </p>
        {trial.onTrial ? (
          <p className="notice" style={{ marginTop: "var(--s4)" }}>
            {trial.daysLeft} day{trial.daysLeft === 1 ? "" : "s"} left on the trial. Run one real
            package through it — that is the only test that matters.
          </p>
        ) : null}
        {!configured ? (
          <p className="notice notice-bad" style={{ marginTop: "var(--s4)" }}>
            Stripe is not configured on this deployment, so checkout is unavailable. Set
            STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and the three price ids from{" "}
            <code className="t-data">.env.example</code>.
          </p>
        ) : null}
      </header>

      <section className="gutter stack" style={{ gap: "var(--s5)" }}>
        {PLAN_ORDER.map((id) => {
          const plan = PLANS[id];
          const current = company.plan === id;
          const overLimit = Number.isFinite(plan.activeProjects) && active > plan.activeProjects;
          return (
            <article key={id} className="card" style={{ padding: "var(--s5)" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: "var(--s3)",
                }}
              >
                <h2 className="t-title">{plan.name}</h2>
                <span className="t-data" style={{ fontSize: 15 }}>
                  ${plan.priceMonthly}/mo
                </span>
              </div>
              <p className="t-secondary" style={{ marginTop: "var(--s2)" }}>
                {plan.blurb}
              </p>
              <p className="t-data" style={{ marginTop: "var(--s3)", color: "var(--fg-2)" }}>
                {Number.isFinite(plan.activeProjects)
                  ? `${plan.activeProjects} ACTIVE PROJECTS`
                  : "UNLIMITED PROJECTS"}{" "}
                · {plan.seats} SEATS · {plan.storageGb} GB
              </p>

              <ul
                className="stack"
                style={{ gap: "var(--s2)", marginTop: "var(--s4)", listStyle: "none" }}
              >
                {plan.features.map((f) => (
                  <li key={f} className="t-secondary" style={{ display: "flex", gap: "var(--s2)" }}>
                    <IconCheck size={16} />
                    {f}
                  </li>
                ))}
              </ul>

              <div style={{ marginTop: "var(--s5)" }}>
                {current ? (
                  <p className="t-label" style={{ color: "var(--ok)" }}>
                    YOUR CURRENT PLAN
                  </p>
                ) : (
                  <ActionForm
                    action={checkoutAction}
                    submitLabel={`Switch to ${plan.name}`}
                    variant="secondary"
                    hiddenFields={{ plan: id }}
                    disabled={!admin || !configured}
                    disabledReason={
                      !admin
                        ? "Only an admin can change the plan."
                        : !configured
                          ? "Checkout needs Stripe keys on this deployment."
                          : undefined
                    }
                  />
                )}
                {overLimit ? (
                  <p className="t-secondary" style={{ marginTop: "var(--s3)", color: "var(--warn)" }}>
                    You have {active} active projects. Moving here pauses the ones due furthest out —
                    read-only, never deleted.
                  </p>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>

      {company.stripeCustomerId && admin && configured ? (
        <section className="gutter" style={{ paddingTop: "var(--s6)" }}>
          <form action={billingPortalAction}>
            <button type="submit" className="btn btn-secondary btn-full">
              Invoices and payment method
            </button>
          </form>
        </section>
      ) : null}

      <section className="gutter" style={{ paddingTop: "var(--s6)" }}>
        <h2 className="t-label">The arithmetic</h2>
        <p className="t-secondary" style={{ marginTop: "var(--s2)" }}>
          One estimator night per bid package, at the loaded cost of an estimator, is worth more than
          $149. The enterprise answer — BuildingConnected — starts around $3,600 a year and real GC
          contracts run well past $22,000. Crew is $1,788 a year and does the part you actually do.
        </p>
      </section>
    </main>
  );
}
