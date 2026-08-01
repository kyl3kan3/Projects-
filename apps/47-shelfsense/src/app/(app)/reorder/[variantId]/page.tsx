import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireShop } from "@/lib/auth";
import { Runway } from "@/components/Runway";
import { IconChevronRight, IconTrend } from "@/components/icons";
import { shortDate, shortDateRelativeTo } from "@/lib/dates";
import { count, cover, money, moneyExact, perDay, statusLabel, statusTone } from "@/lib/format";
import { skuDetail } from "@/lib/views";
import { SnoozeForm } from "./SnoozeForm";

export const metadata: Metadata = { title: "SKU" };
export const dynamic = "force-dynamic";

/**
 * The SKU detail screen: the facts, the runway, and then "the math" — every input the
 * engine used, read back from the forecast row's own `inputs` blob.
 *
 * This screen never recomputes anything. That is the point: the merchant is auditing
 * the numbers that produced the advice, not a second calculation that happens to
 * agree with it. "Honest math, shown" is a differentiator in the README, and it only
 * means something if the panel is fed by the run.
 */
export default async function SkuDetailPage({
  params,
}: {
  params: Promise<{ variantId: string }>;
}) {
  const { shop } = await requireShop();
  const { variantId } = await params;
  const detail = await skuDetail(shop.id, variantId);
  if (!detail) notFound();

  const { row, runDate } = detail;
  const inputs = row.inputs;
  const tone = statusTone(row.status);
  const pastDue = row.orderByDate !== null && row.orderByDate < runDate;
  const snoozed = row.snoozedUntil !== null && row.snoozedUntil > new Date();

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <Link href="/reorder" className="t-data" style={{ color: "var(--color-fg-3)" }}>
          ← REORDER
        </Link>
        <h1 className="t-h2 mt-4">{row.displayTitle}</h1>
        <p className="t-data mt-2" style={{ color: "var(--color-fg-2)" }}>
          {row.sku} · {count(row.available)} LEFT · {cover(row.daysOfCover)} COVER
        </p>
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="t-data flex items-center gap-1.5">
            <span className={`dot dot-${tone}`} style={{ marginTop: 0 }} aria-hidden="true" />
            {statusLabel(row.status).toUpperCase()}
          </span>
          <span className="t-data flex items-center gap-1" style={{ color: "var(--color-fg-2)" }}>
            <IconTrend trend={row.trend} size={14} />
            {row.trend.toUpperCase()}
          </span>
          <span className="t-data" style={{ color: "var(--color-fg-3)" }}>
            {row.confidence.toUpperCase()} CONFIDENCE
          </span>
          {snoozed ? (
            <span className="t-data" style={{ color: "var(--color-fg-3)" }}>
              SNOOZED TO {shortDate(row.snoozedUntil!.toISOString().slice(0, 10))}
            </span>
          ) : null}
        </p>
        {row.orderByDate ? (
          <p
            className="t-data mt-3"
            style={{ color: pastDue ? "var(--color-rust)" : "var(--color-fg-2)" }}
          >
            ORDER {count(row.reorderQty || row.reorderPoint)} BY{" "}
            {shortDateRelativeTo(row.orderByDate, runDate)}
            {pastDue ? " · PAST DUE" : ""}
          </p>
        ) : null}
      </header>

      {row.revenueAtRiskCents > 0 ? (
        <section className="pb-6">
          <p className="t-label">Revenue at risk · {inputs.leadTimeDays}d dark window</p>
          <p className="t-display mt-2" style={{ color: "var(--color-paper)" }}>
            {money(row.revenueAtRiskCents, shop.currency)}
          </p>
          <p className="t-secondary mt-2">
            If a PO goes out today it lands in {inputs.leadTimeDays} days. Stock reaches zero{" "}
            {row.stockoutDate ? `on ${row.stockoutDate}` : "already"}, so that gap is{" "}
            {money(row.revenueAtRiskCents, shop.currency)} of sales at{" "}
            {moneyExact(row.priceCents, shop.currency)} a unit.
          </p>
        </section>
      ) : null}

      <section className="hairline-t py-6">
        <h2 className="t-label mb-4">The runway</h2>
        <Runway
          available={row.available}
          blendedVelocity={row.blendedVelocity}
          reorderPoint={row.reorderPoint}
          leadTimeDays={inputs.leadTimeDays}
          safetyDays={inputs.safetyDays}
          today={runDate}
          stockoutDate={row.stockoutDate}
          orderByDate={row.orderByDate}
        />
      </section>

      {/* "The math": hairline rows exposing every input, each with its source. */}
      <section className="hairline-t py-6">
        <h2 className="t-label mb-1">The math</h2>
        <p className="t-secondary mb-4">
          Everything below is the run of {inputs.asOf}, read back from that forecast — not
          recalculated for this screen.
        </p>

        <MathRow
          label="Velocity · 7d"
          value={perDay(inputs.velocity7d)}
          source={windowSource(inputs.windows[0])}
        />
        <MathRow
          label="Velocity · 30d"
          value={perDay(inputs.velocity30d)}
          source={windowSource(inputs.windows[1])}
        />
        <MathRow
          label="Velocity · 90d"
          value={perDay(inputs.velocity90d)}
          source={windowSource(inputs.windows[2])}
        />
        <MathRow
          label="Blended velocity"
          value={perDay(inputs.blendedVelocity)}
          source={`${inputs.trend} trend · weights ${pct(inputs.weights.w7)}/${pct(inputs.weights.w30)}/${pct(inputs.weights.w90)} on 7/30/90`}
          emphasis
        />
        <MathRow
          label="Lead time"
          value={`${inputs.leadTimeDays}d`}
          source={
            inputs.leadTimeSource === "supplier"
              ? `${row.supplierName ?? "supplier"} on file`
              : "store default — no supplier assigned"
          }
        />
        <MathRow label="Safety" value={`${inputs.safetyDays}d`} source="store setting" />
        <MathRow
          label="Reorder point"
          value={`${count(row.reorderPoint)} units`}
          source={`${inputs.blendedVelocity.toFixed(2)}/day × (${inputs.leadTimeDays} + ${inputs.safetyDays})`}
          emphasis
        />
        <MathRow
          label="Days of cover"
          value={cover(row.daysOfCover)}
          source={`${count(inputs.available)} on hand ÷ ${inputs.blendedVelocity.toFixed(2)}/day`}
        />
        <MathRow
          label="Order-by date"
          value={row.orderByDate ? shortDateRelativeTo(row.orderByDate, runDate) : "—"}
          source="the day stock falls to the reorder point"
        />
        <MathRow
          label="Suggested quantity"
          value={row.reorderQty ? `${count(row.reorderQty)} units` : "—"}
          source={
            row.reorderQty
              ? `cover to ${inputs.leadTimeDays + inputs.safetyDays + inputs.coverTargetDays}d, rounded up to MOQ ${inputs.moq} and packs of ${inputs.packSize}`
              : "not due to be ordered"
          }
        />
        <MathRow
          label="Cash tied up"
          value={moneyExact(row.cashTiedUpCents, shop.currency)}
          source={
            inputs.costCents !== null && inputs.costCents > 0
              ? `${count(inputs.available)} × ${moneyExact(inputs.costCents, shop.currency)} unit cost`
              : "no unit cost on file — estimated at half the retail price"
          }
        />
        <MathRow
          label="History"
          value={`${inputs.observedDays} observed days`}
          source={`${inputs.windows[2].censoredDays} day${inputs.windows[2].censoredDays === 1 ? "" : "s"} excluded as stockouts`}
        />

        {inputs.notes.length ? (
          <ul className="mt-5 flex flex-col gap-2">
            {inputs.notes.map((note) => (
              <li key={note} className="t-secondary">
                {note}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="hairline-t py-6">
        <h2 className="t-label mb-4">Supplier</h2>
        {row.supplierName ? (
          <Link href="/suppliers" className="sku-row" style={{ borderBottom: "none" }}>
            <span className="dot dot-faint" aria-hidden="true" />
            <span className="min-w-0">
              <span className="t-title block">{row.supplierName}</span>
              <span className="t-data mt-1 block" style={{ color: "var(--color-fg-2)" }}>
                {inputs.leadTimeDays}D LEAD · MOQ {inputs.moq} · PACK {inputs.packSize}
              </span>
            </span>
            <IconChevronRight size={18} />
          </Link>
        ) : (
          <p className="t-secondary">
            No supplier assigned, so this uses the store&rsquo;s default {inputs.leadTimeDays}-day
            lead time. <Link href="/suppliers">Assign one</Link> and the reorder point sharpens.
          </p>
        )}
      </section>

      <div className="thumb-cta flex flex-col gap-3">
        <Link href="/po" className="btn btn-primary btn-full">
          {row.status === "order_now" || row.status === "order_soon"
            ? "Add to PO draft"
            : "Open PO drafts"}
        </Link>
        <SnoozeForm variantId={row.variantId} />
      </div>
    </main>
  );
}

function MathRow({
  label,
  value,
  source,
  emphasis = false,
}: {
  label: string;
  value: string;
  source: string;
  emphasis?: boolean;
}) {
  return (
    <div className="hairline-t py-3">
      <div className="flex items-baseline justify-between gap-4">
        <span className="t-label">{label}</span>
        <span
          className="t-data whitespace-nowrap"
          style={{ color: emphasis ? "var(--color-paper)" : "var(--color-fg)" }}
        >
          {value}
        </span>
      </div>
      <p className="t-secondary mt-1" style={{ color: "var(--color-fg-3)" }}>
        {source}
      </p>
    </div>
  );
}

function windowSource(window: { units: number; observedDays: number; censoredDays: number; hasData: boolean }): string {
  if (!window.hasData) return "no in-stock day in this window — nothing to measure";
  return `${window.units} units ÷ ${window.observedDays} in-stock days${
    window.censoredDays ? ` (${window.censoredDays} stockout day${window.censoredDays === 1 ? "" : "s"} excluded)` : ""
  }`;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}
