import type { Metadata } from "next";
import { requireOrg } from "@/lib/auth";
import { resolveSelected } from "@/lib/accounts";
import { switcherAccounts } from "@/lib/dashboard";
import { listAnomalies, thumbnailValues } from "@/lib/anomalies";
import { leadTimeLabel } from "@/lib/anomaly";
import { formatPerDay } from "@/lib/money";
import { durationShort, stampShort } from "@/lib/dates";
import { shortServiceName } from "@/lib/digest";
import { DemoNotice, ScreenHeader } from "@/components/ScreenHeader";
import { AnomalyCard, type AnomalyCardData } from "@/components/AnomalyCard";
import { IconFlare } from "@/components/icons";
import Link from "next/link";

export const metadata: Metadata = { title: "Anomalies" };
export const dynamic = "force-dynamic";

export default async function AnomaliesPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const { org } = await requireOrg();
  const params = await searchParams;
  const { selected, accounts } = await resolveSelected(org.id, params.account);

  if (!selected) {
    return (
      <main className="gutter" style={{ paddingTop: 40 }}>
        <h1 className="t-h2">Nothing to watch yet</h1>
        <p className="t-body" style={{ color: "var(--color-text-2)", marginTop: 12 }}>
          Connect an AWS account and CloudSpend starts learning its baseline
          straight away.
        </p>
        <Link className="btn btn-primary btn-full" href="/connect" style={{ marginTop: 24 }}>
          Add account
        </Link>
      </main>
    );
  }

  const now = new Date();
  const live = await listAnomalies(org.id, { accountId: selected.id });
  const all = await listAnomalies(org.id, { accountId: selected.id, includeResolved: true });
  const history = all.filter((r) => r.anomaly.status === "resolved").slice(0, 12);
  const openCount = live.filter((r) => r.anomaly.status !== "resolved").length;

  const cards: AnomalyCardData[] = [];
  for (const row of live) {
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

  return (
    <main>
      <ScreenHeader
        accounts={switcherAccounts(accounts)}
        selectedId={selected.id}
        openAnomalies={openCount}
      />
      <DemoNotice show={selected.provider === "demo"} />

      <section className="gutter" style={{ paddingTop: 20, paddingBottom: 8 }}>
        <h1 className="t-h2">Anomalies</h1>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          A service has to stay above its seasonal baseline for four hours, and be
          worth at least $5 a day, before it appears here.
        </p>
      </section>

      <section className="gutter" style={{ display: "grid", gap: 16, paddingTop: 12 }}>
        {cards.length === 0 ? (
          <div style={{ display: "grid", gap: 12, justifyItems: "start", paddingTop: 24 }}>
            <span style={{ color: "var(--color-text-3)" }}>
              <IconFlare size={40} />
            </span>
            <p className="t-title" style={{ margin: 0 }}>
              Nothing is above its baseline.
            </p>
            <p className="t-secondary" style={{ margin: 0 }}>
              {history.length > 0
                ? `${history.length} resolved anomal${history.length === 1 ? "y is" : "ies are"} in the history below.`
                : "CloudSpend has learned a baseline for every service on this account and none of them is drifting."}
            </p>
          </div>
        ) : (
          cards.map((card) => (
            <AnomalyCard key={card.id} data={card} nowMs={now.getTime()} canAck />
          ))
        )}
      </section>

      {history.length ? (
        <section className="gutter" style={{ paddingTop: 32 }}>
          <h2 className="t-label">History</h2>
          <div style={{ marginTop: 4 }}>
            {history.map((row) => (
              <Link key={row.anomaly.id} href={`/anomalies/${row.anomaly.id}`} className="row">
                <span className="t-data state-resolved" style={{ minWidth: 84 }}>
                  {formatPerDay(row.anomaly.deltaPerDayMicros)}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="t-title" style={{ display: "block" }}>
                    {shortServiceName(row.anomaly.service)} — {row.anomaly.region}
                  </span>
                  <span className="t-secondary">
                    {stampShort(row.anomaly.startedAt)} · lasted{" "}
                    {durationShort(
                      row.anomaly.startedAt.getTime(),
                      (row.anomaly.resolvedAt ?? now).getTime(),
                    )}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
