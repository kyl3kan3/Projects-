import type { Metadata } from "next";
import Link from "next/link";
import { ScreenHeader } from "@/components/ScreenHeader";
import { IconChevronRight, IconPencil, IconPlus, IconUpload } from "@/components/icons";
import { requireOnboardedUser } from "@/lib/auth";
import { applyMarkup, formatMoney } from "@/lib/money";
import { orgAsGatable, priceBookCapacity } from "@/lib/plans";
import { groupByCategory, itemCount, KIND_LABELS, listItems, UNIT_LABELS } from "@/lib/price-book";
import { TRADE_LABELS } from "@/lib/trades";
import { SeedStarterButton } from "./SeedStarterButton";

export const metadata: Metadata = { title: "Price book" };
export const dynamic = "force-dynamic";

export default async function PriceBookPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { org } = await requireOnboardedUser();
  const { q } = await searchParams;
  const search = (q ?? "").trim();
  const [items, total] = await Promise.all([
    listItems(org.id, { search }),
    itemCount(org.id),
  ]);
  const capacity = priceBookCapacity(orgAsGatable(org), total);
  const groups = groupByCategory(items);

  return (
    <main>
      <ScreenHeader
        title="Price book"
        meta={
          capacity.unlimited
            ? `${total} items · unlimited`
            : `${total} of ${capacity.limit} items · ${TRADE_LABELS[org.trade]}`
        }
      />

      <section className="gutter" style={{ paddingBottom: 20 }}>
        <form action="/price-book" method="get">
          <input
            className="field"
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Search items, categories…"
            aria-label="Search the price book"
          />
        </form>
      </section>

      {!total ? (
        <section className="gutter">
          <p className="t-title">Your price book is empty</p>
          <p className="t-secondary" style={{ marginTop: 6, maxWidth: "42ch" }}>
            Nothing can be drafted from an empty book — the AI only prices from your own items, and
            never invents a number. Start with the {TRADE_LABELS[org.trade].toLowerCase()} starter set
            or import your rate sheet.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
            <SeedStarterButton trade={TRADE_LABELS[org.trade]} />
            <Link className="btn btn-secondary" href="/price-book/import">
              <IconUpload size={18} />
              Import a CSV
            </Link>
          </div>
        </section>
      ) : (
        <>
          {groups.map(([category, group]) => (
            <section key={category} className="gutter" style={{ paddingBottom: 24 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingBottom: 4,
                }}
              >
                <p className="t-label">{category}</p>
                <Link
                  href={`/price-book/new?category=${encodeURIComponent(category)}`}
                  className="btn-quiet"
                >
                  <IconPlus size={16} />
                  Add item
                </Link>
              </div>
              {group.map((item) => (
                <Link key={item.id} href={`/price-book/${item.id}`} className="row">
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="t-title" style={{ display: "block" }}>
                      {item.name}
                    </span>
                    <span
                      className="t-secondary"
                      style={{ display: "block", marginTop: 4, color: "var(--color-text-3)" }}
                    >
                      {KIND_LABELS[item.kind]} · {UNIT_LABELS[item.unit]} · cost{" "}
                      {formatMoney(item.unitCostCents)}
                      {item.markupPct !== null ? ` · ${item.markupPct}% markup` : ""}
                      {item.source === "template" ? " · ours, replace it" : ""}
                    </span>
                  </span>
                  <span style={{ textAlign: "right", flex: "none" }}>
                    <span className="t-data" style={{ display: "block", fontSize: 14 }}>
                      {formatMoney(applyMarkup(item.unitCostCents, item.markupPct ?? org.defaultMarkupPct))}
                    </span>
                    <span className="t-data" style={{ color: "var(--color-text-3)" }}>
                      per {UNIT_LABELS[item.unit]}
                    </span>
                  </span>
                  <IconPencil size={18} style={{ color: "var(--color-text-3)", flex: "none" }} />
                </Link>
              ))}
            </section>
          ))}

          {search && !items.length ? (
            <section className="gutter">
              <p className="t-title">Nothing matches “{search}”</p>
              <p className="t-secondary" style={{ marginTop: 6 }}>
                Try a supplier's word for it, or add the item.
              </p>
            </section>
          ) : null}

          <section className="gutter" style={{ paddingTop: 8 }}>
            <Link href="/price-book/import" className="row" style={{ borderTop: "1px solid var(--color-hairline)" }}>
              <IconUpload size={18} style={{ color: "var(--color-text-2)" }} />
              <span style={{ flex: 1 }}>
                <span className="t-title" style={{ display: "block" }}>
                  Import a rate sheet
                </span>
                <span className="t-secondary" style={{ color: "var(--color-text-3)" }}>
                  CSV from Excel, QuickBooks or a supplier portal. Existing items are updated, not
                  duplicated.
                </span>
              </span>
              <IconChevronRight size={18} style={{ color: "var(--color-text-3)" }} />
            </Link>
            {capacity.atLimit ? (
              <p className="t-secondary" style={{ marginTop: 16, color: "var(--color-amber)" }}>
                Your plan's book holds {capacity.limit} items and it is full. Upgrade or archive
                something before importing more.
              </p>
            ) : null}
          </section>
        </>
      )}

      <div className="thumb-bar">
        <Link href="/price-book/new" className="btn btn-primary btn-full">
          <IconPlus size={18} />
          Add an item
        </Link>
      </div>
    </main>
  );
}
