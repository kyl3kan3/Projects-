import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ScreenHeader } from "@/components/ScreenHeader";
import { requireOnboardedUser } from "@/lib/auth";
import { describeAction, describeActor, recentAudit } from "@/lib/audit";
import { timeAgo } from "@/lib/display";

export const metadata: Metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const { org } = await requireOnboardedUser();
  const rows = await recentAudit(org.id, 200);
  const db = getDb();
  const team = await db.select().from(users).where(eq(users.organizationId, org.id));
  const names = Object.fromEntries(team.map((member) => [member.id, member.name ?? member.email]));

  return (
    <main>
      <ScreenHeader
        title="Audit log"
        meta={`${rows.length} recent actions`}
        backHref="/settings"
        backLabel="Settings"
        showSettings={false}
      />
      <section className="gutter" style={{ paddingBottom: 24 }}>
        <p className="t-secondary" style={{ maxWidth: "44ch" }}>
          Every AI draft, every edit to a drafted line, every send, acceptance and payment — with the
          model and prompt version that produced it. This is the answer to "who changed that number".
        </p>
      </section>
      <section className="gutter">
        {rows.length ? (
          rows.map((row) => (
            <div key={row.id} className="row">
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="t-title" style={{ display: "block" }}>
                  {describeAction(row.action)}
                </span>
                <span
                  className="t-secondary"
                  style={{ display: "block", marginTop: 2, color: "var(--color-text-3)" }}
                >
                  {row.target}
                </span>
                {row.metadata ? (
                  <span
                    className="t-data"
                    style={{ display: "block", marginTop: 4, color: "var(--color-text-3)", fontSize: 12 }}
                  >
                    {Object.entries(row.metadata as Record<string, unknown>)
                      .filter(([, value]) => value !== null && value !== undefined && value !== false)
                      .slice(0, 4)
                      .map(([key, value]) => `${key}: ${String(value)}`)
                      .join(" · ")}
                  </span>
                ) : null}
              </span>
              <span style={{ textAlign: "right", flex: "none" }}>
                <span className="t-data" style={{ display: "block", color: "var(--color-text-2)" }}>
                  {describeActor(row.actor, names)}
                </span>
                <span className="t-data" style={{ display: "block", color: "var(--color-text-3)" }}>
                  {timeAgo(row.createdAt)}
                </span>
              </span>
            </div>
          ))
        ) : (
          <p className="t-secondary">Nothing has happened yet.</p>
        )}
      </section>
    </main>
  );
}
