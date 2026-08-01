import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMerchant } from "@/lib/auth";
import { SnippetBlock } from "@/components/CopyField";
import { WidgetPreview } from "@/components/WidgetPreview";
import { IconTrash } from "@/components/icons";
import { count } from "@/lib/format";
import { NotFoundError } from "@/lib/errors";
import { plan, resolveBranding } from "@/lib/plans";
import { reviewedProducts } from "@/lib/reviews";
import { embedSnippet, getWidget, WIDGET_META } from "@/lib/widgets";
import { widgetPayloadFresh } from "@/lib/widget-data";
import { deleteWidgetAction } from "../actions";
import { ThemeControls } from "./ThemeControls";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  try {
    const { store } = await requireMerchant();
    const { widget } = await getWidget((await params).id, store.id);
    return { title: widget.name };
  } catch {
    return { title: "Widget" };
  }
}

export default async function WidgetPage({ params }: { params: Promise<{ id: string }> }) {
  const { merchant, store } = await requireMerchant();
  const { id } = await params;

  let row;
  try {
    row = await getWidget(id, store.id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const { widget, settings } = row;

  const [payload, products] = await Promise.all([
    widgetPayloadFresh({ store, tier: merchant.tier, widgetId: widget.id }),
    reviewedProducts(store.id),
  ]);

  const limits = plan(merchant.tier);
  const brandingLocked = limits.branding !== "optional";
  const effectiveBranding = resolveBranding(merchant.tier, settings.showBranding);

  const snippet = embedSnippet({
    store,
    widget,
    settings,
    reviewCount: payload.aggregate.count,
  });

  const productSnippet = products.length
    ? embedSnippet({
        store,
        widget,
        settings,
        reviewCount: payload.aggregate.count,
        productExternalId: products[0].externalId,
      })
    : null;

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <Link href="/widgets" className="btn-quiet no-underline">
          Widgets
        </Link>
        <h1 className="t-h2 mt-3">{widget.name}</h1>
        <p className="t-secondary mt-1">
          {WIDGET_META[widget.type].label} &middot; {WIDGET_META[widget.type].blurb}
        </p>
      </header>

      <section className="mb-8">
        <p className="t-label mb-3">Live, at 390px</p>
        <div className="card p-4" style={{ maxWidth: 390 }}>
          <WidgetPreview payload={payload} id={widget.id} />
        </div>
        <p className="t-secondary mt-3">
          {payload.aggregate.count
            ? `Reading ${count(payload.aggregate.count)} published review${payload.aggregate.count === 1 ? "" : "s"}.`
            : "No published reviews yet, so this is the empty state a shopper would see."}
        </p>
      </section>

      <section className="mb-10">
        <p className="t-label mb-2">Embed code</p>
        <p className="t-secondary mb-3">
          Paste this where the widget belongs. The container&apos;s height is already reserved, which
          is why the reviews arriving shifts nothing on the page.
        </p>
        <SnippetBlock code={snippet} />
      </section>

      {productSnippet ? (
        <section className="mb-10">
          <p className="t-label mb-2">One product only</p>
          <p className="t-secondary mb-3">
            Add <code className="t-data">data-product</code> to show just that product&apos;s
            reviews — this one is set to {products[0].title ?? products[0].externalId}.
          </p>
          <SnippetBlock code={productSnippet} />
        </section>
      ) : null}

      <section className="hairline-t pt-8">
        <p className="t-label mb-2">Theme</p>
        <ThemeControls
          widgetId={widget.id}
          type={widget.type}
          theme={settings.theme}
          layout={settings.layout}
          showBranding={effectiveBranding}
          brandingLocked={brandingLocked}
          brandingLockReason={
            limits.branding === "required"
              ? `On ${limits.name} the link stays — it is how people find us, and it is why the tier exists.`
              : limits.branding === "removed"
                ? `Removed on ${limits.name}. Nothing of ours appears in your widget.`
                : "Your choice on Growth."
          }
        />
      </section>

      <section className="hairline-t mt-10 pt-8">
        <form action={deleteWidgetAction}>
          <input type="hidden" name="id" value={widget.id} />
          <button className="btn btn-danger" type="submit">
            <IconTrash size={18} />
            Delete this widget
          </button>
        </form>
        <p className="t-secondary mt-2">
          Deleting a widget removes the instance and its settings. Your reviews are untouched — they
          belong to the store, not to the widget.
        </p>
      </section>
    </main>
  );
}
