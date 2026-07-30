import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listMonitors, openIncidentsFor, wallData } from "@/lib/monitors";
import { MonitorRow } from "@/components/MonitorRow";
import { IconPlus } from "@/components/icons";
import { plan } from "@/lib/plans";
import { durationBetween } from "@/lib/format";

export const metadata: Metadata = { title: "Monitors" };
// Set-and-forget product: the wall must be current every time it is opened.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { team } = await requireUser();
  const monitors = await listMonitors(team.id);
  const data = await wallData(monitors);
  const open = await openIncidentsFor(monitors.map((m) => m.id));

  const down = monitors.filter((m) => m.status === "down");
  const limits = plan(team.plan);

  // The header states the truth in one word, then the count backs it up.
  const headline = down.length
    ? down.length === 1
      ? "One thing is down."
      : `${down.length} things are down.`
    : monitors.length === 0
      ? "Nothing watched yet."
      : monitors.some((m) => m.status === "pending")
        ? "Getting the first reading."
        : "Steady.";

  return (
    <main className="screen">
      <header className="relative pt-8 pb-6">
        <p className="t-label">All systems</p>
        <h1 className="t-h2 mt-2" style={{ color: down.length ? "var(--color-red)" : undefined }}>
          {headline}
        </h1>
        <p className="t-secondary mt-1">
          {monitors.length} of {limits.monitors} monitors on {limits.name}
          {open.length ? ` · ${open.length} open incident${open.length === 1 ? "" : "s"}` : ""}
        </p>
      </header>

      {down.length ? (
        <section className="mb-6 flex flex-col gap-3">
          {down.map((monitor) => {
            const incident = open.find((i) => i.monitorId === monitor.id);
            return (
              <Link
                key={monitor.id}
                href={incident ? `/incidents/${incident.id}` : `/monitors/${monitor.id}`}
                className="incident-card block no-underline"
              >
                <p className="t-title">{monitor.name}</p>
                <p className="t-data mt-1" style={{ color: "var(--color-red)" }}>
                  {incident
                    ? `down ${durationBetween(incident.startedAt)} · ${incident.triggerSummary}`
                    : "down"}
                </p>
              </Link>
            );
          })}
        </section>
      ) : null}

      {monitors.length === 0 ? (
        <EmptyState />
      ) : (
        <section className="wall">
          {monitors.map((monitor) => {
            const d = data.get(monitor.id);
            return (
              <MonitorRow
                key={monitor.id}
                data={{
                  monitor,
                  points: d?.points ?? [],
                  p50: d?.p50 ?? null,
                  p99: d?.p99 ?? null,
                  expiresAt: d?.expiresAt ?? null,
                }}
              />
            );
          })}
        </section>
      )}

      <div className="thumb-cta">
        <Link href="/monitors/new" className="btn btn-primary btn-full no-underline">
          <IconPlus size={18} />
          Add monitor
        </Link>
      </div>
    </main>
  );
}

/**
 * The empty state carries real example content, never grey placeholder bars
 * (DESIGN_LANGUAGE.md: real content everywhere).
 */
function EmptyState() {
  return (
    <section className="panel p-5">
      <p className="t-title">Add the first thing you would hate to find broken.</p>
      <p className="t-secondary mt-2">
        Most people start with their production URL, then the nightly backup cron. Both take about
        twenty seconds.
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {[
          { name: "api.helvet.ico", detail: "HTTP · every 5 min · 3 regions" },
          { name: "nightly-backup", detail: "Cron heartbeat · expects a ping by 03:15 UTC" },
          { name: "shopfront.dev", detail: "TLS certificate · alerts at 30/14/7/1 days" },
        ].map((example) => (
          <li key={example.name} className="hairline-t pt-3">
            <p className="t-title">{example.name}</p>
            <p className="t-data mt-1" style={{ color: "var(--color-text-3)" }}>
              {example.detail}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
