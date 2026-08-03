import type { Metadata } from "next";
import Link from "next/link";
import { Notice, ScreenTitle, SectionHead } from "@/components/ui";
import { requireSchool } from "@/lib/auth";
import { stripeConfigured } from "@/lib/env";
import { annualCents, checkStudentLimit, formatMoney, PLANS, PLAN_ORDER, trialState } from "@/lib/plans";
import { activeStudentCount } from "@/lib/roster";
import { formatDate } from "@/lib/time";
import { PlanForms } from "./PlanForms";

export const metadata: Metadata = { title: "MatPass plan" };

export default async function PlanPage() {
  const { school, user } = await requireSchool();
  const activeStudents = await activeStudentCount(school.id);
  const trial = trialState(school.trialEndsAt);
  const limit = checkStudentLimit(school.plan, activeStudents);

  return (
    <main className="screen">
      <ScreenTitle
        eyebrow="Your MatPass subscription"
        title="Plan"
        action={
          <Link href="/settings" className="btn-quiet">
            Settings
          </Link>
        }
      />

      <section>
        <p className="t-label">Active students</p>
        <p className="t-stat" style={{ marginTop: 4 }}>
          {activeStudents}
        </p>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          {PLANS[school.plan].name} covers up to {PLANS[school.plan].studentLimit} ·{" "}
          {school.billingStatus === "trialing" && trial.trialing
            ? `trial ends ${school.trialEndsAt ? formatDate(school.trialEndsAt, school.timezone) : "soon"}`
            : school.billingStatus}
        </p>
      </section>

      {limit.overLimit ? (
        <div style={{ marginTop: 20 }}>
          <Notice tone="warn">{limit.message} Nothing is blocked — every student still checks in.</Notice>
        </div>
      ) : null}

      {school.billingStatus === "trialing" && trial.expired ? (
        <div style={{ marginTop: 20 }}>
          <Notice tone="warn">
            The trial ended. The ledger keeps working — check-ins, gradings and promotions are never
            held hostage — but pick a plan when you are ready.
          </Notice>
        </div>
      ) : null}

      {!stripeConfigured() ? (
        <div style={{ marginTop: 20 }}>
          <Notice>
            No Stripe key is configured in this environment, so choosing a plan records the choice
            without opening checkout.
          </Notice>
        </div>
      ) : null}

      <SectionHead>Plans</SectionHead>
      <p className="t-secondary" style={{ marginBottom: 16 }}>
        Every feature is in every tier — the price follows student count, the honest scale axis.
        Annual is two months free.
      </p>

      <div className="flex flex-col" style={{ gap: 16 }}>
        {PLAN_ORDER.map((tier) => {
          const plan = PLANS[tier];
          const current = school.plan === tier;
          return (
            <div key={tier} className="card" style={{ padding: 16 }}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="t-title">{plan.name}</p>
                <span className="t-data-lg">{formatMoney(plan.priceCents)}</span>
              </div>
              <p className="t-secondary" style={{ marginTop: 4 }}>
                up to {plan.studentLimit} students · {formatMoney(annualCents(tier))}/year
              </p>
              <p className="t-secondary" style={{ marginTop: 8 }}>
                {plan.blurb}
              </p>
              <ul style={{ marginTop: 12, paddingLeft: 0, listStyle: "none" }}>
                {plan.includes.map((item) => (
                  <li key={item} className="t-secondary" style={{ marginTop: 4 }}>
                    {item}
                  </li>
                ))}
              </ul>
              {current ? (
                <p className="t-label crimson" style={{ marginTop: 16 }}>
                  Current plan
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <PlanForms
        canManage={user.role === "owner"}
        currentTier={school.plan}
        hasCustomer={Boolean(school.stripeCustomerId)}
      />
    </main>
  );
}
