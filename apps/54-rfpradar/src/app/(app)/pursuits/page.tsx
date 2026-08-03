import type { Metadata } from "next";
import Link from "next/link";
import { requireFirm } from "@/lib/auth";
import { listPursuits, winLossReport } from "@/lib/pursuits";
import { formatCents, formatCountdown, formatDay, stageLabel } from "@/lib/format";
import { hasReporting, hasResponseWorkspace, plan } from "@/lib/plans";
import { StatusPill, stageTone, verdictTone } from "@/components/StatusPill";
import { verdictLabel } from "@/lib/scorecard";
import { BarsReport, ChevronRight, Plus } from "@/components/icons";
import { createPursuitAction } from "./actions";

export const metadata: Metadata = { title: "Pursuits" };

const STAGE_FILTERS = [
  { key: "open", label: "Open", stages: ["watching", "go_no_go", "drafting"] as const },
  { key: "submitted", label: "Submitted", stages: ["submitted"] as const },
  { key: "closed", label: "Closed", stages: ["won", "lost", "no_bid"] as const },
  { key: "all", label: "All", stages: undefined },
] as const;

/**
 * /pursuits — the response workspace's index.
 *
 * Rows, not cards: hairline-divided, each ≥56px, with the stage pill, the owner,
 * the next date, and the recorded verdict when there is one. A no-bid appears in
 * this list with the same weight as a win, because pretending otherwise is how a
 * firm ends up with a win rate of 100% and no idea why it is losing money.
 */
export default async function PursuitsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { firm, access } = await requireFirm();
  const { stage } = await searchParams;
  const filter = STAGE_FILTERS.find((f) => f.key === stage) ?? STAGE_FILTERS[0];
  const now = new Date();

  if (!hasResponseWorkspace(access.planId)) {
    const planned = plan(access.planId);
    return (
      <main className="pt-4">
        <h1 className="t-h2">Pursuits</h1>
        <div className="card p-4 mt-4">
          <p className="t-body">
            {planned.name} covers discovery: every feed, scored matches with reasons, the deadline
            calendar and the morning scan. The response workspace — pursuit stages, go/no-go
            scorecards, requirement checklists and the answer library — starts on Pursuit.
          </p>
          <Link href="/settings/billing" className="btn btn-primary w-full mt-4">
            See plans
          </Link>
        </div>
      </main>
    );
  }

  const rows = await listPursuits(firm.id, { stages: filter.stages as never });
  const report = await winLossReport(firm.id);

  return (
    <main className="pt-4">
      <div className="flex items-baseline gap-3">
        <h1 className="t-h2 flex-1">Pursuits</h1>
        {hasReporting(access.planId) && (
          <Link href="/reports" className="btn-quiet">
            <BarsReport size={18} /> Report
          </Link>
        )}
      </div>

      <p className="t-secondary mt-2">
        {report.open} open · {report.submitted} submitted · {report.won} won · {report.lost} lost ·{" "}
        {report.noBid} no-bid
        {report.winRatePercent !== null ? ` · ${report.winRatePercent}% win rate on decided bids` : ""}
      </p>

      <nav className="mt-4 flex gap-2 scroll-x" aria-label="Filter pursuits">
        {STAGE_FILTERS.map((option) => (
          <Link
            key={option.key}
            href={option.key === "open" ? "/pursuits" : `/pursuits?stage=${option.key}`}
            className="chip"
            aria-current={filter.key === option.key ? "true" : undefined}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      <section className="rows mt-4">
        {rows.map((row) => (
          <Link
            key={row.pursuit.id}
            href={`/pursuits/${row.pursuit.id}`}
            className="flex items-center gap-3 py-4"
            style={{ minHeight: 56, color: "inherit", textDecoration: "none" }}
          >
            <div className="min-w-0 flex-1">
              <p className="t-title truncate">{row.pursuit.title}</p>
              <p className="t-secondary mt-1">
                {[
                  stageLabel(row.pursuit.stage),
                  row.ownerName ?? "unassigned",
                  row.pursuit.valueCents ? formatCents(row.pursuit.valueCents) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {row.nextDueAt && (
                <p className="t-mono mt-1" style={{ color: "var(--color-ink-3)" }}>
                  next {formatDay(row.nextDueAt, firm.timezone)} ·{" "}
                  {formatCountdown(row.nextDueAt, firm.timezone, now)}
                </p>
              )}
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1">
              <StatusPill
                label={stageLabel(row.pursuit.stage)}
                tone={stageTone(row.pursuit.stage)}
              />
              {row.verdict && row.decidedAt && (
                <StatusPill label={verdictLabel(row.verdict)} tone={verdictTone(row.verdict)} />
              )}
            </div>
            <ChevronRight size={18} />
          </Link>
        ))}
        {rows.length === 0 && (
          <p className="t-secondary py-4">
            {filter.key === "open"
              ? "Nothing open. Pursue a match from the radar, or add the enterprise RFP that never hit a portal below."
              : "Nothing in this stage yet."}
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="t-label">Add a pursuit by hand</h2>
        <p className="t-secondary mt-1">
          For the enterprise RFP that arrived as an email attachment. It gets the same scorecard,
          checklist, and calendar as a portal notice.
        </p>
        <form action={createPursuitAction} className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-2">
            <span className="t-label">Title</span>
            <input
              className="input"
              name="title"
              required
              placeholder="Regional health system — managed SOC RFP"
            />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="t-label">Estimated value ($)</span>
              <input className="input" name="valueCents" inputMode="decimal" placeholder="450000" />
            </label>
            <label className="flex flex-col gap-2">
              <span className="t-label">Proposal due</span>
              <input className="input" name="proposalDueAt" placeholder="2026-04-17 17:00" />
            </label>
          </div>
          <button className="btn btn-primary w-full" type="submit">
            <Plus size={20} /> Create pursuit
          </button>
        </form>
      </section>
    </main>
  );
}
