import type { Metadata } from "next";
import Link from "next/link";
import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { monitors as monitorsTable } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recentIncidents } from "@/lib/incidents";
import { durationBetween } from "@/lib/format";
import { PostIncidentForm } from "./PostIncidentForm";
import { createManualIncidentAction } from "./actions";

export const metadata: Metadata = { title: "Incidents" };
export const dynamic = "force-dynamic";

export default async function IncidentsPage() {
  const { team } = await requireUser();
  const incidents = await recentIncidents(team.id, 50);

  const monitorIds = [...new Set(incidents.map((i) => i.monitorId).filter(Boolean))] as string[];
  const db = getDb();
  const monitorRows = monitorIds.length
    ? await db
        .select({ id: monitorsTable.id, name: monitorsTable.name })
        .from(monitorsTable)
        .where(inArray(monitorsTable.id, monitorIds))
    : [];
  const names = new Map(monitorRows.map((m) => [m.id, m.name]));

  const open = incidents.filter((i) => !i.resolvedAt);
  const resolved = incidents.filter((i) => i.resolvedAt);

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <p className="t-label">Incidents</p>
        <h1 className="t-h2 mt-2">
          {open.length === 0 ? "Nothing open." : `${open.length} open.`}
        </h1>
        <p className="t-secondary mt-1">
          {resolved.length} resolved in the last {Math.min(50, incidents.length)} records
        </p>
      </header>

      {open.length ? (
        <section className="mb-8 flex flex-col gap-3">
          {open.map((incident) => (
            <Link
              key={incident.id}
              href={`/incidents/${incident.id}`}
              className="incident-card block no-underline"
              data-kind={
                incident.kind === "ssl_expiry" || incident.kind === "domain_expiry"
                  ? "advisory"
                  : undefined
              }
            >
              <p className="t-title">
                {incident.title || names.get(incident.monitorId ?? "") || "Incident"}
              </p>
              <p
                className="t-data mt-1"
                style={{
                  color:
                    incident.kind === "ssl_expiry" || incident.kind === "domain_expiry"
                      ? "var(--color-amber)"
                      : "var(--color-red)",
                }}
              >
                {incident.kind === "down" || incident.kind === "missed_heartbeat"
                  ? `down ${durationBetween(incident.startedAt)}`
                  : durationBetween(incident.startedAt) + " ago"}
                {incident.triggerSummary ? ` · ${incident.triggerSummary}` : ""}
              </p>
            </Link>
          ))}
        </section>
      ) : null}

      <section className="mb-8">
        <p className="t-label mb-3">History</p>
        {resolved.length === 0 ? (
          <p className="t-secondary">
            No resolved incidents yet. That is the correct number to have.
          </p>
        ) : (
          <ul>
            {resolved.map((incident) => (
              <li key={incident.id}>
                <Link href={`/incidents/${incident.id}`} className="row">
                  <span className="dot" style={{ background: "var(--color-trace-dim)" }} />
                  <span className="min-w-0 flex-1">
                    <span className="t-title block truncate">
                      {incident.title || names.get(incident.monitorId ?? "") || "Incident"}
                    </span>
                    <span className="t-data mt-1 block" style={{ color: "var(--color-text-2)" }}>
                      {incident.resolvedAt
                        ? `${durationBetween(incident.startedAt, incident.resolvedAt)} · ${incident.startedAt
                            .toISOString()
                            .slice(0, 16)
                            .replace("T", " ")} UTC`
                        : ""}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="pb-8">
        <p className="t-label mb-3">Post an incident manually</p>
        <p className="t-secondary mb-4">
          For anything the probes cannot see — a partial degradation, planned work, or a third-party
          outage your users are feeling. It appears on your status pages immediately.
        </p>
        <PostIncidentForm action={createManualIncidentAction} />
      </section>
    </main>
  );
}
