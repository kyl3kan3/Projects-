import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { describeAudit, recentAudit } from "@/lib/audit";
import { formatTimestamp } from "@/lib/format";

export const metadata: Metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

/** Actions whose colour carries meaning; everything else is quiet. */
const TONE: Record<string, string> = {
  "backup.failed": "var(--color-torch)",
  "backup.missed": "var(--color-torch)",
  "drill.failed": "var(--color-torch)",
  "restore.failed": "var(--color-torch)",
  "restore.executed": "var(--color-brass)",
  "drill.passed": "var(--color-seal)",
  "backup.succeeded": "var(--color-seal)",
};

export default async function ActivityPage() {
  const { org } = await requireUser();
  const entries = await recentAudit(org.id, 100);

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <Link href="/settings" className="btn-quiet no-underline">
          Settings
        </Link>
        <h1 className="t-h2 mt-3">Audit log</h1>
        <p className="t-secondary mt-1">
          Append-only. Every backup, restore, drill and settings change, with whoever caused it —
          system events have no actor by design.
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="t-secondary">
          Nothing has happened yet. The first entry appears when you connect a database.
        </p>
      ) : (
        <section>
          {entries.map((entry) => (
            <div key={entry.id} className="row">
              <span className="min-w-0 flex-1">
                <span className="t-title block" style={{ color: TONE[entry.action] ?? undefined }}>
                  {describeAudit(entry)}
                </span>
                <span className="t-data mt-1.5 block truncate" style={{ color: "var(--color-text-3)" }}>
                  {formatTimestamp(entry.createdAt)} · {entry.action}
                  {entry.actorUserId ? "" : " · system"}
                </span>
                {typeof entry.metadata?.detail === "string" ? (
                  <span className="t-secondary mt-1.5 block">{entry.metadata.detail}</span>
                ) : null}
                {typeof entry.metadata?.sha256 === "string" ? (
                  <span className="t-data mt-1.5 block" style={{ color: "var(--color-text-3)" }}>
                    sha256:{String(entry.metadata.sha256).slice(0, 16)}…
                  </span>
                ) : null}
              </span>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
