import type { Metadata } from "next";
import Link from "next/link";
import { requireMerchant } from "@/lib/auth";
import { ReviewCard } from "@/components/ReviewCard";
import { Stars } from "@/components/Stars";
import { IconBolt, IconChevronRight } from "@/components/icons";
import { count, kilobytes, percent, rating as fmtRating } from "@/lib/format";
import { meteringFor } from "@/lib/metering";
import { plan } from "@/lib/plans";
import { conversion, countScheduled, funnelFor } from "@/lib/requests";
import { aggregateFor, countByStatus, listReviews } from "@/lib/reviews";
import { impressionsFor } from "@/lib/widgets";
import { widgetBuildInfo } from "@/lib/widget-manifest";
import { widgetPayloadFresh } from "@/lib/widget-data";

export const metadata: Metadata = { title: "Home" };
/** The funnel has to be current every time it is opened, not as of the last build. */
export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ installed?: string; webhooks?: string }>;
}) {
  const { merchant, store } = await requireMerchant();
  const { installed, webhooks } = await searchParams;

  // Timed deliberately: this is the same work the widget's origin does on a cache
  // miss, so the number in the receipts line is a measurement of this deployment
  // rather than a benchmark from a press release.
  const originStart = Date.now();
  await widgetPayloadFresh({ store, tier: merchant.tier });
  const originMs = Date.now() - originStart;

  const build = widgetBuildInfo();
  const [funnel, aggregate, byStatus, latest, metering, scheduled, impressions] =
    await Promise.all([
      funnelFor(store.id),
      aggregateFor(store.id),
      countByStatus(store.id),
      listReviews(store.id, { limit: 6 }),
      meteringFor(merchant.id, merchant.tier),
      countScheduled(store.id),
      impressionsFor(store.id, 30),
    ]);

  const limits = plan(merchant.tier);
  const submitRate = conversion(funnel.reviewed, funnel.sent);

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <p className="t-label">TrustBadge</p>
        <h1 className="t-h2 mt-2">{greeting()}, {store.name}</h1>

        {build ? (
          <p className="t-data mt-2" style={{ color: "var(--color-text-2)" }}>
            {kilobytes(build.gzipBytes)} &middot; {originMs} MS ORIGIN &middot; CLS 0.00
          </p>
        ) : (
          <p className="t-secondary mt-2">
            Run <code className="t-data">npm run build:widget</code> to measure the embed.
          </p>
        )}
      </header>

      {installed ? (
        <p className="card mb-6 p-4 t-secondary" role="status" style={{ color: "var(--color-leaf)" }}>
          {installed} is connected. Orders will start arriving here as they are fulfilled.
          {webhooks === "partial"
            ? " Some webhooks did not register — reconnect from Settings to retry."
            : ""}
        </p>
      ) : null}

      {/* The funnel: four full-bleed hairline rows, not boxes. */}
      <section className="funnel mb-8" aria-label="Review funnel">
        <FunnelRow label="Orders" value={funnel.orders} href="/settings" />
        <FunnelRow label="Requested" value={funnel.requested} href="/reviews" />
        <FunnelRow label="Reviewed" value={funnel.reviewed} href="/reviews" />
        <FunnelRow label="Published" value={funnel.published} href="/widgets" />
      </section>

      <section className="hairline-b flex items-center gap-3 pb-5">
        <Stars value={aggregate.rating} size={18} />
        <p className="t-data">
          {aggregate.count ? fmtRating(aggregate.rating) : "—"} average
        </p>
        <p className="t-secondary ml-auto">
          {byStatus.pending
            ? `${count(byStatus.pending)} awaiting review`
            : `${count(byStatus.approved)} published`}
        </p>
      </section>

      <section className="hairline-b py-5">
        <div className="flex items-baseline justify-between gap-4">
          <p className="t-label">Orders this period</p>
          <p className="t-data">
            {count(metering.used)}
            {metering.limit === null ? " / unlimited" : ` / ${count(metering.limit)}`}
          </p>
        </div>
        {metering.fraction !== null ? (
          <div className="meter mt-3" role="img" aria-label={`${percent(metering.fraction)} of the ${limits.name} allowance used`}>
            <div
              className="meter-fill"
              data-over={metering.overLimit}
              style={{ width: `${Math.round(metering.fraction * 100)}%` }}
            />
          </div>
        ) : null}
        <p className="t-secondary mt-2">
          {metering.overLimit ? (
            <>
              You are at the {limits.name} limit, so new requests are not being scheduled. Orders
              are still recorded — nothing is lost.{" "}
              <Link href="/settings/billing" style={{ color: "var(--color-gold)" }}>
                See plans
              </Link>
            </>
          ) : metering.overSoftCap ? (
            <>Past the fair-use mark on {limits.name}. We will get in touch — nothing stops.</>
          ) : (
            <>
              {limits.name} plan
              {metering.remaining !== null ? ` · ${count(metering.remaining)} orders left` : ""}
            </>
          )}
        </p>
      </section>

      <section className="hairline-b py-5">
        <div className="flex items-baseline justify-between gap-4">
          <p className="t-label">Widget impressions, 30 days</p>
          <p className="t-data">{count(impressions.total)}</p>
        </div>
        <p className="t-secondary mt-2">
          Counted once per widget per page view, when it actually scrolls into view. Requests served
          from the CDN cache never reach us, so this is the only honest count we have.
        </p>
      </section>

      <section className="hairline-b py-5">
        <div className="flex items-baseline justify-between gap-4">
          <p className="t-label">Request conversion</p>
          <p className="t-data">{submitRate === null ? "—" : percent(submitRate)}</p>
        </div>
        <p className="t-secondary mt-2">
          {funnel.sent
            ? `${count(funnel.reviewed)} reviews from ${count(funnel.sent)} sent requests. Opens (${count(funnel.opened)}) are approximate — image blocking and Apple Mail Privacy Protection both distort them.`
            : "No requests have been sent yet. They go out automatically once orders are fulfilled."}
        </p>
      </section>

      <section className="pt-8">
        <p className="t-label mb-4">Latest reviews</p>
        {latest.length === 0 ? <EmptyInbox storeName={store.name} /> : (
          <div className="review-grid flex flex-col gap-4">
            {latest.map(({ review, media }) => (
              <ReviewCard key={review.id} review={review} media={media} showStatus />
            ))}
          </div>
        )}
      </section>

      <div className="thumb-cta">
        {byStatus.pending > 0 ? (
          <Link href="/reviews" className="btn btn-primary btn-full no-underline">
            Approve {count(byStatus.pending)} waiting
          </Link>
        ) : scheduled > 0 ? (
          <Link href="/reviews?tab=queue" className="btn btn-primary btn-full no-underline">
            <IconBolt size={18} />
            {count(scheduled)} requests queued
          </Link>
        ) : (
          <Link href="/widgets" className="btn btn-primary btn-full no-underline">
            Open the widget studio
          </Link>
        )}
      </div>
    </main>
  );
}

function greeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function FunnelRow({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="funnel-row no-underline">
      <span className="t-label">{label}</span>
      <span className="funnel-count">{count(value)}</span>
    </Link>
  );
}

/**
 * The empty state carries real content — what will land here, and the three
 * things that make it land — never grey placeholder bars.
 */
function EmptyInbox({ storeName }: { storeName: string }) {
  return (
    <div className="card p-4">
      <p className="t-title">No reviews yet. Here is the whole loop.</p>
      <ul className="mt-4 flex flex-col">
        {[
          {
            step: "An order is fulfilled",
            detail: "Shopify sends the fulfilment webhook, or you post the order yourself.",
          },
          {
            step: "Fourteen days later, one email",
            detail: `"How is the Harbor Linen Apron?" — from ${storeName}, not from us.`,
          },
          {
            step: "A review lands here",
            detail: "Four stars and up publish themselves. Anything lower waits for you.",
          },
        ].map((row) => (
          <li key={row.step} className="hairline-t py-3 first:border-t-0 first:pt-0">
            <p className="t-title">{row.step}</p>
            <p className="t-secondary mt-1">{row.detail}</p>
          </li>
        ))}
      </ul>
      <p className="t-secondary mt-4 flex items-center gap-1">
        <Link href="/settings/install" style={{ color: "var(--color-gold)" }}>
          Connect a store
        </Link>
        <IconChevronRight size={16} />
      </p>
    </div>
  );
}
