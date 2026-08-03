import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/auth";
import { causeSentence, getAnomaly } from "@/lib/anomalies";
import { contributorTotals, dailyTotals, hourlyTotals } from "@/lib/facts";
import { granularity, plan } from "@/lib/plans";
import { addDays, addHours, dayKey, floorHour, lastNDayKeys, stampShort, stampUtc } from "@/lib/dates";
import { formatPerDay, formatUsd, formatUsdWhole } from "@/lib/money";
import { shortServiceName } from "@/lib/digest";
import { getDb } from "@/db";
import { baselines, deploys } from "@/db/schema";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { SpendChart } from "@/components/SpendChart";
import { LiveCounter } from "@/components/LiveCounter";
import { AckButton, ResolveButton } from "@/components/AnomalyActions";
import { IconArrowLeft, IconExternal } from "@/components/icons";

export const metadata: Metadata = { title: "Anomaly" };
export const dynamic = "force-dynamic";

const ZOOM_HOURS = 48;
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export default async function AnomalyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { org } = await requireOrg();
  const { id } = await params;
  const context = await getAnomaly(org.id, id);
  if (!context) notFound();

  const { anomaly, account, deploy } = context;
  const now = new Date();
  const to = floorHour(now);
  const from = addHours(to, -ZOOM_HOURS);
  // README's pricing table: hourly granularity starts on Startup. Solo sees the
  // same anomaly, at day resolution.
  const hourly = granularity(org.plan) === "hour";

  const hours = hourly ? await hourlyTotals(account.id, { from, to }) : [];
  const cells = await getDb()
    .select()
    .from(baselines)
    .where(
      and(
        eq(baselines.accountId, account.id),
        eq(baselines.service, anomaly.service),
        eq(baselines.region, anomaly.region),
      ),
    );
  const baselineByCell = new Map(cells.map((c) => [`${c.dow}:${c.hour}`, c.meanMicros]));

  // The zoom chart is the account's hourly series with this service's baseline
  // ghost drawn under it, which is what the detection actually compared. On the
  // daily plan the same window is shown one point per day.
  const dayKeys = lastNDayKeys(now, 14);
  const daily = hourly
    ? []
    : await dailyTotals([account.id], {
        from: new Date(`${dayKeys[0]}T00:00:00Z`),
        to: addDays(new Date(`${dayKeys[dayKeys.length - 1]}T00:00:00Z`), 1),
      });
  const dailyByDay = new Map(daily.map((d) => [d.day, d.micros]));
  const dailyBaseline = new Map<number, number>();
  for (const cell of cells) {
    dailyBaseline.set(cell.dow, (dailyBaseline.get(cell.dow) ?? 0) + cell.meanMicros);
  }

  const points = hourly
    ? hours.map((h) => ({
        // A 48-hour window crosses a day boundary, so the hour alone would print
        // the same label twice and mean nothing.
        label: `${DOW[h.ts.getUTCDay()]} ${String(h.ts.getUTCHours()).padStart(2, "0")}`,
        value: h.micros,
        baseline: baselineByCell.get(`${h.ts.getUTCDay()}:${h.ts.getUTCHours()}`) ?? 0,
      }))
    : dayKeys.map((day) => ({
        label: day.slice(8),
        value: dailyByDay.get(day) ?? 0,
        baseline: dailyBaseline.get(new Date(`${day}T00:00:00Z`).getUTCDay()) ?? 0,
      }));
  const onsetIndex = hourly
    ? hours.findIndex((h) => h.ts >= anomaly.startedAt)
    : dayKeys.indexOf(dayKey(anomaly.startedAt));

  const deployWindowFrom = hourly ? from : new Date(`${dayKeys[0]}T00:00:00Z`);
  const windowDeploys = await getDb()
    .select()
    .from(deploys)
    .where(
      and(eq(deploys.orgId, org.id), gte(deploys.deployedAt, deployWindowFrom), lt(deploys.deployedAt, to)),
    )
    .orderBy(desc(deploys.deployedAt))
    .limit(8);
  const pennants = (plan(org.plan).deployCorrelation ? windowDeploys : [])
    .map((d) => ({
      index: hourly
        ? hours.findIndex((h) => h.ts >= floorHour(d.deployedAt))
        : dayKeys.indexOf(dayKey(d.deployedAt)),
      sha: d.sha.slice(0, 7),
      service: d.serviceName,
      stamp: stampShort(d.deployedAt),
      href: d.commitUrl,
      correlated: d.id === anomaly.correlatedDeployId,
    }))
    .filter((p) => p.index >= 0);

  const contributors = await contributorTotals(
    account.id,
    { service: anomaly.service, region: anomaly.region, from: anomaly.startedAt, to },
    6,
  );
  const sustainedHours = Math.max(1, (to.getTime() - anomaly.startedAt.getTime()) / 3_600_000);

  return (
    <main>
      <header
        className="gutter"
        style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 12, paddingBottom: 8 }}
      >
        <Link
          href="/anomalies"
          aria-label="Back to anomalies"
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
          {account.label}
          {account.provider === "demo" ? " · DEMO DATA" : ""}
        </span>
      </header>

      <section className="gutter" style={{ paddingBottom: 16 }}>
        <p
          className={`t-label ${
            anomaly.status === "open"
              ? "state-open"
              : anomaly.status === "acked"
                ? "state-acked"
                : "state-resolved"
          }`}
        >
          {anomaly.status}
        </p>
        <h1 className="t-h2" style={{ marginTop: 8 }}>
          {shortServiceName(anomaly.service)} — {anomaly.region}
        </h1>
        <p
          className="t-display"
          style={{
            marginTop: 8,
            color: anomaly.status === "resolved" ? "var(--color-green)" : "var(--color-amber)",
          }}
        >
          {formatPerDay(anomaly.deltaPerDayMicros)}
        </p>
        <p className="t-data" style={{ color: "var(--color-text-2)", marginTop: 8 }}>
          BASELINE {formatUsdWhole(anomaly.baselinePerDayMicros)}/DAY · SINCE{" "}
          {stampUtc(anomaly.startedAt).toUpperCase()}
        </p>
        {anomaly.status === "resolved" ? (
          <p className="t-data state-resolved" style={{ marginTop: 4 }}>
            RESOLVED · {formatUsd(anomaly.excessMicros)} TOTAL EXCESS
          </p>
        ) : (
          <div style={{ marginTop: 4 }}>
            <LiveCounter
              startedAtIso={anomaly.startedAt.toISOString()}
              deltaPerDayMicros={anomaly.deltaPerDayMicros}
            />
          </div>
        )}
      </section>

      <div className="gutter" style={{ paddingBottom: 24 }}>
        <SpendChart
          ariaLabel={
            hourly
              ? `Hourly spend for ${account.label} over the last ${ZOOM_HOURS} hours, with the anomaly onset and the correlated deploy`
              : `Daily spend for ${account.label} over the last 14 days, with the day the anomaly began`
          }
          points={points}
          pennants={pennants}
          excessFromIndex={onsetIndex >= 0 ? onsetIndex : null}
          anomalyState={anomaly.status}
          caption={`${hourly ? `${ZOOM_HOURS}H` : "14 DAYS"} · ${shortServiceName(
            anomaly.service,
          )} BASELINE DASHED`}
          emptyMessage={hourly ? "No hourly data in this window." : "No daily data in this window."}
        />
        {!hourly ? (
          <p className="t-secondary" style={{ marginTop: 12 }}>
            Your plan is {plan(org.plan).name}, which shows this window a day at a
            time. Startup zooms the same anomaly to the hour and marks the deploys on
            it —{" "}
            <Link href="/settings/billing" style={{ color: "var(--color-steel)" }}>
              see plans
            </Link>
            .
          </p>
        ) : null}
      </div>

      <section className="gutter" style={{ paddingBottom: 24 }}>
        <h2 className="t-label">Probable cause</h2>
        <p className="t-body" style={{ marginTop: 8 }}>
          {causeSentence(context)}
        </p>
        {deploy ? (
          <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
            <p className="t-data" style={{ color: "var(--color-text-2)" }}>
              {deploy.sha.slice(0, 7)} · {deploy.serviceName} ·{" "}
              {stampUtc(deploy.deployedAt).toUpperCase()}
              {deploy.actor ? ` · ${deploy.actor}` : ""}
            </p>
            {deploy.commitUrl ? (
              <a
                className="t-data"
                href={deploy.commitUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--color-steel)", display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                View the commit
                <IconExternal size={16} />
              </a>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="gutter" style={{ paddingBottom: 24 }}>
        <h2 className="t-label">Contributors since onset</h2>
        <div style={{ marginTop: 4 }}>
          {contributors.length === 0 ? (
            <p className="t-secondary" style={{ marginTop: 8 }}>
              No breakdown available for this window yet.
            </p>
          ) : (
            contributors.map((row) => (
              <div key={`${row.label}-${row.detail}`} className="row">
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="t-data" style={{ display: "block", color: "var(--color-text)" }}>
                    {row.label}
                  </span>
                  <span className="t-secondary">{row.detail}</span>
                </span>
                <span className="t-data" style={{ color: "var(--color-amber)", flex: "none" }}>
                  {formatPerDay(Math.round((row.micros / sustainedHours) * 24))}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="gutter" style={{ paddingBottom: 24 }}>
        <h2 className="t-label">Action log</h2>
        <div style={{ marginTop: 4 }}>
          <div className="row" style={{ minHeight: 44 }}>
            <span className="t-data" style={{ color: "var(--color-text-2)" }}>
              DETECTED · {stampUtc(anomaly.detectedAt).toUpperCase()}
            </span>
          </div>
          {anomaly.ackedAt ? (
            <div className="row" style={{ minHeight: 44 }}>
              <span className="t-data" style={{ color: "var(--color-text-2)" }}>
                ACKED BY {(anomaly.ackedBy ?? "SOMEONE").toUpperCase()} ·{" "}
                {stampUtc(anomaly.ackedAt).toUpperCase()}
              </span>
            </div>
          ) : null}
          {anomaly.resolvedAt ? (
            <div className="row" style={{ minHeight: 44 }}>
              <span className="t-data state-resolved">
                RESOLVED · {stampUtc(anomaly.resolvedAt).toUpperCase()}
              </span>
            </div>
          ) : null}
        </div>
      </section>

      {/* Room for the thumb bar, which floats over the end of the content. */}
      {anomaly.status !== "resolved" ? <div style={{ height: 128 }} /> : null}

      {anomaly.status !== "resolved" ? (
        <div className="thumb-bar" style={{ display: "grid", gap: 8 }}>
          {anomaly.status === "open" ? <AckButton anomalyId={anomaly.id} /> : null}
          <ResolveButton anomalyId={anomaly.id} />
        </div>
      ) : null}
    </main>
  );
}
