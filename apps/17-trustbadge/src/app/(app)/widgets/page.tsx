import type { Metadata } from "next";
import Link from "next/link";
import { requireMerchant } from "@/lib/auth";
import { WidgetPreview } from "@/components/WidgetPreview";
import { IconChevronRight } from "@/components/icons";
import { count } from "@/lib/format";
import { plan } from "@/lib/plans";
import { listWidgets, WIDGET_META } from "@/lib/widgets";
import { impressionsFor } from "@/lib/widgets";
import { widgetPayloadFresh } from "@/lib/widget-data";
import { NewWidgetForm } from "./NewWidgetForm";

export const metadata: Metadata = { title: "Widgets" };
export const dynamic = "force-dynamic";

/**
 * The widget studio. Every instance renders as a live phone-width widget in a card
 * frame — the product demonstrating itself on the device it ships to, from the
 * merchant's own reviews.
 */
export default async function WidgetsPage() {
  const { merchant, store } = await requireMerchant();
  const [rows, impressions] = await Promise.all([
    listWidgets(store.id),
    impressionsFor(store.id, 30),
  ]);
  const limits = plan(merchant.tier);

  const previews = await Promise.all(
    rows.map(async ({ widget }) => ({
      id: widget.id,
      payload: await widgetPayloadFresh({ store, tier: merchant.tier, widgetId: widget.id }),
    })),
  );
  const payloadFor = new Map(previews.map((p) => [p.id, p.payload]));

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <p className="t-label">Widget studio</p>
        <h1 className="t-h2 mt-2">
          {rows.length === 1 ? "One widget" : `${count(rows.length)} widgets`} on {store.name}
        </h1>
        <p className="t-secondary mt-1">
          These are the real widgets, rendered from your real reviews by the same code the embed
          runs. What you see here is what a shopper sees.
        </p>
      </header>

      <section className="flex flex-col gap-8">
        {rows.map(({ widget, settings }) => {
          const payload = payloadFor.get(widget.id);
          return (
            <article key={widget.id}>
              <div className="mb-3 flex items-baseline justify-between gap-4">
                <div className="min-w-0">
                  <p className="t-title truncate">{widget.name}</p>
                  <p className="t-secondary">
                    {WIDGET_META[widget.type].label}
                    {settings.layout.maxReviews && (widget.type === "wall" || widget.type === "carousel")
                      ? ` · up to ${settings.layout.maxReviews} reviews`
                      : ""}
                  </p>
                </div>
                <p className="t-data" style={{ color: "var(--color-text-2)" }}>
                  {count(impressions.byWidget.get(widget.id) ?? 0)}
                </p>
              </div>

              {/* The card frame is the phone-width instance from DESIGN.md. */}
              <div className="card p-4" style={{ maxWidth: 390 }}>
                {payload ? <WidgetPreview payload={payload} id={widget.id} /> : null}
              </div>

              <Link
                href={`/widgets/${widget.id}`}
                className="btn-quiet mt-3 inline-flex items-center gap-1 no-underline"
              >
                Theme and embed code
                <IconChevronRight size={16} />
              </Link>
            </article>
          );
        })}
      </section>

      <section className="hairline-t mt-10 pt-8">
        <p className="t-label mb-4">Add a widget</p>
        <NewWidgetForm allowed={[...limits.widgetTypes]} />
      </section>
    </main>
  );
}
