import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import {
  commissionLines,
  formatBps,
  formatCents,
  formatDollars,
  parseCommission,
  pipelineByMonth,
} from "@/lib/commissions";
import { formatMonth, formatShort } from "@/lib/dates";
import { commissionDeals, DEAL_STATUS_LABELS } from "@/lib/deals";
import { canSeeCommissionReports } from "@/lib/plans";
import type { DealStatus } from "@/db/schema";

export const metadata: Metadata = { title: "Commissions" };

export default async function CommissionsPage() {
  const { account } = await requireSession();
  const deals = await commissionDeals(account.id);
  const gate = canSeeCommissionReports(account);
  const months = gate.allowed ? pipelineByMonth(deals) : [];
  const totals = months.reduce(
    (acc, m) => ({
      volume: acc.volume + m.volumeCents,
      gross: acc.gross + m.grossCents,
      net: acc.net + m.netCents,
      count: acc.count + m.dealCount,
    }),
    { volume: 0, gross: 0, net: 0, count: 0 },
  );

  return (
    <main className="mx-auto max-w-5xl px-5 pb-24 pt-6 lg:pb-10">
      <h1 className="t-display">Commissions.</h1>
      <p className="t-body mt-2 text-dim">
        Every number here is integer cents from the rate and the price on the file, rounded once,
        at the line. Grouped by month of expected close; terminated files are dropped and closed
        ones stay, because &ldquo;what did last month actually pay&rdquo; is the question.
      </p>

      {!gate.allowed ? (
        <section className="panel mt-8 p-6">
          <h2 className="t-h2">Pipeline totals are on Office.</h2>
          <p className="t-body mt-2 text-dim">{gate.reason}</p>
          <Link href="/settings/billing" className="btn btn-primary mt-5">
            See the plans
          </Link>
        </section>
      ) : months.length === 0 ? (
        <section className="panel mt-8 p-6">
          <h2 className="t-h2">Nothing to total yet.</h2>
          <p className="t-body mt-2 text-dim">
            A file needs a closing date and a commission rate before it can appear here. Open a
            file and the math follows.
          </p>
          <Link href="/deals/new" className="btn btn-primary mt-5">
            Open a file
          </Link>
        </section>
      ) : (
        <>
          <section className="mt-8">
            <h2 className="t-label">Expected by month of close</h2>
            <div className="table-wrap mt-2">
              <table className="ruled">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="num">Files</th>
                    <th className="num">Volume</th>
                    <th className="num">Gross</th>
                    <th className="num">After fees</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <tr key={m.month}>
                      <td>{formatMonth(m.month)}</td>
                      <td className="num">{m.dealCount}</td>
                      <td className="num">{formatDollars(m.volumeCents)}</td>
                      <td className="num">{formatDollars(m.grossCents)}</td>
                      <td className="num">{formatDollars(m.netCents)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="t-title">All months</td>
                    <td className="num">{totals.count}</td>
                    <td className="num">{formatDollars(totals.volume)}</td>
                    <td className="num">{formatDollars(totals.gross)}</td>
                    <td className="num">{formatDollars(totals.net)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-10">
            <h2 className="t-label">Per file</h2>
            <ul className="mt-2 list-none p-0">
              {deals.map((deal) => {
                const basis = parseCommission(deal.commission);
                const lines = commissionLines(deal.priceCents, basis);
                return (
                  <li key={deal.id} className="hairline-b py-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <Link href={`/deals/${deal.id}`} className="t-title text-ink">
                        {deal.address}
                      </Link>
                      <span className="t-secondary">
                        {DEAL_STATUS_LABELS[deal.status as DealStatus]}
                        {deal.closingDate ? ` · closes ${formatShort(deal.closingDate)}` : " · no closing date"}
                        {basis.rateBps ? ` · ${formatBps(basis.rateBps)}` : ""}
                      </span>
                    </div>
                    <ul className="mt-2 list-none p-0">
                      {lines.map((line, i) => (
                        <li
                          key={`${deal.id}-${i}`}
                          className="flex items-baseline justify-between gap-4 py-1"
                        >
                          <span className="t-secondary">
                            {line.label}
                            {line.detail ? ` — ${line.detail}` : ""}
                          </span>
                          {line.kind === "note" ? null : (
                            <span className="t-mono shrink-0">{formatCents(line.amountCents)}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
