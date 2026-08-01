import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listConnections } from "@/lib/connections";
import { listSnapshotsForOrg } from "@/lib/backups";
import { recentRestores } from "@/lib/restore";
import { RestorePanel, type SnapshotSummary } from "./RestorePanel";
import { restoreAction } from "./actions";
import { ChecksumLock } from "@/components/Checksum";
import { StatusPill } from "@/components/StatusPill";
import { formatBytes, formatCount, formatDuration, formatTimestamp } from "@/lib/format";

export const metadata: Metadata = { title: "Restore" };
export const dynamic = "force-dynamic";

export default async function RestorePage({
  searchParams,
}: {
  searchParams: Promise<{ snapshot?: string }>;
}) {
  const { org } = await requireUser();
  const { snapshot: selectedId } = await searchParams;

  const [snapshots, connections, restores] = await Promise.all([
    listSnapshotsForOrg(org.id, 60),
    listConnections(org.id),
    recentRestores(org.id, 8),
  ]);

  const nameFor = (id: string) => connections.find((c) => c.id === id)?.name ?? "database";
  const fingerprintFor = (id: string) =>
    connections.find((c) => c.id === id)?.hostFingerprint ?? "unknown host";

  const selected = selectedId ? snapshots.find((s) => s.id === selectedId) : snapshots[0];

  const summary: SnapshotSummary | null = selected
    ? {
        id: selected.id,
        databaseName: nameFor(selected.databaseConnectionId),
        sourceFingerprint: fingerprintFor(selected.databaseConnectionId),
        createdAt: selected.createdAt.toISOString(),
        bytes: selected.compressedSizeBytes,
        rows: selected.manifest?.totalRows ?? 0,
        tables: selected.manifest?.tables.length ?? 0,
        sha256: selected.sha256,
      }
    : null;

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <p className="t-label">Restore</p>
        <h1 className="t-h2 mt-2">Pick a moment to go back to.</h1>
        <p className="t-secondary mt-1">
          {snapshots.length
            ? `${formatCount(snapshots.length)} snapshots available across ${formatCount(connections.length)} databases.`
            : "Nothing to restore yet — snapshots appear here as soon as the first backup finishes."}
        </p>
      </header>

      {snapshots.length === 0 ? (
        <section className="panel p-5">
          <p className="t-title">A restore needs a snapshot first.</p>
          <p className="t-secondary mt-2">
            Connect a database and the first backup runs immediately. Restores land in a database you
            create — VaultBack never writes over a live source.
          </p>
          <Link href="/vault/new" className="btn btn-primary btn-full mt-4 no-underline">
            Connect a database
          </Link>
        </section>
      ) : (
        <div className="two-pane">
          <section className="min-w-0">
            <p className="t-label mb-2">Snapshots</p>
            {snapshots.map((snapshot) => (
              <Link
                key={snapshot.id}
                href={`/restore?snapshot=${snapshot.id}`}
                className="row row-snapshot"
                data-selected={snapshot.id === selected?.id}
              >
                <span className="min-w-0 flex-1">
                  <span className="t-data block">{formatTimestamp(snapshot.createdAt)}</span>
                  <span className="t-data mt-2 block truncate" style={{ color: "var(--color-text-3)" }}>
                    {nameFor(snapshot.databaseConnectionId)} ·{" "}
                    {formatBytes(snapshot.compressedSizeBytes)} ·{" "}
                    {formatCount(snapshot.manifest?.totalRows ?? 0)} rows
                  </span>
                </span>
                <ChecksumLock sha256={snapshot.sha256} verified />
              </Link>
            ))}
          </section>

          <aside className="mt-8 min-w-0 lg:mt-0">
            {summary ? <RestorePanel snapshot={summary} action={restoreAction} /> : null}
          </aside>
        </div>
      )}

      {restores.length ? (
        <section className="mt-10">
          <p className="t-label mb-2">Restore history</p>
          <p className="t-secondary mb-3">
            Every restore is attributable: who ran it, which snapshot, and which target.
          </p>
          {restores.map((run) => (
            <div key={run.id} className="row">
              <span className="min-w-0 flex-1">
                <span className="t-data block truncate">{run.targetFingerprint}</span>
                <span className="t-data mt-2 block" style={{ color: "var(--color-text-3)" }}>
                  {formatTimestamp(run.createdAt)} · {formatCount(run.tablesRestored)} tables ·{" "}
                  {formatCount(Number(run.rowsRestored))} rows · {formatDuration(run.durationMs)}
                </span>
                {run.errorDetail ? (
                  <span className="t-secondary mt-2 block" style={{ color: "var(--color-torch)" }}>
                    {run.errorDetail}
                  </span>
                ) : null}
              </span>
              <StatusPill
                state={run.status === "succeeded" ? "verified" : run.status === "failed" ? "failed" : "running"}
                label={run.status === "succeeded" ? "Restored" : run.status}
              />
            </div>
          ))}
        </section>
      ) : null}
    </main>
  );
}
