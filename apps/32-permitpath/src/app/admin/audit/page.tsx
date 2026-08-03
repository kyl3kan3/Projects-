import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, users } from "@/db/schema";
import { requireCurator } from "@/lib/auth";
import { longDate } from "@/lib/format";

export const metadata: Metadata = { title: "Audit" };

/**
 * Every publish, moderation decision, and billing change, newest first — the
 * ROADMAP acceptance bar, readable rather than merely stored.
 */
export default async function AuditPage() {
  await requireCurator();
  const db = getDb();

  const rows = await db
    .select({ entry: auditLog, actorEmail: users.email })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .orderBy(desc(auditLog.createdAt))
    .limit(80);

  return (
    <main className="screen screen-wide pt-6">
      <h1 className="t-h2">Audit log</h1>
      <p className="t-secondary mt-2">
        {rows.length === 0
          ? "Nothing recorded yet."
          : `Last ${rows.length} actions. Corpus publishes, moderation decisions, billing changes, and coverage requests all land here.`}
      </p>

      <ul className="mt-6">
        {rows.map(({ entry, actorEmail }) => (
          <li key={entry.id} className="row">
            <span className="min-w-0 flex-1">
              <span className="t-title block">{entry.action}</span>
              <span className="t-secondary block truncate">{entry.target}</span>
              {Object.keys(entry.metadata).length > 0 && (
                <span className="t-data mt-1 block truncate" style={{ color: "var(--color-fg-3)" }}>
                  {JSON.stringify(entry.metadata)}
                </span>
              )}
            </span>
            <span className="shrink-0 text-right">
              <span className="t-data block" style={{ color: "var(--color-fg-3)" }}>
                {longDate(entry.createdAt)}
              </span>
              <span className="t-secondary block">{actorEmail ?? entry.actor}</span>
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
