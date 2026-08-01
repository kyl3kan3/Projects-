import type { Metadata } from "next";
import Link from "next/link";
import { requireShop } from "@/lib/auth";
import { ChipFilter } from "@/components/ChipFilter";
import { SkuRowItem } from "@/components/SkuRow";
import { IconClipboard } from "@/components/icons";
import { progressLine } from "@/lib/backfill";
import { billingState, capMessage } from "@/lib/billing";
import { ago, count, money, shopHandle } from "@/lib/format";
import { reorderBoard, unassignedVariantCount } from "@/lib/views";
import { ResyncButton } from "./ResyncButton";

export const metadata: Metadata = { title: "Reorder" };
/** A reorder list that is cached is a reorder list that is wrong. */
export const dynamic = "force-dynamic";

const GROUPS = [
  { key: "order_now", label: "Order now" },
  { key: "order_soon", label: "Order this week" },
  { key: "healthy", label: "Healthy" },
  { key: "overstocked", label: "Overstocked" },
  { key: "dead", label: "Dead stock" },
] as const;

export default async function ReorderPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; installed?: string; demo?: string; webhooks?: string }>;
}) {
  const { shop } = await requireShop();
  const params = await searchParams;
  const board = await reorderBoard(shop.id);
  const billing = billingState(shop);
  const cap = capMessage(shop);
  const unassigned = await unassignedVariantCount(shop.id);

  const filter = params.status && GROUPS.some((g) => g.key === params.status) ? params.status : null;
  const visible = filter ? board.rows.filter((row) => row.status === filter) : board.rows;

  return (
    <main className="screen">
      {/* Top bar: which store, and how fresh the numbers are. A stored status
          rendered without its age is how an app shows "Healthy" on a SKU that went
          dark on Tuesday. */}
      <header className="flex items-start justify-between gap-4 pt-8 pb-6">
        <div className="min-w-0">
          <p className="t-data truncate" style={{ color: "var(--color-fg-2)" }}>
            {shopHandle(shop.shopifyDomain)}
            {shop.isDemo ? " · DEMO" : ""}
          </p>
          <p className="t-data mt-1" style={{ color: "var(--color-fg-3)" }}>
            {board.runDate ? `RUN ${board.runDate} · ${ago(shop.lastRecomputeAt)}` : "NO RUN YET"}
          </p>
        </div>
        <ResyncButton label="RE-SYNC" />
      </header>

      {params.installed ? (
        <p className="panel mb-6 p-4 t-secondary" role="status">
          Connected {params.installed}. The 90-day import is running; this screen fills in as it
          lands.
          {params.webhooks === "partial"
            ? " Some webhooks did not register — check the app's scopes in your Partner dashboard."
            : ""}
        </p>
      ) : null}

      {!board.runDate ? (
        <BackfillState shop={shop} />
      ) : (
        <>
          {/* The at-risk stat block is not a card — it is the top of the page. */}
          <section className="pb-6">
            <p className="t-label">Revenue at risk · 30d</p>
            <p className="t-display mt-2" style={{ color: "var(--color-paper)" }}>
              {money(board.totals.revenueAtRiskCents, shop.currency)}
            </p>
            <p className="t-data mt-3" style={{ color: "var(--color-fg-2)" }}>
              {board.totals.pastOrderBy} SKU{board.totals.pastOrderBy === 1 ? "" : "S"} PAST
              ORDER-BY · {board.totals.dueThisWeek} DUE THIS WEEK
            </p>
            {board.totals.cashInDeadStockCents > 0 ? (
              <p className="t-data mt-1" style={{ color: "var(--color-fg-3)" }}>
                {money(board.totals.cashInDeadStockCents, shop.currency)} IN DEAD STOCK ·{" "}
                <Link href="/dead-stock">SEE IT</Link>
              </p>
            ) : null}
          </section>

          {cap ? (
            <section className="panel mb-6 p-4">
              <p className="t-title">{cap.headline}</p>
              <p className="t-secondary mt-2">{cap.detail}</p>
              <Link href="/settings/billing" className="btn-quiet mt-3 inline-flex">
                See plans
              </Link>
            </section>
          ) : null}

          {billing.trialActive && billing.trialDaysLeft !== null && billing.trialDaysLeft <= 5 ? (
            <p className="t-secondary mb-6">
              {billing.trialDaysLeft} day{billing.trialDaysLeft === 1 ? "" : "s"} left on the
              trial. <Link href="/settings/billing">Pick a plan</Link>
            </p>
          ) : null}

          {unassigned > 0 ? (
            <p className="t-secondary mb-6">
              {unassigned} tracked SKU{unassigned === 1 ? " has" : "s have"} no supplier, so{" "}
              {unassigned === 1 ? "its reorder point uses" : "their reorder points use"} the
              default lead time rather than a real one.{" "}
              <Link href="/suppliers">Assign suppliers</Link>
            </p>
          ) : null}

          <ChipFilter
            chips={[
              { value: "", label: "All", count: board.rows.length },
              { value: "order_now", label: "Order now", count: board.totals.orderNow },
              { value: "order_soon", label: "Soon", count: board.totals.orderSoon },
              { value: "healthy", label: "Healthy", count: board.totals.healthy },
              { value: "overstocked", label: "Overstocked", count: board.totals.overstocked },
              { value: "dead", label: "Dead", count: board.totals.dead },
            ]}
          />

          <div className="mt-6">
            {visible.length === 0 ? (
              <p className="t-secondary py-8">
                Nothing in this bucket right now. That is the good outcome.
              </p>
            ) : (
              GROUPS.map((group) => {
                const rows = visible.filter((row) => row.status === group.key);
                if (!rows.length) return null;
                return (
                  <section key={group.key} className="mb-8">
                    <h2 className="t-label mb-2">
                      {group.label} · {rows.length}
                    </h2>
                    <div>
                      {rows.map((row, index) => (
                        <SkuRowItem
                          key={row.variantId}
                          row={row}
                          runDate={board.runDate!}
                          index={index}
                        />
                      ))}
                    </div>
                  </section>
                );
              })
            )}
          </div>

          {board.totals.orderNow + board.totals.orderSoon > 0 ? (
            <div className="thumb-cta">
              <Link href="/po" className="btn btn-primary btn-full">
                <IconClipboard size={18} />
                Draft POs ({count(board.totals.orderNow + board.totals.orderSoon)} SKUs)
              </Link>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}

/**
 * The pre-first-forecast state. Real counts from the import, never a placeholder
 * bar and never a spinner with no number behind it.
 */
function BackfillState({
  shop,
}: {
  shop: { backfillCompletedAt: Date | null; backfillOrdersImported: number; backfillOrdersEstimated: number | null; backfillStartedAt: Date | null; isDemo: boolean };
}) {
  const done = shop.backfillCompletedAt !== null;
  return (
    <section className="panel p-5">
      <p className="t-label">{done ? "Import finished" : "Importing 90 days"}</p>
      <p className="t-display mt-3" style={{ fontSize: "clamp(28px, 7vw, 40px)" }}>
        {shop.backfillOrdersImported.toLocaleString("en-US")}
      </p>
      <p className="t-secondary mt-2">{progressLine(shop as never)}</p>
      <p className="t-secondary mt-4">
        {done
          ? "The first forecast runs on the next sync — hit RE-SYNC above and the reorder list appears."
          : "Velocity needs the order history before it can say anything honest. Hit RE-SYNC to push the import along."}
      </p>
      <ul className="mt-4">
        {[
          ["Sales velocity", "7 / 30 / 90-day windows, stockout days excluded"],
          ["Reorder points", "velocity × (supplier lead time + safety days)"],
          ["Revenue at risk", "projected missed units × price, per SKU"],
        ].map(([title, detail]) => (
          <li key={title} className="hairline-t py-3">
            <p className="t-title">{title}</p>
            <p className="t-data mt-1" style={{ color: "var(--color-fg-3)" }}>
              {detail}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
