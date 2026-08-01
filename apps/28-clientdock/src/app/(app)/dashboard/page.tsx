import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadAttentionQueue, loadPortalSummaries, listTemplates } from "@/lib/portals";
import { agoStamp, moneyShort } from "@/lib/format";
import { plan, trialExpired } from "@/lib/plans";
import { AttentionRow } from "@/components/AttentionRow";
import { Monogram } from "@/components/Monogram";
import { Sparkline } from "@/components/Sparkline";
import { SignageChip } from "@/components/SignageChip";
import { IconPlus } from "@/components/icons";

export const metadata: Metadata = { title: "Portals" };

/**
 * The money screen. "Needs attention" first, because it is the only list that
 * either earns the agency money or saves a relationship; the portal wall follows.
 */
export default async function DashboardPage() {
  const { workspace } = await requireUser();
  const summaries = await loadPortalSummaries(workspace.id);
  const queue = await loadAttentionQueue(workspace.id, summaries);
  const templates = await listTemplates(workspace.id);
  const limits = plan(workspace.plan);
  const expired = trialExpired(workspace.plan, workspace.trialEndsAt);

  return (
    <main className="screen screen-app">
      <header className="flex items-end justify-between pt-10 pb-6">
        <div>
          <p className="t-label">{workspace.name}</p>
          <h1 className="t-display mt-2">Portals</h1>
        </div>
        <Link href="/portals/new" className="btn btn-primary" style={{ height: 44 }}>
          <IconPlus size={18} />
          New
        </Link>
      </header>

      {expired ? (
        <p className="t-secondary mb-6" style={{ color: "var(--color-amber)" }}>
          Your trial ended. Portals stay exactly as they are —{" "}
          <Link href="/settings/billing" style={{ color: "var(--wl-accent)" }}>
            pick a plan
          </Link>{" "}
          to keep sending updates.
        </p>
      ) : null}

      <div className="wall">
        <section className="mb-10">
          <p className="t-label mb-2">Needs attention</p>
          {queue.length === 0 ? (
            <p className="t-secondary py-3">
              Nothing is waiting on you. Every portal has been touched this week.
            </p>
          ) : (
            <div>
              {queue.slice(0, 6).map((item, i) => (
                <AttentionRow key={`${item.kind}-${item.portalId}-${i}`} item={item} />
              ))}
              {queue.length > 6 ? (
                <Link href="/attention" className="btn-quiet mt-3 inline-block">
                  All {queue.length} items
                </Link>
              ) : null}
            </div>
          )}
        </section>

        <section>
          <p className="t-label mb-3">
            {summaries.length} of{" "}
            {limits.portals === Number.POSITIVE_INFINITY ? "unlimited" : limits.portals} portals
          </p>

          {summaries.length === 0 ? (
            <div className="card p-5">
              <p className="t-title">No portals yet.</p>
              <p className="t-secondary mt-2">
                A portal takes about four minutes: name the client, switch on the modules you
                actually use, and send one link.
              </p>
              <Link href="/portals/new" className="btn btn-primary btn-full mt-4">
                Build the first one
              </Link>
            </div>
          ) : (
            <div className="wall-cards flex flex-col gap-3">
              {summaries.map((s, i) => (
                <Link
                  key={s.portal.id}
                  href={`/portals/${s.portal.id}`}
                  className="card arrive flex items-center gap-3 p-4"
                  style={{ "--i": Math.min(i, 5) } as React.CSSProperties}
                >
                  <Monogram name={s.client?.company ?? s.portal.title} solid />
                  <span className="min-w-0 flex-1">
                    <span className="t-title block truncate">
                      {s.client?.company ?? s.portal.title}
                    </span>
                    <span className="t-data mt-1 block" style={{ color: "var(--color-ink-3)" }}>
                      LAST VIEWED {agoStamp(s.portal.lastViewedAt)}
                    </span>
                    <span className="t-secondary mt-1 block truncate">
                      {[
                        s.pendingApprovals > 0
                          ? `${s.pendingApprovals} awaiting approval`
                          : null,
                        s.unansweredClientMessages > 0
                          ? `${s.unansweredClientMessages} unanswered`
                          : null,
                        s.openInvoiceCents > 0
                          ? `${moneyShort(s.openInvoiceCents)} outstanding`
                          : null,
                        `${s.fileCount} file${s.fileCount === 1 ? "" : "s"}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-2">
                    <Sparkline values={s.viewSeries} />
                    {s.portal.status === "draft" ? (
                      <SignageChip>Draft</SignageChip>
                    ) : s.portal.status === "archived" ? (
                      <SignageChip>Archived</SignageChip>
                    ) : s.pendingApprovals > 0 ? (
                      <SignageChip tone="amber">Awaiting them</SignageChip>
                    ) : (
                      <SignageChip tone="green">Live</SignageChip>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          )}

          {templates.length > 0 ? (
            <p className="t-secondary mt-6">
              {templates.length} template{templates.length === 1 ? "" : "s"} saved —{" "}
              <Link href="/portals/new" style={{ color: "var(--wl-accent)" }}>
                duplicate one
              </Link>{" "}
              instead of starting over.
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
