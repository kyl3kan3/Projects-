/**
 * A SKU row. No box: a full-bleed hairline-divided row, 6px status dot on the
 * left, product name, the mono facts line beneath, and the order-by date on the
 * right — DESIGN.md's "SKU rows" construction, exactly.
 *
 * Server component. The only client thing on this screen is the runway and the
 * chips, and nothing here imports anything that reaches the database.
 */

import Link from "next/link";
import { IconTrend } from "@/components/icons";
import { shortDate, shortDateRelativeTo } from "@/lib/dates";
import { count, cover, money, statusTone } from "@/lib/format";
import type { SkuRow as Row } from "@/lib/views";

export function SkuRowItem({
  row,
  runDate,
  index = 0,
}: {
  row: Row;
  runDate: string;
  index?: number;
}) {
  const tone = statusTone(row.status);
  const pastDue = row.orderByDate !== null && row.orderByDate < runDate;
  const snoozed = row.snoozedUntil !== null && row.snoozedUntil > new Date();

  const facts = [
    row.sku,
    `${count(row.available)} LEFT`,
    `${cover(row.daysOfCover)} COVER`,
  ];
  if (row.status === "order_now" || row.status === "order_soon") {
    facts.push(`ORDER ${count(row.reorderQty)}`);
  }

  return (
    <Link
      href={`/reorder/${row.variantId}`}
      className="sku-row row-in"
      // 24ms stagger, capped at 8 rows so a long list does not crawl in.
      style={{ animationDelay: `${Math.min(index, 7) * 24}ms` }}
    >
      <span className={`dot dot-${tone}`} aria-hidden="true" />

      <span className="min-w-0">
        <span className="t-title block truncate">{row.displayTitle}</span>
        <span className="t-data mt-1 block" style={{ color: "var(--color-fg-2)" }}>
          {facts.join(" · ")}
        </span>
        {snoozed ? (
          <span className="t-data mt-1 block" style={{ color: "var(--color-fg-3)" }}>
            SNOOZED TO {shortDate(row.snoozedUntil!.toISOString().slice(0, 10))}
          </span>
        ) : null}
        {row.confidence === "low" ? (
          <span className="t-data mt-1 block" style={{ color: "var(--color-fg-3)" }}>
            LOW CONFIDENCE
          </span>
        ) : null}
      </span>

      <span className="flex flex-col items-end gap-1 text-right">
        <span
          className="t-data whitespace-nowrap"
          style={{ color: pastDue ? "var(--color-rust)" : "var(--color-fg-2)" }}
        >
          {row.orderByDate ? `BY ${shortDateRelativeTo(row.orderByDate, runDate)}` : "NO DATE"}
        </span>
        {/* The sweep is the animated half of the signal; the words are the other
            half, so reduced motion loses nothing. */}
        {pastDue ? (
          <span className="t-data" style={{ color: "var(--color-rust)" }}>
            PAST DUE
          </span>
        ) : null}
        {row.crossedIntoOrderNow ? (
          <>
            <span className="sweep w-14" aria-hidden="true" />
            <span className="t-data" style={{ color: "var(--color-kraft)" }}>
              NEW TODAY
            </span>
          </>
        ) : null}
        {row.revenueAtRiskCents > 0 ? (
          <span className="t-data flex items-center gap-1.5">
            <span className="dot dot-rust" style={{ marginTop: 0 }} aria-hidden="true" />
            {money(row.revenueAtRiskCents)}
          </span>
        ) : null}
        <span
          className="t-data flex items-center gap-1"
          style={{ color: "var(--color-fg-3)" }}
          title={`Velocity ${row.trend}`}
        >
          <IconTrend trend={row.trend} size={14} />
          {row.blendedVelocity.toFixed(1)}/D
        </span>
      </span>
    </Link>
  );
}
