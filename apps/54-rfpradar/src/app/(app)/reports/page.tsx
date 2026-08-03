import type { Metadata } from "next";
import Link from "next/link";
import { requireFirm } from "@/lib/auth";
import { hasReporting, plan } from "@/lib/plans";
import { listPursuits, winLossReport } from "@/lib/pursuits";
import { dismissReasonCounts } from "@/lib/matching";
import { formatCents, formatDayYear, stageLabel } from "@/lib/format";
import { StatusPill, stageTone } from "@/components/StatusPill";

export const metadata: Metadata = { title: "Win/loss" };

/**
 * /reports — the honest denominator.
 *
 * Win rate here is wins over *decided bids*, and bid rate is bids over all
 * decisions including no-bids. Both numbers are stated with their arithmetic,
 * because a single "win rate" figure that quietly excludes the pursuits a firm
 * declined is the number that makes proposal economics unmanageable.
 */
export default async function ReportsPage() {
  const { firm, access } = await requireFirm();

  if (!hasReporting(access.planId)) {
    return (
      <main className="pt-4">
        <h1 className="t-h2">Win/loss</h1>
        <div className="card p-4 mt-4">
          <p className="t-body">
            Win/loss records and reporting are included on Capture. {plan(access.planId).name} records
            outcomes on each pursuit; the roll-up is the upgrade.
          </p>
          <Link href="/settings/billing" className="btn btn-primary w-full mt-4">
            See plans
          </Link>
        </div>
      </main>
    );
  }

  const [report, closed, reasons] = await Promise.all([
    winLossReport(firm.id),
    listPursuits(firm.id, { stages: ["won", "lost", "no_bid"] }),
    dismissReasonCounts(firm.id),
  ]);

  const decided = report.won + report.lost;
  const decisions = decided + report.noBid;

  return (
    <main className="pt-4">
      <h1 className="t-h2">Win/loss</h1>
      <p className="t-secondary mt-2">
        Every closed pursuit counts, including the ones you declined. That is the point.
      </p>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <p className="t-label">Win rate on decided bids</p>
          <p className="t-stat mt-2">
            {report.winRatePercent === null ? "—" : `${report.winRatePercent}%`}
          </p>
          <p className="t-secondary mt-2">
            {decided === 0
              ? "No bids decided yet."
              : `${report.won} won of ${decided} decided (${report.won} + ${report.lost}).`}
          </p>
        </div>
        <div className="card p-4">
          <p className="t-label">Bid rate</p>
          <p className="t-stat mt-2">
            {report.bidRatePercent === null ? "—" : `${report.bidRatePercent}%`}
          </p>
          <p className="t-secondary mt-2">
            {decisions === 0
              ? "No decisions recorded yet."
              : `${decided} bid of ${decisions} decisions — ${report.noBid} no-bid${report.noBid === 1 ? "" : "s"} recorded rather than quietly dropped.`}
          </p>
        </div>
      </section>

      <section className="mt-6 rows">
        <div className="py-3 flex items-center gap-3">
          <span className="t-body flex-1">Won value</span>
          <span className="t-mono">{formatCents(report.wonValueCents)}</span>
        </div>
        <div className="py-3 flex items-center gap-3">
          <span className="t-body flex-1">Lost value</span>
          <span className="t-mono">{formatCents(report.lostValueCents)}</span>
        </div>
        <div className="py-3 flex items-center gap-3">
          <span className="t-body flex-1">Open and submitted</span>
          <span className="t-mono">
            {report.open} open · {report.submitted} submitted
          </span>
        </div>
      </section>

      {report.noBidReasons.length > 0 && (
        <section className="mt-8">
          <h2 className="t-label">Why we said no</h2>
          <div className="rows mt-1">
            {report.noBidReasons.map((row) => (
              <div key={row.reason} className="py-3 flex items-start gap-3">
                <span className="t-secondary flex-1" style={{ color: "var(--color-ink)" }}>
                  {row.reason}
                </span>
                <span className="t-mono">{row.count}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {reasons.length > 0 && (
        <section className="mt-8">
          <h2 className="t-label">Why matches were dismissed before a pursuit</h2>
          <div className="rows mt-1">
            {reasons.map((row) => (
              <div key={row.reason} className="py-3 flex items-center gap-3">
                <span className="t-body flex-1">{row.reason}</span>
                <span className="t-mono">{row.count}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="t-label">Closed pursuits</h2>
        <div className="rows mt-1">
          {closed.map((row) => (
            <Link
              key={row.pursuit.id}
              href={`/pursuits/${row.pursuit.id}`}
              className="py-3 flex items-center gap-3"
              style={{ minHeight: 56, color: "inherit", textDecoration: "none" }}
            >
              <div className="min-w-0 flex-1">
                <p className="t-title truncate">{row.pursuit.title}</p>
                <p className="t-mono mt-1" style={{ color: "var(--color-ink-3)" }}>
                  {[
                    row.pursuit.closedAt ? formatDayYear(row.pursuit.closedAt, firm.timezone) : null,
                    row.pursuit.valueCents ? formatCents(row.pursuit.valueCents) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <StatusPill label={stageLabel(row.pursuit.stage)} tone={stageTone(row.pursuit.stage)} />
            </Link>
          ))}
          {closed.length === 0 && (
            <p className="t-secondary py-3">Nothing closed yet — the denominator starts here.</p>
          )}
        </div>
      </section>
    </main>
  );
}
