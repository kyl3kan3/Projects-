import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { healthFor, listConnections } from "@/lib/connections";
import { latestDrillFor } from "@/lib/drills";
import { overduePolicies } from "@/lib/scheduler";
import { DatabaseRow } from "@/components/DatabaseRow";
import { Pipeline } from "@/components/Pipeline";
import { IconAlertTriangle, IconPlus } from "@/components/icons";
import { formatBytes, plural, timeUntil } from "@/lib/format";
import { databasesLabel, plan } from "@/lib/plans";
import type { Stage } from "@/db/schema";

export const metadata: Metadata = { title: "Vault" };
// An insurance product's dashboard must be current every time it is opened.
export const dynamic = "force-dynamic";

export default async function VaultPage() {
  const { org } = await requireUser();
  const connections = await listConnections(org.id);
  const health = await Promise.all(connections.map((connection) => healthFor(connection)));
  const drills = await Promise.all(connections.map((c) => latestDrillFor(c.id)));
  const overdue = await overduePolicies(org.id);
  const limits = plan(org.plan);

  const week = Date.now() - 7 * 86_400_000;
  const verifiedThisWeek = health.filter(
    (h, i) =>
      (h.lastSnapshotAt ? h.lastSnapshotAt.getTime() > week : false) ||
      (drills[i]?.status === "passed" && drills[i]!.createdAt.getTime() > week),
  ).length;

  const failing = health.filter((h) => h.lastFailure);
  const running = health.find((h) => h.runningJob);
  const storedBytes = health.reduce((sum, h) => sum + h.storedBytes, 0);

  const headline = failing.length
    ? failing.length === 1
      ? "One database is not backed up."
      : `${failing.length} databases are not backed up.`
    : connections.length === 0
      ? "Nothing protected yet."
      : verifiedThisWeek === connections.length
        ? `${connections.length} of ${connections.length} databases verified this week.`
        : `${verifiedThisWeek} of ${connections.length} databases verified this week.`;

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <p className="t-label">Coverage</p>
        <h1
          className="t-h2 mt-2"
          style={{ color: failing.length ? "var(--color-torch)" : undefined }}
        >
          {headline}
        </h1>
        <p className="t-secondary mt-1">
          {connections.length} of {databasesLabel(limits)} databases on {limits.name}
          {storedBytes ? ` · ${formatBytes(storedBytes)} encrypted offsite` : ""}
        </p>
      </header>

      {overdue.length ? (
        <section
          className="panel mb-6 flex items-start gap-3 p-4"
          style={{ borderColor: "color-mix(in srgb, var(--color-torch) 40%, transparent)" }}
          role="alert"
        >
          <span style={{ color: "var(--color-torch)", marginTop: 2 }}>
            <IconAlertTriangle size={18} />
          </span>
          <div>
            <p className="t-title">{plural(overdue.length, "schedule")} overdue</p>
            <p className="t-secondary mt-1">
              A slot passed more than 15 minutes ago without running. An alert has been sent to your
              organization address; the schedule advances to its next slot rather than replaying.
            </p>
          </div>
        </section>
      ) : null}

      {connections.length === 0 ? (
        <EmptyState />
      ) : (
        <section>
          {health.map((h) => (
            <div key={h.connection.id}>
              <DatabaseRow health={h} />
              {h.runningJob ? (
                <div className="pb-2">
                  <Pipeline stage={h.runningJob.stage as Stage} state="running" />
                </div>
              ) : null}
            </div>
          ))}
        </section>
      )}

      {connections.length ? (
        <section className="mt-8">
          <p className="t-label mb-3">Next runs</p>
          <div className="scroll-x">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="t-label hairline-b py-2 text-left font-semibold">Database</th>
                  <th className="t-label hairline-b py-2 text-left font-semibold">Schedule</th>
                  <th className="t-label hairline-b py-2 text-left font-semibold">Next</th>
                  <th className="t-label hairline-b py-2 text-right font-semibold">Kept</th>
                </tr>
              </thead>
              <tbody>
                {health.map((h) => (
                  <tr key={h.connection.id}>
                    <td className="hairline-b py-3 pr-4">
                      <span className="t-title">{h.connection.name}</span>
                    </td>
                    <td className="t-data hairline-b py-3 pr-4" style={{ color: "var(--color-text-2)" }}>
                      {h.policy ? `${h.policy.frequency} · ${h.policy.scheduleCron}` : "none"}
                    </td>
                    <td className="t-data hairline-b py-3 pr-4" style={{ color: "var(--color-text-2)" }}>
                      {h.policy?.enabled ? timeUntil(h.policy.nextRunAt) : "paused"}
                    </td>
                    <td className="t-data hairline-b py-3 text-right" style={{ color: "var(--color-text-2)" }}>
                      {h.snapshotCount} · {formatBytes(h.storedBytes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="thumb-cta">
        {connections.length === 0 ? (
          <Link href="/vault/new" className="btn btn-primary btn-full no-underline">
            <IconPlus size={18} />
            Connect a database
          </Link>
        ) : running ? (
          <div className="panel flex h-12 items-center justify-center px-4">
            <span className="t-data" style={{ color: "var(--color-brass)" }}>
              backing up {running.connection.name} · {running.runningJob?.stage}
            </span>
          </div>
        ) : (
          <Link href="/vault/new" className="btn btn-primary btn-full no-underline">
            <IconPlus size={18} />
            Connect a database
          </Link>
        )}
      </div>
    </main>
  );
}

/**
 * The empty state: a plain-language promise and the primary action in the thumb
 * zone. The examples are real provider shapes, not grey placeholder bars.
 */
function EmptyState() {
  return (
    <section className="panel p-5">
      <p className="t-title">Paste a connection string. Everything after that is automatic.</p>
      <p className="t-secondary mt-2">
        VaultBack takes an encrypted snapshot on your schedule, streams it straight to storage
        without ever writing it to a disk, prunes what is past your retention window, and — on
        Startup and above — restores a snapshot into a scratch database on a schedule to prove it
        works.
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {[
          { name: "Supabase", detail: "db.<ref>.supabase.co:5432/postgres — use the direct endpoint" },
          { name: "Neon", detail: "ep-<name>.<region>.aws.neon.tech/neondb" },
          { name: "Railway", detail: "monorail.proxy.rlwy.net:<port>/railway" },
          { name: "Anything else", detail: "Any Postgres 12+ reachable over TLS" },
        ].map((example) => (
          <li key={example.name} className="hairline-t pt-3">
            <p className="t-title">{example.name}</p>
            <p className="t-data mt-2" style={{ color: "var(--color-text-3)" }}>
              {example.detail}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
