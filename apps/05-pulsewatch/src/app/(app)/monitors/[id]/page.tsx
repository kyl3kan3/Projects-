import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { domainExpiry, sslCertificates } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getMonitor, latencyPercentiles, openIncidentsFor, pingUrl, recentLatencies } from "@/lib/monitors";
import { pingSnippets, recentPings } from "@/lib/heartbeats";
import { Sparkline } from "@/components/Sparkline";
import { StatusDot, statusWord } from "@/components/StatusDot";
import { IconPause, IconPlay, IconRefresh, IconTrash } from "@/components/icons";
import { ago, clock, durationBetween, interval, latency, until } from "@/lib/format";
import { CopyField, SnippetBlock } from "./CopyField";
import { deleteMonitorAction, pauseMonitorAction, recheckMonitorAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { team } = await requireUser();
  const monitor = await getMonitor((await params).id, team.id);
  return { title: monitor?.name ?? "Monitor" };
}

export default async function MonitorPage({ params }: { params: Promise<{ id: string }> }) {
  const { team } = await requireUser();
  const { id } = await params;
  const monitor = await getMonitor(id, team.id);
  if (!monitor) notFound();

  const db = getDb();
  const [open] = await openIncidentsFor([monitor.id]);
  const paused = monitor.status === "paused";

  const points = monitor.type === "http" ? await recentLatencies(monitor.id, 120) : [];
  const { p50, p99 } = monitor.type === "http" ? await latencyPercentiles(monitor.id) : { p50: null, p99: null };
  const pings = monitor.type === "heartbeat" ? await recentPings(monitor.id, 10) : [];

  const [cert] =
    monitor.type === "ssl"
      ? await db.select().from(sslCertificates).where(eq(sslCertificates.monitorId, monitor.id))
      : [];
  const [domain] =
    monitor.type === "domain"
      ? await db.select().from(domainExpiry).where(eq(domainExpiry.monitorId, monitor.id))
      : [];

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <Link href="/dashboard" className="btn-quiet no-underline">
          Monitors
        </Link>
        <div className="mt-4 flex items-center gap-3">
          <StatusDot status={monitor.status} />
          <h1 className="t-h2 min-w-0 flex-1 truncate">{monitor.name}</h1>
        </div>
        <p className="t-data mt-2" style={{ color: "var(--color-text-2)" }}>
          {statusWord(monitor.status)}
          {monitor.target ? ` · ${monitor.target}` : ""}
          {monitor.type === "http" ? ` · every ${interval(monitor.intervalSeconds)}` : ""}
        </p>
      </header>

      {open ? (
        <Link href={`/incidents/${open.id}`} className="incident-card mb-6 block no-underline">
          <p className="t-title">Open incident</p>
          <p className="t-data mt-1" style={{ color: "var(--color-red)" }}>
            down {durationBetween(open.startedAt)} · {open.triggerSummary}
          </p>
        </Link>
      ) : null}

      {monitor.type === "http" ? (
        <section className="mb-8">
          <p className="t-label mb-3">Response time · last {points.length} checks</p>
          <div className="panel p-4">
            <Sparkline points={points} down={monitor.status === "down"} width={280} height={64} />
            <p className="t-data mt-3" style={{ color: "var(--color-text-2)" }}>
              p50 {latency(p50)} · p99 {latency(p99)}
              {monitor.lastLatencyMs != null ? ` · last ${latency(monitor.lastLatencyMs)}` : ""}
            </p>
          </div>
          <p className="t-secondary mt-2">
            {monitor.lastCheckedAt
              ? `Checked ${ago(monitor.lastCheckedAt)} from ${monitor.regions.join(", ")}.`
              : "Waiting for the first check."}
          </p>
        </section>
      ) : null}

      {monitor.type === "heartbeat" && monitor.pingToken ? (
        <section className="mb-8 flex flex-col gap-6">
          <div>
            <CopyField label="Ping URL" value={pingUrl(monitor.pingToken)} />
            <p className="t-secondary mt-2">
              {monitor.scheduleKind === "cron"
                ? `Expected on cron ${monitor.cronExpression} (UTC), grace ${interval(monitor.graceSeconds)}.`
                : `Expected every ${interval(monitor.expectedIntervalSeconds ?? 3600)}, grace ${interval(monitor.graceSeconds)}.`}
              {" "}
              Add <code className="t-data">/fail</code> to the URL to report a failed run.
            </p>
          </div>

          <div>
            <p className="t-label mb-3">Wire it up</p>
            <SnippetBlock snippets={pingSnippets(pingUrl(monitor.pingToken))} />
          </div>

          <div>
            <p className="t-label mb-3">Recent pings</p>
            {pings.length === 0 ? (
              <p className="t-secondary">
                No pings yet. The first one will resolve the pending state.
              </p>
            ) : (
              <ul>
                {pings.map((ping) => (
                  <li key={ping.id} className="row">
                    <span
                      className="dot"
                      style={{
                        background:
                          ping.exitStatus && ping.exitStatus !== 0
                            ? "var(--color-red)"
                            : "var(--color-phosphor)",
                      }}
                    />
                    <span className="t-data flex-1">{clock(ping.receivedAt)} UTC</span>
                    <span className="t-secondary">{ago(ping.receivedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      {cert ? (
        <section className="mb-8">
          <p className="t-label mb-3">Certificate</p>
          <dl className="panel p-4">
            <Field label="Expires" value={cert.notAfter ? `${until(cert.notAfter)} · ${cert.notAfter.toISOString().slice(0, 10)}` : "unknown"} />
            <Field label="Issuer" value={cert.issuer ?? "unknown"} />
            <Field label="Subject" value={cert.subject ?? monitor.target} />
            <Field label="Scanned" value={ago(cert.lastScannedAt)} />
            {cert.lastError ? <Field label="Error" value={cert.lastError} danger /> : null}
          </dl>
        </section>
      ) : null}

      {domain ? (
        <section className="mb-8">
          <p className="t-label mb-3">Registration</p>
          <dl className="panel p-4">
            <Field label="Expires" value={domain.expiresAt ? `${until(domain.expiresAt)} · ${domain.expiresAt.toISOString().slice(0, 10)}` : "unknown"} />
            <Field label="Registrar" value={domain.registrar ?? "unknown"} />
            <Field label="Checked" value={ago(domain.lastWhoisAt)} />
            {domain.lastError ? <Field label="Error" value={domain.lastError} danger /> : null}
          </dl>
        </section>
      ) : null}

      <section className="flex flex-wrap gap-3 pb-4">
        {monitor.type !== "heartbeat" ? (
          <form action={recheckMonitorAction}>
            <input type="hidden" name="id" value={monitor.id} />
            <button className="btn btn-secondary" type="submit">
              <IconRefresh size={18} />
              Check now
            </button>
          </form>
        ) : null}

        <form action={pauseMonitorAction}>
          <input type="hidden" name="id" value={monitor.id} />
          <input type="hidden" name="paused" value={paused ? "false" : "true"} />
          <button className="btn btn-secondary" type="submit">
            {paused ? <IconPlay size={18} /> : <IconPause size={18} />}
            {paused ? "Resume" : "Pause"}
          </button>
        </form>

        <form action={deleteMonitorAction}>
          <input type="hidden" name="id" value={monitor.id} />
          <button
            className="btn btn-secondary"
            type="submit"
            style={{ color: "var(--color-red)" }}
          >
            <IconTrash size={18} />
            Delete
          </button>
        </form>
      </section>

      {monitor.type === "http" ? (
        <p className="t-secondary pb-8">
          Alerts fire after {monitor.failureThreshold} confirmed failure
          {monitor.failureThreshold === 1 ? "" : "s"}
          {monitor.regions.length > 1 ? ` across ${monitor.regions.length} regions` : ""}. Recovery
          alerts on the first good check.
          {monitor.keyword ? ` Body must contain "${monitor.keyword}".` : ""}
        </p>
      ) : null}
    </main>
  );
}

function Field({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="hairline-b flex items-baseline justify-between gap-4 py-2.5 last:border-0">
      <dt className="t-label">{label}</dt>
      <dd className="t-data text-right" style={{ color: danger ? "var(--color-red)" : undefined }}>
        {value}
      </dd>
    </div>
  );
}
