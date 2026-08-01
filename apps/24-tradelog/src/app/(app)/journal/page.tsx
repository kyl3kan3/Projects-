import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listSetups, listTrades } from "@/lib/trades";
import { displaySymbol } from "@/lib/instruments";
import { formatCents, formatQty, formatR } from "@/lib/money";
import { formatHold, zonedClock, zonedDateKey } from "@/lib/tz";
import { groupLegs } from "@/lib/legs";
import { plan } from "@/lib/plans";
import { pnlClass } from "@/components/Money";
import { IconArrowRight, IconImport, IconTag } from "@/components/icons";

export const metadata: Metadata = { title: "Journal" };
export const dynamic = "force-dynamic";

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await requireUser();
  const { filter } = await searchParams;
  const status = filter === "open" ? "open" : filter === "closed" ? "closed" : undefined;

  const [rows, setups] = await Promise.all([
    listTrades(user.id, { status, limit: 300 }),
    listSetups(user.id),
  ]);
  const limits = plan(user.plan);

  // Option legs put on together are shown as one strategy above their rows.
  const groups = groupLegs(
    rows.map((t) => ({
      id: t.id,
      symbol: t.symbol,
      assetClass: t.assetClass,
      direction: t.direction,
      openedAt: t.openedAt,
    })),
  );
  const strategyByTradeId = new Map<string, string>();
  for (const group of groups) {
    if (group.legs.length > 1) {
      for (const leg of group.legs) strategyByTradeId.set(leg.id, group.strategy);
    }
  }
  const byId = new Map(rows.map((t) => [t.id, t]));

  return (
    <main className="screen">
      <header className="pt-8 pb-4">
        <h1 className="t-h2">Journal</h1>
        <p className="t-secondary mt-1">
          {rows.length} {rows.length === 1 ? "trade" : "trades"}, newest first. Every row is the
          round trip, not the fill.
        </p>
      </header>

      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Filter trades">
        {[
          { key: undefined, label: "All" },
          { key: "closed", label: "Closed" },
          { key: "open", label: "Open" },
        ].map((option) => (
          <Link
            key={option.label}
            href={option.key ? `/journal?filter=${option.key}` : "/journal"}
            className="chip no-underline"
            data-active={status === option.key}
          >
            {option.label}
          </Link>
        ))}
        {limits.setups ? (
          <Link href="/journal/setups" className="chip no-underline">
            <IconTag size={14} />
            Playbook · {setups.length}
          </Link>
        ) : null}
      </nav>

      {rows.length === 0 ? (
        <EmptyJournal />
      ) : (
        <ul>
          {[...new Set(rows.map((t) => zonedDateKey(t.openedAt, user.timezone)))].map((day) => {
            const dayTrades = rows.filter(
              (t) => zonedDateKey(t.openedAt, user.timezone) === day,
            );
            const dayNet = dayTrades
              .filter((t) => t.status === "closed")
              .reduce((sum, t) => sum + t.netPnlCents, 0n);
            return (
              <li key={day}>
                <div className="hairline-b flex items-baseline justify-between pt-6 pb-2">
                  <h2 className="t-label">{day}</h2>
                  <span className={`t-cell ${pnlClass(dayNet)}`}>
                    {formatCents(dayNet, { signed: true })}
                  </span>
                </div>
                <ul>
                  {dayTrades.map((trade) => {
                    const row = byId.get(trade.id)!;
                    const strategy = strategyByTradeId.get(trade.id);
                    return (
                      <li key={trade.id}>
                        <Link href={`/journal/${trade.id}`} className="row items-start">
                          <div className="min-w-0 flex-1">
                            <p className="t-cell truncate" style={{ fontSize: 14 }}>
                              {displaySymbol(row.assetClass, row.symbol)}
                            </p>
                            <p className="t-secondary mt-1">
                              {row.direction === "long" ? "Long" : "Short"} {formatQty(row.qtyMax)}
                              {" · "}
                              {zonedClock(row.openedAt, user.timezone)}
                              {row.status === "closed" && row.holdSeconds !== null
                                ? ` · held ${formatHold(row.holdSeconds)}`
                                : " · open"}
                              {strategy ? ` · ${strategy}` : ""}
                              {row.setupName ? ` · ${row.setupName}` : ""}
                            </p>
                            {row.emotionTags.length ? (
                              <p className="t-label mt-2" style={{ color: "var(--color-text-2)" }}>
                                {row.emotionTags.join(" · ")}
                              </p>
                            ) : null}
                          </div>
                          <div className="text-right">
                            <p className={`t-cell ${pnlClass(row.netPnlCents)}`} style={{ fontSize: 14 }}>
                              {row.status === "closed"
                                ? formatCents(row.netPnlCents, { signed: true })
                                : row.unrealizedPnlCents !== null
                                  ? formatCents(row.unrealizedPnlCents, { signed: true })
                                  : "—"}
                            </p>
                            <p className="t-secondary mt-1">
                              {row.status === "closed" ? formatR(row.rMultiple ?? null) : "unrealised"}
                            </p>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function EmptyJournal() {
  return (
    <section className="card p-5">
      <p className="t-finding">Nothing in the journal yet.</p>
      <p className="t-secondary mt-2">
        Import a broker export and every round trip appears here — the fills grouped under the trade
        they belong to, the P&amp;L net of commissions, the hold time measured.
      </p>
      <Link href="/import" className="btn-quiet mt-4 inline-flex items-center gap-2">
        <IconImport size={16} />
        Import a file
        <IconArrowRight size={16} />
      </Link>
    </section>
  );
}
