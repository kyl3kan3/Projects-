import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireOrg } from "@/lib/auth";
import { getDb } from "@/db";
import { budgets } from "@/db/schema";
import { verifiedAccounts } from "@/lib/accounts";
import { budgetSpendMicros, knownServices, knownTagPairs } from "@/lib/facts";
import { burnState, scopeLabel } from "@/lib/budgets";
import { forecastMonth } from "@/lib/forecast";
import { addDays, dayKey, monthStart } from "@/lib/dates";
import { formatUsd, formatUsdWhole } from "@/lib/money";
import { plan } from "@/lib/plans";
import { IconArrowLeft } from "@/components/icons";
import { DeleteBudgetButton, NewBudgetForm } from "./BudgetForms";

export const metadata: Metadata = { title: "Budgets" };
export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  const { org } = await requireOrg();
  const gates = plan(org.plan);
  const db = getDb();
  const accounts = await verifiedAccounts(org.id);
  const accountIds = accounts.map((a) => a.id);
  const rows = await db.select().from(budgets).where(eq(budgets.orgId, org.id));

  const now = new Date();
  const start = monthStart(now);
  const today = new Date(`${dayKey(now)}T00:00:00Z`);

  const states = [];
  for (const budget of rows) {
    const spent = await budgetSpendMicros(budget, { from: start, to: now }, accountIds);
    const daily: number[] = [];
    for (let i = 7; i >= 1; i--) {
      daily.push(
        await budgetSpendMicros(
          budget,
          { from: addDays(today, -i), to: addDays(today, -i + 1) },
          accountIds,
        ),
      );
    }
    const forecast = forecastMonth({
      mtdMicros: spent,
      asOf: now,
      recentDailyMicros: daily.filter((v) => v > 0),
    });
    states.push({
      budget,
      state: burnState({
        spentMicros: spent,
        limitMicros: budget.monthlyLimitMicros,
        forecast,
        asOf: now,
      }),
    });
  }
  states.sort((a, b) => b.state.fraction - a.state.fraction);

  const services = await knownServices(org.id);
  const tagPairs = await knownTagPairs(org.id);

  return (
    <main>
      <header
        className="gutter"
        style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 12, paddingBottom: 8 }}
      >
        <Link
          href="/watch"
          aria-label="Back to the watch"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            marginLeft: -10,
            color: "var(--color-text-2)",
          }}
        >
          <IconArrowLeft size={22} />
        </Link>
        <span className="t-data" style={{ color: "var(--color-text-2)" }}>
          {org.name}
        </span>
      </header>

      <section className="gutter">
        <h1 className="t-h2">Budgets</h1>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          A budget alerts once per threshold per month — when it is crossed, or
          earlier if the burn rate says it will be.
        </p>
      </section>

      {!gates.budgets ? (
        <section className="gutter" style={{ paddingTop: 24 }}>
          <div className="card" style={{ padding: 16 }}>
            <p className="t-title" style={{ margin: 0 }}>
              Budgets are a Startup feature
            </p>
            <p className="t-secondary" style={{ marginTop: 8 }}>
              Your plan is {plan(org.plan).name}. Budgets per service, tag or account
              — with burn-rate projection alerts — start on Startup.
            </p>
            <Link
              className="btn btn-secondary btn-full"
              href="/settings/billing"
              style={{ marginTop: 16 }}
            >
              See plans
            </Link>
          </div>
        </section>
      ) : null}

      <section className="gutter" style={{ paddingTop: 24 }}>
        {states.length === 0 ? (
          <p className="t-secondary" style={{ margin: 0 }}>
            No budgets yet. The most useful first one is a tag budget for the team
            that spends the most.
          </p>
        ) : (
          <div>
            {states.map(({ budget, state }) => (
              <div key={budget.id} className="row" style={{ alignItems: "flex-start", gap: 12 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="t-title" style={{ display: "block" }}>
                    {budget.name}
                  </span>
                  <span className="t-secondary" style={{ display: "block" }}>
                    {scopeLabel(budget.scope, budget.scopeValue)}
                  </span>
                  <span className="meter" style={{ display: "block", margin: "8px 0" }}>
                    <span
                      className="meter-fill"
                      data-level={state.level}
                      style={{ display: "block", width: `${Math.min(100, state.fraction * 100)}%` }}
                    />
                  </span>
                  <span
                    className="t-data"
                    style={{
                      display: "block",
                      color:
                        state.level === "ok" ? "var(--color-text-2)" : "var(--color-amber)",
                    }}
                  >
                    {formatUsd(state.spentMicros)} OF {formatUsdWhole(state.limitMicros)} · RESETS IN{" "}
                    {state.resetsInDays}D
                  </span>
                  <span
                    className="t-data"
                    style={{ display: "block", color: "var(--color-text-3)", marginTop: 4 }}
                  >
                    PROJECTED {formatUsdWhole(state.projectedMicros)} ·{" "}
                    {Math.round(state.projectedFraction * 100)}% OF LIMIT · ALERTS AT{" "}
                    {budget.thresholds.join("/")}%
                  </span>
                </span>
                <DeleteBudgetButton budgetId={budget.id} name={budget.name} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="gutter" style={{ paddingTop: 32, paddingBottom: 40 }}>
        <h2 className="t-label" style={{ marginBottom: 16 }}>
          New budget
        </h2>
        <NewBudgetForm
          services={services}
          tagPairs={tagPairs}
          accounts={accounts.map((a) => ({ id: a.id, label: a.label }))}
          disabled={!gates.budgets}
        />
      </section>
    </main>
  );
}
