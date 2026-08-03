import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { requireOrg } from "@/lib/auth";
import { getDb } from "@/db";
import { anomalies, deploys } from "@/db/schema";
import { resolveSelected } from "@/lib/accounts";
import { switcherAccounts } from "@/lib/dashboard";
import { addDays, stampShort } from "@/lib/dates";
import { formatPerDay } from "@/lib/money";
import { plan } from "@/lib/plans";
import { DemoNotice, ScreenHeader } from "@/components/ScreenHeader";
import { IconExternal, IconPennant } from "@/components/icons";

export const metadata: Metadata = { title: "Deploys" };
export const dynamic = "force-dynamic";

export default async function DeploysPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const { org } = await requireOrg();
  const params = await searchParams;
  const { selected, accounts } = await resolveSelected(org.id, params.account);
  const db = getDb();
  const gates = plan(org.plan);

  const rows = await db
    .select()
    .from(deploys)
    .where(and(eq(deploys.orgId, org.id), gte(deploys.deployedAt, addDays(new Date(), -30))))
    .orderBy(desc(deploys.deployedAt))
    .limit(60);

  const live = await db
    .select()
    .from(anomalies)
    .where(and(eq(anomalies.orgId, org.id), isNull(anomalies.resolvedAt)));
  const correlated = new Map(
    live
      .filter((a) => a.correlatedDeployId)
      .map((a) => [a.correlatedDeployId as string, a.deltaPerDayMicros]),
  );

  const openCount = live.length;

  return (
    <main>
      <ScreenHeader
        accounts={switcherAccounts(accounts)}
        selectedId={selected?.id ?? ""}
        openAnomalies={openCount}
      />
      <DemoNotice show={Boolean(selected && selected.provider === "demo")} />

      <section className="gutter" style={{ paddingTop: 20 }}>
        <h1 className="t-h2">Deploys</h1>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          Every deploy that lands here becomes a pennant on the cost timeline. When
          a spike starts inside six hours of one, the alert names it.
        </p>
      </section>

      {!gates.deployCorrelation ? (
        <section className="gutter" style={{ paddingTop: 24 }}>
          <div className="card" style={{ padding: 16 }}>
            <p className="t-title" style={{ margin: 0 }}>
              Deploy correlation is a Startup feature
            </p>
            <p className="t-secondary" style={{ marginTop: 8 }}>
              Your plan records deploys but does not correlate them with anomalies.
              Startup adds the correlation, the pennants on the chart and the
              probable-cause line in every alert.
            </p>
            <Link className="btn btn-secondary btn-full" href="/settings/billing" style={{ marginTop: 16 }}>
              See plans
            </Link>
          </div>
        </section>
      ) : null}

      <section className="gutter" style={{ paddingTop: 24 }}>
        {rows.length === 0 ? (
          <div style={{ display: "grid", gap: 12, justifyItems: "start", paddingTop: 16 }}>
            <span style={{ color: "var(--color-text-3)" }}>
              <IconPennant size={40} />
            </span>
            <p className="t-title" style={{ margin: 0 }}>
              No deploys recorded in the last 30 days.
            </p>
            <p className="t-secondary" style={{ margin: 0 }}>
              Point a GitHub webhook at your CloudSpend URL, or add one line to the
              end of your deploy script. Both are in Settings.
            </p>
            <Link className="btn btn-secondary" href="/settings">
              Get the webhook URL
            </Link>
          </div>
        ) : (
          <div>
            {rows.map((deploy) => {
              const delta = correlated.get(deploy.id);
              return (
                <div key={deploy.id} className="row" style={{ gap: 12 }}>
                  <span
                    style={{
                      flex: "none",
                      color: delta ? "var(--color-amber)" : "var(--color-text-3)",
                    }}
                  >
                    <IconPennant size={18} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="t-data" style={{ display: "block", color: "var(--color-text)" }}>
                      {deploy.sha.slice(0, 7)} · {deploy.serviceName} ·{" "}
                      {stampShort(deploy.deployedAt)}
                    </span>
                    <span className="t-secondary">
                      {deploy.source === "github" ? "GitHub" : "Webhook"}
                      {deploy.actor ? ` · ${deploy.actor}` : ""}
                      {deploy.environment ? ` · ${deploy.environment}` : ""}
                      {delta ? ` · ${formatPerDay(delta)} CORRELATED` : ""}
                    </span>
                  </span>
                  {deploy.commitUrl ? (
                    <a
                      href={deploy.commitUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`View commit ${deploy.sha.slice(0, 7)} on GitHub`}
                      style={{
                        flex: "none",
                        color: "var(--color-steel)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 44,
                        height: 44,
                      }}
                    >
                      <IconExternal size={18} />
                    </a>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
