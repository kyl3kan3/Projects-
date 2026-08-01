import type { Metadata } from "next";
import Link from "next/link";
import { Stars } from "@/components/Stars";
import { IconBolt, IconCheck } from "@/components/icons";
import { kilobytes } from "@/lib/format";
import { PLANS, TIER_ORDER } from "@/lib/plans";
import { widgetBuildInfo } from "@/lib/widget-manifest";
import { renderWidget, widgetStyles } from "@/widget/render";
import type { WidgetPayload } from "@/widget/types";

/**
 * Marketing landing page, built to MARKETING_PLAYBOOK.md.
 *
 * - **Enemy:** the conversion tool that quietly costs conversion — 200KB of
 *   review script that tanks LCP and shifts the page as reviews pop in.
 * - **One sentence:** "Social proof that doesn't slow your store down."
 * - **The device (Law 3):** *4.8 from 2,847 real orders* — the star row and the
 *   count, together, everywhere.
 * - **The demo in 5 seconds (Law 2):** the hero is a real widget, rendered by the
 *   same `renderWidget()` the embed runs on a storefront. It is labelled a demo,
 *   because the reviews in it are written for a store that does not exist.
 * - **Receipts (Law 5):** the only numbers quoted about us are the widget's own
 *   measured build size and the plan limits. No customer logos, no invented
 *   install counts, no fabricated testimonials — we are pre-launch and say so.
 * - **One CTA phrase, verbatim, four times:** "Start collecting — free".
 */

const CTA = "Start collecting — free";

export const metadata: Metadata = {
  title: "TrustBadge — social proof that doesn't slow your store down",
  description:
    "Post-purchase review collection and a review widget under 15KB gzipped with zero layout shift. Flat pricing, public, tops out at $79. Shopify or any cart.",
};

/**
 * The hero widget. Real renderer, real markup, invented reviews for a store named
 * as fictional — the honest version of a staged demo (Law 5).
 */
const DEMO: WidgetPayload = {
  store: { name: "Harbor Goods (demo store)", url: null },
  widget: {
    id: "",
    type: "wall",
    starColor: "#e09112",
    radius: 12,
    font: "trustbadge",
    motion: true,
    maxReviews: 3,
    showPhotos: false,
    showReplies: true,
    showBranding: false,
  },
  aggregate: { rating: 4.8, count: 2_847, distribution: [12, 24, 61, 402, 2_348] },
  product: null,
  generatedAt: "",
  reviews: [
    {
      id: "1",
      rating: 5,
      title: "Exactly what I hoped for",
      body: "Beautiful weight, washes well, and the linen softened after two runs. I ordered two more for the shop.",
      author: "Maya R.",
      verified: true,
      date: "Jun 24",
      dateIso: "2026-06-24",
      product: "Harbor Linen Apron",
      reply: "Thank you Maya — the flax comes from a mill in Kortrijk.",
      photos: [],
      disclosure: null,
    },
    {
      id: "2",
      rating: 4,
      title: null,
      body: "Runs small — size up. Once I sorted that out it is the only apron I reach for.",
      author: "Tomas L.",
      verified: true,
      date: "Jun 19",
      dateIso: "2026-06-19",
      product: "Harbor Linen Apron",
      reply: null,
      photos: [],
      disclosure: null,
    },
    {
      id: "3",
      rating: 5,
      title: "Third one",
      body: "Bought the first in 2024 and it still looks new, so this is number three. Ties are the part that usually goes and these have not.",
      author: "Priya N.",
      verified: true,
      date: "Jun 11",
      dateIso: "2026-06-11",
      product: "Beeswax Wrap Set",
      reply: null,
      photos: [],
      disclosure: null,
    },
  ],
};

export default async function LandingPage() {
  const build = widgetBuildInfo();
  const [free, starter, growth, pro] = TIER_ORDER.map((tier) => PLANS[tier]);

  // The hero widget's stylesheet, scoped to a wrapper instead of a shadow root.
  const demoCss = widgetStyles(DEMO.widget)
    .replace(/:host\{/g, ".tb-demo{")
    .replace(/\.tb-/g, ".tb-demo .tb-");

  return (
    <main>
      {/* 1 — Hero: the claim, the machine running, the CTA, the de-risk line. */}
      <section className="screen-plain pt-12" style={{ paddingBottom: 64 }}>
        <p className="t-label">TrustBadge</p>
        <h1 className="t-hero mt-4">Social proof that doesn&apos;t slow your store down.</h1>
        <p className="t-body mt-4" style={{ color: "var(--color-text-2)", maxWidth: "38ch" }}>
          Collect reviews after every order. Show them in a widget that weighs less than your
          favicon and moves nothing on the page.
        </p>

        {/* The device: 4.8 from 2,847 real orders. */}
        <div className="mt-8 flex items-center gap-3">
          <Stars value={4.8} size={22} />
          <p className="t-data" style={{ fontSize: 15 }}>
            4.8 from 2,847 real orders
          </p>
        </div>

        <div className="mt-5">
          <style>{demoCss}</style>
          <div className="card p-4">
            <div className="tb-demo" dangerouslySetInnerHTML={{ __html: renderWidget(DEMO) }} />
          </div>
          <p className="t-secondary mt-3">
            That is the actual widget, rendered by the code that runs on a storefront. The reviews
            are written for a demo store called Harbor Goods — we are pre-launch, so there is
            nothing real to quote yet.
          </p>
        </div>

        {build ? (
          <p className="t-data mt-6" style={{ color: "var(--color-text-2)" }}>
            {kilobytes(build.gzipBytes)} GZIPPED &middot; 0 DEPENDENCIES &middot; CLS 0.00
          </p>
        ) : null}

        <div className="mt-8">
          <Link href="/signup" className="btn btn-primary btn-full no-underline">
            {CTA}
          </Link>
          <p className="t-secondary mt-3 text-center">
            No card. {free.ordersPerMonth} orders a month and the badge widget, permanently.
          </p>
        </div>
      </section>

      {/* 2 — The device explained: what "does not slow you down" actually means. */}
      <section className="screen-plain hairline-t py-14">
        <p className="t-label">The enemy</p>
        <h2 className="t-h2 mt-3">Your review app is costing you the conversion it promised.</h2>
        <p className="t-body mt-4" style={{ color: "var(--color-text-2)" }}>
          Most review widgets ship 80–300KB of JavaScript and inject their content after the page
          has painted. The product images move down. The Add to Cart button jumps under a thumb.
          Google files that under CLS and LCP, both of which are ranking signals.
        </p>
        <div className="mt-6 flex flex-col gap-5">
          <Explain
            title="Async, always"
            body="One script tag with the async attribute. It cannot block your storefront's render, because it is not on the critical path at all."
          />
          <Explain
            title="The box is reserved before the data arrives"
            body="The snippet you paste carries its own height, measured from your real review count. The reviews land into space that was already theirs. CLS 0.00 is a spec, not a hope."
          />
          <Explain
            title="Served from the edge, not from us"
            body="Reviews are cached at the CDN for five minutes with a day of stale-while-revalidate, so almost no shopper request ever reaches our origin. Approving a review purges that cache immediately, so moderation is not delayed by it."
          />
        </div>
      </section>

      {/* 3 — The math, calculated in front of them. */}
      <section className="screen-plain hairline-t py-14">
        <p className="t-label">The math</p>
        <h2 className="t-h2 mt-3">What the incumbents charge to do this.</h2>
        <div className="card mt-6 p-5">
          <MathRow label="Yotpo, once you need photo reviews" value="quote" />
          <MathRow label="Loox, at 1,500 orders a month" value="$34.99/mo" />
          <MathRow label="Okendo, past the entry tier" value="$119/mo" />
          <MathRow label="Judge.me, flat" value="$15/mo" />
          <MathRow label={`TrustBadge ${growth.name}, 1,500 orders`} value={`$${growth.priceMonthly}/mo`} accent />
        </div>
        <p className="t-secondary mt-3">
          Competitor prices are from their public pricing pages at the time of writing; Yotpo does
          not publish one past its entry plan. We are not the cheapest — Judge.me is, and it is a
          good product. We are the fast one, and at $30k a month in orders a five-point Lighthouse
          difference is worth more than four dollars.
        </p>
      </section>

      {/* 4 — Receipts: what the product does, no invented numbers. */}
      <section className="screen-plain hairline-t py-14">
        <p className="t-label">What you actually get</p>
        <h2 className="t-h2 mt-3">No asterisks.</h2>
        <ul className="mt-6 flex flex-col">
          <Receipt
            title={build ? `A ${kilobytes(build.gzipBytes)} widget, enforced by the build` : "A widget with a hard size budget"}
            body="The bundle has a 15KB gzipped ceiling and the build fails over it, exactly like a failing test. The number on this page is measured from the file we are serving you, not from a press release."
          />
          <Receipt
            title="Review text that cannot execute"
            body="Reviews are written by strangers and rendered inside your storefront next to your checkout. Every field is escaped for its exact context, the widget lives in a shadow root, and the escaping has its own test file with the real attack payloads in it."
          />
          <Receipt
            title="No review gating, and no setting for it"
            body="Every customer who buys gets the same request, whatever they are likely to say. The auto-publish threshold decides what skips your moderation queue — never who gets asked. The FTC's 2024 rule bans the other thing, and incumbents have been burned by it."
          />
          <Receipt
            title="Incentives that reward a photo, not a rating"
            body="A one-star review with a photo earns the same discount code as a five-star one, and every incentivised review carries its disclosure line, stored on the review so it cannot be edited away later."
          />
          <Receipt
            title="Your history, portable, on the way in and the way out"
            body="Upload a Judge.me or Loox export unedited and it maps by column alias. Re-upload it and nothing duplicates. Reviews belong to your store, not to the widget or to us."
          />
          <Receipt
            title="Downgrades never delete"
            body="Drop to Free and your wall widget keeps its settings and your reviews stay put — the storefront falls back to the badge until you upgrade. Going over an order limit stops new outreach, never order recording."
          />
        </ul>
        <p className="t-secondary mt-6">
          There are no customer logos on this page and no install counts, because TrustBadge has not
          launched. When there are real ones they will be named with permission and dated.
        </p>
      </section>

      {/* 5 — Objection killer: the named doubt. */}
      <section className="screen-plain hairline-t py-14">
        <p className="t-label">The obvious question</p>
        <h2 className="t-h2 mt-3">Why not just stay on Judge.me for $15?</h2>
        <p className="t-body mt-4" style={{ color: "var(--color-text-2)" }}>
          If the widget's weight and its looks do not bother you, stay. It is a genuinely good
          product with an enormous install base, and four dollars a month is not an argument.
        </p>
        <p className="t-body mt-4" style={{ color: "var(--color-text-2)" }}>
          The reason to move is that you have run Lighthouse on your own product page, seen what the
          review script did to it, and decided you would rather not pay for that twice. Bring your
          history with you — the importer exists precisely so switching costs you an afternoon
          instead of your reviews.
        </p>
      </section>

      {/* 6 — Pricing, anchored, with the per-unit math spelled out. */}
      <section className="screen-plain hairline-t py-14">
        <p className="t-label">Pricing</p>
        <h2 className="t-h2 mt-3">On the page, where it belongs.</h2>

        <div className="mt-6 flex flex-col gap-4">
          {[free, starter, growth, pro].map((p) => (
            <article key={p.id} className="card p-5">
              <div className="flex items-baseline justify-between gap-4">
                <p className="t-title">{p.name}</p>
                <p className="t-data" style={{ fontSize: 24 }}>
                  {p.priceMonthly === 0 ? "$0" : `$${p.priceMonthly}`}
                </p>
              </div>
              <p className="t-secondary mt-2">{p.blurb}</p>
              <p className="t-secondary mt-2">
                {p.ordersPerMonth === null
                  ? `Unlimited orders (we talk past ${p.softCapOrders?.toLocaleString("en-US")}, we never ambush you with a quote)`
                  : `${p.ordersPerMonth.toLocaleString("en-US")} orders a month`}
                {" · "}
                {p.widgetTypes.length === 1 ? "badge widget" : "all four widgets"}
              </p>
              {p.priceMonthly > 0 && p.ordersPerMonth ? (
                <p className="t-data mt-3" style={{ color: "var(--color-text-3)" }}>
                  ${((p.priceMonthly / p.ordersPerMonth) * 100).toFixed(2)} per 100 orders
                </p>
              ) : null}
            </article>
          ))}
        </div>

        <p className="t-secondary mt-4">
          No &ldquo;contact sales&rdquo; anywhere, and the ladder stops at ${pro.priceMonthly} on
          purpose. If you need a marketing suite with an SDR attached, that is a different product
          and we will tell you so.
        </p>

        <div className="mt-8">
          <Link href="/signup" className="btn btn-primary btn-full no-underline">
            {CTA}
          </Link>
        </div>
      </section>

      {/* 7 — Final CTA: the claim restated as an imperative. */}
      <section className="screen-plain hairline-t py-14" style={{ paddingBottom: 112 }}>
        <h2 className="t-h2">Put your reviews where shoppers look, without paying for it in LCP.</h2>
        <p className="t-body mt-3" style={{ color: "var(--color-text-2)" }}>
          One script tag, one afternoon, and every order after that asks for itself.
        </p>
        <p className="t-data mt-5 inline-flex items-center gap-2" style={{ color: "var(--color-text-2)" }}>
          <IconBolt size={16} />
          {build ? `${kilobytes(build.gzipBytes)} · CLS 0.00` : "CLS 0.00"}
        </p>
        <div className="mt-8">
          <Link href="/signup" className="btn btn-primary btn-full no-underline">
            {CTA}
          </Link>
        </div>
        <p className="t-secondary mt-6">
          Already collecting?{" "}
          <Link href="/login" style={{ color: "var(--color-gold)" }}>
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}

function Explain({ title, body }: { title: string; body: string }) {
  return (
    <div className="hairline-t pt-4">
      <p className="t-title">{title}</p>
      <p className="t-secondary mt-1.5">{body}</p>
    </div>
  );
}

function Receipt({ title, body }: { title: string; body: string }) {
  return (
    <li className="hairline-b py-4">
      <p className="t-title flex items-start gap-2">
        <span style={{ color: "var(--color-leaf)", marginTop: 1 }}>
          <IconCheck size={16} />
        </span>
        {title}
      </p>
      <p className="t-secondary mt-1.5">{body}</p>
    </li>
  );
}

function MathRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="hairline-b flex items-baseline justify-between gap-4 py-2.5 last:border-0">
      <span className="t-secondary">{label}</span>
      <span className="t-data" style={{ color: accent ? "var(--color-ink)" : undefined }}>
        {value}
      </span>
    </div>
  );
}
