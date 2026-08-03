import type { Metadata } from "next";
import Link from "next/link";
import { requireOrg } from "@/lib/auth";
import { resolveSelected } from "@/lib/accounts";
import { loadDashboard, switcherAccounts } from "@/lib/dashboard";
import { listAnomalies, thumbnailValues } from "@/lib/anomalies";
import { leadTimeLabel } from "@/lib/anomaly";
import { formatPercentDelta, formatUsd, formatUsdWhole } from "@/lib/money";
import { plan } from "@/lib/plans";
import { DemoNotice, ScreenHeader } from "@/components/ScreenHeader";
import { SpendChart } from "@/components/SpendChart";
import { AnomalyCard, type AnomalyCardData } from "@/components/AnomalyCard";
import { IconPlug, IconTarget } from "@/components/icons";

export const metadata: Metadata = { title: "The Watch" };
export const dynamic = "force-dynamic";

export default async function WatchPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const { org } = await requireOrg();
  const params = await searchParams;
  const { selected, accounts } = await resolveSelected(org.id, params.account);

  if (!selected) {
    return (
      <main>
        <header className="gutter" style={{ paddingTop: 20, paddingBottom: 8 }}>
          <p className="t-label" style={{ color: "var(--color-steel)" }}>
            CloudSpend
          </p>
        </header>
        <section
          className="gutter"
          style={{ paddingTop: 40, paddingBottom: 40, display: "grid", gap: 16, justifyItems: "start" }}
        >
          <span style={{ color: "var(--color-steel)" }}>
            <IconPlug size={40} />
          </span>
          <h1 className="t-h2" style={{ margin: 0 }}>
            Connect your first AWS account — read-only, 5 minutes.
          </h1>
          <p className="t-body" style={{ color: "var(--color-text-2)", margin: 0 }}>
            One CloudFormation stack creates a role that can read your costs and
            describe your resources. It cannot start, stop, modify or delete
            anything, and you can read the whole policy before you click.
          </p>
        </section>
        {/* Room for the thumb bar, which floats over the end of the content. */}
        <div style={{ height: 96 }} />
        <div className="thumb-bar">
          <Link className="btn btn-primary btn-full" href="/connect">
            <IconPlug size={18} />
            Add account
          </Link>
        </div>
      </main>
    );
  }

  const now = new Date();
  const accountIds = [selected.id];
  const data = await loadDashboard(accountIds, org.id, now);
  const anomalyRows = await listAnomalies(org.id, { accountId: selected.id });
  const openCount = anomalyRows.filter((r) => r.anomaly.status !== "resolved").length;
  const gates = plan(org.plan);

  const cards: AnomalyCardData[] = [];
  for (const row of anomalyRows.slice(0, 4)) {
    cards.push({
      id: row.anomaly.id,
      service: row.anomaly.service,
      region: row.anomaly.region,
      status: row.anomaly.status,
      startedAt: row.anomaly.startedAt.toISOString(),
      deltaPerDayMicros: row.anomaly.deltaPerDayMicros,
      ackedBy: row.anomaly.ackedBy,
      deploy: row.deploy
        ? {
            sha: row.deploy.sha.slice(0, 7),
            serviceName: row.deploy.serviceName,
            leadTime: leadTimeLabel(row.deploy.deployedAt, row.anomaly.startedAt),
          }
        : null,
      thumbnail: await thumbnailValues(row.anomaly.accountId, {
        service: row.anomaly.service,
        region: row.anomaly.region,
        asOf: now,
      }),
      demo: selected.provider === "demo",
    });
  }

  const correlatedDeployIds = new Set(
    anomalyRows.map((r) => r.anomaly.correlatedDeployId).filter(Boolean) as string[],
  );
  const pennants = gates.deployCorrelation
    ? data.pennants.map((p) => ({ ...p, correlated: correlatedDeployIds.has(p.deployId) }))
    : [];
  const firstOpen = anomalyRows.find((r) => r.anomaly.status !== "resolved");
  const excessFromIndex = firstOpen
    ? data.series.findIndex((s) => s.day === firstOpen.anomaly.startedAt.toISOString().slice(0, 10))
    : -1;

  return (
    <main>
      <ScreenHeader
        accounts={switcherAccounts(accounts)}
        selectedId={selected.id}
        openAnomalies={openCount}
      />
      <DemoNotice show={selected.provider === "demo"} />

      {/* The MTD block is not a card — it is the top of the page itself. */}
      <section className="gutter" style={{ paddingTop: 24, paddingBottom: 24 }}>
        <p className="t-label">Month to date</p>
        <p className="t-display" style={{ color: "var(--color-paper)", marginTop: 8 }}>
          {formatUsd(data.mtdMicros)}
        </p>
        <p className="t-data" style={{ color: "var(--color-text-2)", marginTop: 12 }}>
          FORECAST {formatUsdWhole(data.forecastMicros)} ·{" "}
          {formatPercentDelta(data.forecastMicros, data.lastMonthTotalMicros).toUpperCase()} VS{" "}
          {data.lastMonthName}
        </p>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          {formatPercentDelta(data.mtdMicros, data.lastMonthToDateMicros)} against the same point in{" "}
          {data.lastMonthName.toLowerCase()}
          {data.forecastMethod === "run-rate"
            ? " · forecast from this month's run rate so far"
            : " · forecast from the last 7 days' rate"}
        </p>
      </section>

      <div className="watch-layout gutter" style={{ paddingBottom: 24 }}>
        <div style={{ minWidth: 0 }}>
          <SpendChart
            ariaLabel={`Daily spend for ${selected.label} over the last 14 days, against its baseline`}
            points={data.series.map((s) => ({
              label: s.label,
              value: s.micros,
              baseline: s.baselineMicros,
            }))}
            pennants={pennants}
            nowFraction={data.nowFraction}
            excessFromIndex={excessFromIndex >= 0 ? excessFromIndex : null}
            anomalyState={firstOpen ? firstOpen.anomaly.status : null}
            caption={`14 DAYS · ${formatUsdWhole(
              data.series.reduce((sum, s) => sum + s.micros, 0),
            )} · DASHED = BASELINE`}
            emptyMessage="No costs ingested yet. The first backfill lands within a few minutes of connecting."
          />

          {data.movers.length ? (
            <section style={{ marginTop: 32 }}>
              <h2 className="t-label">Top movers this week</h2>
              <div style={{ marginTop: 4 }}>
                {data.movers.map((mover) => (
                  <div key={mover.key} className="row">
                    <span
                      className="t-data"
                      style={{
                        color: mover.deltaMicros > 0 ? "var(--color-amber)" : "var(--color-green)",
                        minWidth: 84,
                      }}
                    >
                      {mover.deltaMicros > 0 ? "+" : "-"}
                      {formatUsdWhole(Math.abs(mover.deltaMicros)).replace("$", "$")}
                    </span>
                    <span className="t-title" style={{ flex: 1, minWidth: 0 }}>
                      {mover.key}
                    </span>
                    <span className="t-data" style={{ color: "var(--color-text-3)" }}>
                      {formatPercentDelta(mover.currentMicros, mover.previousMicros)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section style={{ marginTop: 32 }}>
            <h2 className="t-label">Where the month went</h2>
            <div style={{ marginTop: 4 }}>
              {data.breakdown.length === 0 ? (
                <p className="t-secondary" style={{ marginTop: 8 }}>
                  Nothing has been billed this month yet.
                </p>
              ) : (
                data.breakdown.map((row) => (
                  <div key={`${row.service}-${row.region}`} className="row" style={{ gap: 12 }}>
                    <span className="t-data" style={{ minWidth: 84, color: "var(--color-text)" }}>
                      {formatUsdWhole(row.micros)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="t-title" style={{ display: "block" }}>
                        {row.service}
                      </span>
                      <span className="t-secondary">{row.region}</span>
                    </span>
                    <span className="t-data" style={{ color: "var(--color-text-3)" }}>
                      {Math.round(row.share * 100)}%
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* The open-anomaly rail: flares first, dollar-ranked. */}
        <div style={{ minWidth: 0 }}>
          <section style={{ marginTop: 32 }}>
            <h2 className="t-label" style={{ marginBottom: 12 }}>
              {openCount > 0
                ? `${openCount} open anomal${openCount === 1 ? "y" : "ies"}`
                : "No open anomalies"}
            </h2>
            {cards.length === 0 ? (
              <p className="t-secondary" style={{ margin: 0 }}>
                Every service is inside its baseline. The watch is running — you
                will hear from it in Slack before you see it here.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                {cards.map((card) => (
                  <AnomalyCard key={card.id} data={card} nowMs={now.getTime()} canAck />
                ))}
              </div>
            )}
          </section>

          <section style={{ marginTop: 32 }}>
            <Link className="btn btn-secondary btn-full" href="/budgets">
              <IconTarget size={18} />
              Budgets and burn rate
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}
