import type { Metadata } from "next";
import Link from "next/link";
import { ScreenHeader } from "@/components/ScreenHeader";
import { StatusPill } from "@/components/StatusPill";
import { IconChevronRight, IconMic } from "@/components/icons";
import { requireOnboardedUser } from "@/lib/auth";
import { clockTime, proposalPill, proposalState, shortDate, timeAgo } from "@/lib/display";
import { formatMoney } from "@/lib/money";
import { listProposals } from "@/lib/proposals";

export const metadata: Metadata = { title: "Proposals" };
export const dynamic = "force-dynamic";

export default async function ProposalsPage() {
  const { org } = await requireOnboardedUser();
  const rows = await listProposals(org.id);

  const awaiting = rows.filter((row) => {
    const state = proposalState(row.proposal);
    return state === "sent" || state === "viewed";
  });
  const closed = rows.filter((row) => {
    const state = proposalState(row.proposal);
    return state === "accepted" || state === "deposit_paid";
  });

  return (
    <main>
      <ScreenHeader
        title="Proposals"
        meta={`${awaiting.length} awaiting · ${closed.length} accepted`}
      />

      {rows.length ? (
        <section className="gutter">
          {rows.map((row, index) => {
            const state = proposalState(row.proposal);
            return (
              <Link
                key={row.proposal.id}
                href={`/proposals/${row.proposal.id}`}
                className="row type-in"
                style={{ animationDelay: `${Math.min(index, 8) * 24}ms` }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="t-title" style={{ display: "block" }}>
                    {row.job.customerName}
                  </span>
                  <span
                    className="t-secondary"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 4,
                      color: "var(--color-text-3)",
                    }}
                  >
                    <StatusPill pill={proposalPill(state)} />
                    <span>
                      sent {clockTime(row.proposal.sentAt)} · {shortDate(row.proposal.sentAt)}
                      {row.proposal.firstViewedAt
                        ? ` · opened ${timeAgo(row.proposal.firstViewedAt)}`
                        : ""}
                    </span>
                  </span>
                </span>
                <span style={{ textAlign: "right", flex: "none" }}>
                  <span className="t-data amount" style={{ display: "block", fontSize: 14 }}>
                    {formatMoney(row.proposal.totalCents)}
                  </span>
                  {row.deposit?.status === "paid" ? (
                    <span className="t-data" style={{ color: "var(--color-hi-vis)" }}>
                      {formatMoney(row.deposit.amountCents)} in
                    </span>
                  ) : row.proposal.depositCents > 0 ? (
                    <span className="t-data" style={{ color: "var(--color-text-3)" }}>
                      {formatMoney(row.proposal.depositCents)} dep.
                    </span>
                  ) : null}
                </span>
                <IconChevronRight size={18} style={{ color: "var(--color-text-3)", flex: "none" }} />
              </Link>
            );
          })}
        </section>
      ) : (
        <section className="gutter">
          <p className="t-title">No proposals out yet</p>
          <p className="t-secondary" style={{ marginTop: 6, maxWidth: "42ch" }}>
            Walk a job, review the draft, and the proposal link goes to the homeowner from here. Every
            view, acceptance and deposit lands on this screen.
          </p>
        </section>
      )}

      <div className="thumb-bar">
        <Link href="/jobs/new" className="btn btn-primary btn-full">
          <IconMic size={18} />
          New walkthrough
        </Link>
      </div>
    </main>
  );
}
