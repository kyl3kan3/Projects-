import type { Metadata } from "next";
import Link from "next/link";
import { DealLine } from "@/components/DealLine";
import { DealStatusPlacard, Placard } from "@/components/Placard";
import { IconPlus } from "@/components/icons";
import { requireSession } from "@/lib/auth";
import { formatDollars } from "@/lib/commissions";
import { formatShort, relativeDays } from "@/lib/dates";
import { atRiskRail, loadPipeline, DEAL_STATUS_ORDER } from "@/lib/deals";
import { isReadOnly } from "@/lib/plans";
import type { DealStatus } from "@/db/schema";

export const metadata: Metadata = { title: "Pipeline" };

const FILTERS = [
  { key: "open", label: "Open", statuses: ["active", "pending_items", "clear_to_close"] as DealStatus[] },
  { key: "all", label: "All", statuses: [...DEAL_STATUS_ORDER] },
  { key: "closed", label: "Closed", statuses: ["closed", "terminated"] as DealStatus[] },
] as const;

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { account } = await requireSession();
  const params = await searchParams;
  const filter = FILTERS.find((f) => f.key === params.show) ?? FILTERS[0];
  const [{ today, rows }, rail] = await Promise.all([
    loadPipeline(account.id, account.timezone, { statuses: filter.statuses }),
    atRiskRail(account.id, account.timezone),
  ]);
  const readOnly = isReadOnly(account);

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-6 lg:pb-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="t-label">Today · {formatShort(today)}</p>
          <h1 className="t-display mt-1">The wall of timelines.</h1>
        </div>
        {readOnly ? null : (
          <Link href="/deals/new" className="btn btn-primary">
            <IconPlus size={18} />
            Open a file
          </Link>
        )}
      </header>

      {rail.items.length > 0 ? (
        <section className="mt-8">
          <h2 className="t-label">At risk this week</h2>
          <ul className="mt-2 list-none p-0">
            {rail.items.slice(0, 8).map((item) => (
              <li key={`${item.dealId}-${item.date.id}`}>
                <Link href={`/deals/${item.dealId}`} className="row">
                  <span className="t-mono w-16 shrink-0" style={{ color: "var(--color-keybox)" }}>
                    {formatShort(item.date.dueOn)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="t-title block truncate">{item.date.label}</span>
                    <span className="t-secondary block truncate">{item.address}</span>
                  </span>
                  <Placard tone="keybox">
                    {item.date.status === "missed" ? "MISSED" : relativeDays(today, item.date.dueOn)}
                  </Placard>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <nav className="chip-row mt-8" aria-label="Filter files">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "open" ? "/deals" : `/deals?show=${f.key}`}
            className="chip"
            data-active={f.key === filter.key ? "true" : "false"}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <section className="mt-10 panel p-6">
          <h2 className="t-h2">
            {filter.key === "open" ? "Open your first file." : "Nothing filed here yet."}
          </h2>
          <p className="t-body mt-2 text-dim">
            {filter.key === "open"
              ? "Pick the buyer-side template, enter the contract date, and eleven deadlines compute themselves before you finish reading this sentence."
              : "Closed and terminated files land here and stop counting against your plan."}
          </p>
          {filter.key === "open" && !readOnly ? (
            <Link href="/deals/new" className="btn btn-primary mt-5">
              Open a file
            </Link>
          ) : null}
        </section>
      ) : (
        <ul className="mt-6 list-none p-0">
          {rows.map((row) => (
            <li key={row.deal.id} className="hairline-b py-5">
              <Link href={`/deals/${row.deal.id}`} className="block no-underline">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="t-title text-ink">{row.deal.address}</span>
                  <DealStatusPlacard status={row.deal.status} />
                </div>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="t-secondary">
                    {row.nextDate ? (
                      <>
                        Next: <span className="t-mono">{formatShort(row.nextDate.dueOn)}</span>{" "}
                        {row.nextDate.label} · {relativeDays(today, row.nextDate.dueOn)}
                      </>
                    ) : (
                      "No dates left on this file"
                    )}
                  </span>
                  {row.missed.length > 0 ? (
                    <Placard tone="keybox">
                      {row.missed.length} missed
                    </Placard>
                  ) : null}
                  {row.deal.priceCents ? (
                    <span className="t-mono text-dim">{formatDollars(row.deal.priceCents)}</span>
                  ) : null}
                </div>
                <div className="dealline-scroll mt-3">
                  <DealLine
                    dates={row.dates.map((d) => ({
                      key: d.id,
                      label: d.label,
                      dueOn: d.dueOn,
                      status: d.status,
                    }))}
                    today={today}
                    compact
                    width={640}
                    emptyNote="No computed dates — this file is waiting on an anchor date."
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
