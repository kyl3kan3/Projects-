import type { Metadata } from "next";
import Link from "next/link";
import { requireShop } from "@/lib/auth";
import { SnoozeForm } from "../reorder/[variantId]/SnoozeForm";
import { suggestedAction } from "@/lib/deadstock";
import { shortDate } from "@/lib/dates";
import { count, cover, money, moneyExact } from "@/lib/format";
import { deadStockBoard } from "@/lib/views";

export const metadata: Metadata = { title: "Dead stock" };
export const dynamic = "force-dynamic";

/**
 * The dead-stock report — "cash buried on the shelf".
 *
 * Ranked by cash tied up rather than by days of cover, because the merchant's
 * question is where their money is, not what is slowest. Rows whose cost is an
 * estimate say so on the row; a number presented as fact when it is a guess is worse
 * than no number.
 */
export default async function DeadStockPage() {
  const { shop } = await requireShop();
  const board = await deadStockBoard(shop.id);

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <h1 className="t-label">Cash sitting on the shelf</h1>
        <p className="t-display mt-2" style={{ color: "var(--color-paper)" }}>
          {money(board.totalCents, shop.currency)}
        </p>
        <p className="t-data mt-3" style={{ color: "var(--color-fg-2)" }}>
          {board.rows.length} SKU{board.rows.length === 1 ? "" : "S"} OVER COVER
          {board.snoozedCount ? ` · ${board.snoozedCount} SNOOZED, EXCLUDED` : ""}
        </p>
        {board.runDate ? (
          <p className="t-data mt-1" style={{ color: "var(--color-fg-3)" }}>
            RUN {board.runDate}
          </p>
        ) : null}
      </header>

      {!board.runDate ? (
        <p className="t-secondary">
          No forecast has run yet. <Link href="/reorder">Start the import</Link> and this fills in
          on the first run.
        </p>
      ) : board.rows.length === 0 ? (
        <section className="panel p-5">
          <p className="t-title">Nothing is sitting still.</p>
          <p className="t-secondary mt-2">
            Every tracked SKU is inside its cover thresholds — under{" "}
            {shop.settings.overstockCoverDays ?? 60} days for the fast movers and under{" "}
            {shop.settings.deadCoverDays ?? 120} for everything else. This report is worth
            re-reading at the start of each month; the digest arrives then too.
          </p>
        </section>
      ) : (
        <div>
          {board.rows.map((row, index) => (
            <article
              key={row.variantId}
              className="hairline-b py-4 row-in"
              style={{ animationDelay: `${Math.min(index, 7) * 24}ms` }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Link href={`/reorder/${row.variantId}`} className="t-title block truncate" style={{ color: "var(--color-fg)" }}>
                    {row.displayTitle}
                  </Link>
                  <p className="t-data mt-1" style={{ color: "var(--color-fg-2)" }}>
                    {row.sku} · {count(row.units)} UNITS · {cover(row.daysOfCover)} COVER
                  </p>
                  <p className="t-data mt-1" style={{ color: "var(--color-fg-3)" }}>
                    {row.lastSaleOn ? `LAST SOLD ${shortDate(row.lastSaleOn)}` : "NEVER SOLD"} ·{" "}
                    {row.trend.toUpperCase()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="t-data" style={{ fontSize: 15 }}>
                    {moneyExact(row.cashTiedUpCents, shop.currency)}
                  </p>
                  {row.costMissing ? (
                    <p className="t-data mt-1" style={{ color: "var(--color-fg-3)" }}>
                      COST ESTIMATED
                    </p>
                  ) : null}
                </div>
              </div>
              <p className="t-secondary mt-3">{suggestedAction(row)}</p>
              <div className="mt-3 flex items-center gap-4">
                <Link href={`/reorder/${row.variantId}`} className="btn-quiet">
                  See the math
                </Link>
                <div className="min-w-[160px]">
                  <SnoozeForm variantId={row.variantId} days={30} />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
