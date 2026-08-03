import type { Metadata } from "next";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { employees } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { billingConfigured } from "@/lib/billing";
import {
  PLANS,
  PLAN_ORDER,
  SERIOUS_PENALTY_CENTS,
  formatUsd,
  monthsCoveredByOneCitation,
} from "@/lib/plans";
import { daysBetween, monthDayYear, todayIso } from "@/lib/dates";
import { ScreenHeader } from "@/components/ScreenHeader";
import { PlanPicker } from "./PlanPicker";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { company } = await requireUser();
  const params = await searchParams;
  const db = getDb();
  const [{ active }] = await db
    .select({ active: sql<number>`count(*)::int` })
    .from(employees)
    .where(and(eq(employees.companyId, company.id), eq(employees.active, true)));

  const today = todayIso(company.timezone);
  const trialDaysLeft = company.trialEndsAt
    ? daysBetween(today, company.trialEndsAt.toISOString().slice(0, 10))
    : null;

  return (
    <main className="screen">
      <ScreenHeader
        label="Billing"
        title={`${PLANS[company.plan].name} plan`}
        back={{ href: "/settings", label: "Settings" }}
      />

      {params.checkout === "success" ? (
        <p className="t-secondary" role="status" style={{ color: "var(--color-green)" }}>
          Checkout complete. The plan updates as soon as Stripe confirms the subscription —
          usually within a second or two.
        </p>
      ) : null}
      {params.checkout === "cancelled" ? (
        <p className="t-secondary" style={{ color: "var(--color-fg-2)" }}>
          Checkout cancelled. Nothing changed.
        </p>
      ) : null}

      <dl className="rule-t rule-b mt-4 grid grid-cols-2 gap-y-3 py-4">
        <Fact label="Status" value={company.subscriptionStatus.replace("_", " ")} />
        <Fact
          label="Field employees"
          value={`${active} of ${PLANS[company.plan].headcount}`}
        />
        <Fact
          label="Trial"
          value={
            company.subscriptionStatus === "trialing" && trialDaysLeft !== null
              ? trialDaysLeft > 0
                ? `${trialDaysLeft} days left`
                : "Ended"
              : "—"
          }
        />
        <Fact
          label="Renews"
          value={
            company.trialEndsAt && company.subscriptionStatus === "trialing"
              ? monthDayYear(company.trialEndsAt.toISOString().slice(0, 10))
              : "—"
          }
        />
      </dl>

      <section className="mt-8">
        <h2 className="t-label">The arithmetic</h2>
        <p className="t-body mt-2" style={{ color: "var(--color-fg-2)" }}>
          One avoided serious violation at the 2025 federal maximum of{" "}
          <span className="t-mono">{formatUsd(SERIOUS_PENALTY_CENTS)}</span> pays for{" "}
          <span className="t-mono">{monthsCoveredByOneCitation("crew")}</span> months of the Crew
          plan. Citations arrive in multiples.
        </p>
        <p className="t-secondary mt-2">
          Every plan includes every compliance feature — the 300A is never behind a paywall.
          Plans differ by field headcount only.
        </p>
      </section>

      <PlanPicker
        currentPlan={company.plan}
        activeEmployees={active}
        configured={billingConfigured()}
        hasCustomer={Boolean(company.stripeCustomerId)}
        plans={PLAN_ORDER.map((id) => ({
          id,
          name: PLANS[id].name,
          price: formatUsd(PLANS[id].priceCents),
          annual: formatUsd(PLANS[id].annualCents),
          headcount: PLANS[id].headcount,
          tagline: PLANS[id].tagline,
          includes: PLANS[id].includes,
        }))}
      />

      <p className="t-secondary mt-10">
        If you cancel, the account goes read-only and every record stays — you keep reading and
        exporting them. The 1904 retention duty runs five years, and leaving should not mean
        losing your defence. Deleting data is a separate, explicit request.
      </p>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="t-label">{label}</dt>
      <dd className="t-data mt-1" style={{ textTransform: "capitalize" }}>
        {value}
      </dd>
    </div>
  );
}
