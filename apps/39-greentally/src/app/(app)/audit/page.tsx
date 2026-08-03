import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/auth";
import { describeAudit, recentAudit } from "@/lib/audit";
import { IconThread } from "@/components/icons";

export const metadata: Metadata = { title: "Audit trail" };
export const dynamic = "force-dynamic";

/**
 * The audit trail — README's trust feature, rendered plainly.
 *
 * Every entry names the figure it moved, not just the table it touched. "Accepted March
 * electricity — 4,182 kWh" answers a procurement analyst's question; "document updated"
 * does not.
 */
export default async function AuditPage() {
  const { org } = await requireOnboarded();
  const entries = await recentAudit(org.id, 200);

  return (
    <main className="screen pt-5">
      <h1 className="t-h2">Audit trail</h1>
      <p className="t-secondary mt-1" style={{ maxWidth: "52ch" }}>
        Every extraction, confirmation, classification, recomputation and report render, in
        order. Append-only — nothing in the product edits or deletes a line of it.
      </p>

      {entries.length === 0 ? (
        <p className="t-secondary mt-6">Nothing recorded yet.</p>
      ) : (
        <div className="mt-6">
          {entries.map((e) => (
            <div key={e.id} className="row-plain">
              <div className="flex items-start gap-3">
                <span style={{ color: "var(--color-fg-2)", marginTop: 2 }}>
                  <IconThread size={16} />
                </span>
                <div className="min-w-0">
                  <p className="t-body" style={{ maxWidth: "58ch" }}>
                    {describeAudit(e)}
                  </p>
                  <p className="t-data mt-1" style={{ color: "var(--color-fg-2)" }}>
                    {e.createdAt.toISOString().replace("T", " ").slice(0, 19)}Z ·{" "}
                    {e.actorLabel || (e.actor === "system" ? "GreenTally" : "you")}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="t-secondary mt-8" style={{ maxWidth: "52ch" }}>
        Showing the most recent 200 entries. The full trail is retained for as long as the
        reporting period exists and is available on request.
      </p>
    </main>
  );
}
