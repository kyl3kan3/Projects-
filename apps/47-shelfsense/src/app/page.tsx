import type { Metadata } from "next";
import Link from "next/link";

/**
 * The landing page. Built last, to MARKETING_PLAYBOOK.md.
 *
 *  - **Enemy:** cash tied up in the wrong SKUs while the best-seller goes out of stock.
 *  - **One sentence:** your best-seller's stockout is already on the calendar — this
 *    tells you the date, and what to order to miss it.
 *  - **Device (Law 3):** *the runway under every SKU* — a stock bar draining toward a
 *    date with a kraft notch at the reorder point. Hero, proof section, and pricing.
 *  - **Arc:** hook → tension → proof → offer.
 *  - **One CTA phrase, repeated verbatim:** "Start the 14-day trial".
 *
 * Law 5 is the constraint that shaped this page: there are no customers yet, so there
 * are no testimonials, no logos and no usage numbers. Every figure is either the demo
 * store's own output — labelled as a demo, every time it appears — or a published
 * third-party statistic with its source linked. Nothing is invented.
 *
 * Motion budget (Law 6): three beats, all CSS, all on entry — the hero runway drawing
 * itself, the reorder notch landing, and the row's kraft underline sweeping in.
 * `prefers-reduced-motion` collapses all three (globals.css).
 */

export const metadata: Metadata = {
  title: "ShelfSense — know the date your best-seller runs out",
  description:
    "Sales velocity and supplier lead times become reorder points, PO drafts and dead-stock alerts for Shopify merchants. Every number expands to its inputs.",
  openGraph: {
    title: "ShelfSense — know the date your best-seller runs out",
    description:
      "Reorder points, order-by dates and supplier-grouped POs, computed from your own 90 days. Every number expands to its inputs.",
  },
};

/** Law 7: one primary CTA phrase, the same words at every position on the page. */
const CTA = "Start the 14-day trial";

export default function LandingPage() {
  return (
    <main>
      {/* ---------------------------------------------------------------- hero --- */}
      <section className="screen" style={{ paddingBottom: 0 }}>
        <header className="flex items-center justify-between pt-6">
          <span className="t-label" style={{ color: "var(--color-kraft)" }}>
            ShelfSense
          </span>
          <Link href="/login" className="t-data" style={{ color: "var(--color-fg-2)" }}>
            SIGN IN
          </Link>
        </header>

        <div className="pt-10">
          <h1 className="t-h2" style={{ fontSize: "clamp(28px, 8vw, 44px)", lineHeight: 1.1 }}>
            Your best-seller&rsquo;s stockout is already on the calendar.
          </h1>
          <p className="t-body mt-4" style={{ color: "var(--color-fg-2)" }}>
            ShelfSense reads your last 90 days and your supplier lead times, and gives every
            SKU a runway: the day it empties, the day you have to order, and how many.
          </p>
        </div>

        {/* Law 2: the machine runs before the first scroll. This is the product's own
            SKU row and runway, at the size it renders on a phone. */}
        <figure className="mt-8" aria-label="A SKU row and its runway, as the product renders them">
          <div className="sku-row" style={{ borderTop: "1px solid var(--color-line)" }}>
            <span className="dot dot-rust" aria-hidden="true" />
            <span className="min-w-0">
              <span className="t-title block">Enamel camp mug · Speckled white</span>
              <span className="t-data mt-1 block" style={{ color: "var(--color-fg-2)" }}>
                OAK-MUG-03 · 0 LEFT · 0.0d COVER · ORDER 252
              </span>
            </span>
            <span className="flex flex-col items-end gap-1 text-right">
              <span className="t-data" style={{ color: "var(--color-rust)" }}>
                BY JUL 8
              </span>
              <span className="t-data" style={{ color: "var(--color-rust)" }}>
                PAST DUE
              </span>
              <span className="sweep w-14" aria-hidden="true" />
            </span>
          </div>

          <div className="pt-6">
            <div
              className="runway"
              role="img"
              aria-label="Stock reached the reorder point on Jul 8 and ran out on Aug 3"
            >
              <span className="runway-lead" style={{ left: "18%", width: "40%" }} aria-hidden="true" />
              <span className="runway-fill landing-fill" aria-hidden="true" />
              <span className="runway-notch landing-notch" aria-hidden="true" />
            </div>
            <div className="mt-3 flex justify-between">
              <span className="t-data" style={{ color: "var(--color-kraft)" }}>
                JUL 8 · REORDER POINT
              </span>
              <span className="t-data" style={{ color: "var(--color-fg-3)" }}>
                AUG 3 · EMPTY
              </span>
            </div>
          </div>
          <figcaption className="t-secondary mt-4">
            From the demo store, Oaklane Goods — a sample catalogue this app ships with, not a
            customer. It sold 4.1 a day for ten weeks, then sat empty for eighteen days.
          </figcaption>
        </figure>

        <div className="mt-8 flex flex-col gap-3">
          <Link href="/signup" className="btn btn-primary btn-full">
            {CTA}
          </Link>
          <p className="t-secondary text-center">
            No card. Read-only Shopify scopes: products, inventory, orders.
          </p>
        </div>
      </section>

      {/* -------------------------------------------------------------- tension --- */}
      <section className="screen pt-16" style={{ paddingBottom: 0 }}>
        <h2 className="t-label">The two leaks</h2>
        <p className="t-h2 mt-3">
          A stockout never appears in a Shopify report. Dead stock never sends a
          notification.
        </p>
        <div className="mt-6">
          {[
            {
              label: "Too late",
              body: "The SKU that is accelerating goes dark exactly as the ad spend peaks. The lost revenue is invisible — no report has a line for the sales you did not make.",
            },
            {
              label: "Too heavy",
              body: "The SKU that quietly died has three months of cover and a shelf full of cash. Nothing ever flags it, because nothing is wrong with it.",
            },
          ].map((item) => (
            <div key={item.label} className="hairline-t py-5">
              <p className="t-label" style={{ color: "var(--color-rust)" }}>
                {item.label}
              </p>
              <p className="t-body mt-2" style={{ color: "var(--color-fg-2)" }}>
                {item.body}
              </p>
            </div>
          ))}
        </div>
        <p className="t-secondary hairline-t pt-5">
          The scale is measured, not guessed: IHL Group puts inventory distortion at{" "}
          <a
            href="https://www.ihlservices.com/news/analyst-corner/2025/09/retail-inventory-crisis-persists-despite-172-billion-in-improvements/"
            rel="noopener noreferrer"
            target="_blank"
          >
            about $1.7 trillion a year
          </a>
          , roughly $1.2T of it out-of-stocks and $554B overstocks. Small merchants have both
          leaks and none of the tooling.
        </p>
      </section>

      {/* ---------------------------------------------------------------- proof --- */}
      <section className="screen pt-16" style={{ paddingBottom: 0 }}>
        <h2 className="t-label">The arithmetic, in dollars</h2>
        <p className="t-h2 mt-3">Revenue at risk is a number you can check by hand.</p>
        <p className="t-body mt-4" style={{ color: "var(--color-fg-2)" }}>
          One SKU, from the demo store. A PO placed today lands in eighteen days. The shelf is
          already empty. So the gap is eighteen days long, and this is what it costs:
        </p>

        <div className="panel mt-6 p-4">
          <dl>
            {[
              ["Velocity · 30d", "4.41/day", "60 units ÷ 12 in-stock days"],
              ["Stockout days excluded", "18", "an empty shelf is not evidence of no demand"],
              ["Supplier lead time", "18d", "Apex Goods Co., on file"],
              ["Dark window", "18 days", "empty today, replenished on day eighteen"],
              ["Price", "$22.00", "per unit"],
            ].map(([label, value, source]) => (
              <div key={label} className="hairline-t py-3">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="t-label">{label}</dt>
                  <dd className="t-data whitespace-nowrap">{value}</dd>
                </div>
                <p className="t-secondary mt-1" style={{ color: "var(--color-fg-3)" }}>
                  {source}
                </p>
              </div>
            ))}
          </dl>
          <div className="hairline-t mt-1 pt-4">
            <p className="t-label">Revenue at risk · 30d</p>
            <p className="t-display mt-2" style={{ color: "var(--color-paper)" }}>
              $1,745
            </p>
            <p className="t-data mt-2" style={{ color: "var(--color-fg-2)" }}>
              18 &times; 4.41 &times; $22.00
            </p>
          </div>
        </div>
        <p className="t-secondary mt-4">
          That is one SKU. Across the demo store&rsquo;s twelve the same arithmetic totals
          $13,133 — and the dashboard headline equals the sum of its rows to the cent, because
          it is the sum of its rows.
        </p>
      </section>

      {/* ------------------------------------------------------ objection killer --- */}
      <section className="screen pt-16" style={{ paddingBottom: 0 }}>
        <h2 className="t-label">The objection</h2>
        <p className="t-h2 mt-3">
          &ldquo;One wrong suggestion and I am back in the spreadsheet.&rdquo;
        </p>
        <p className="t-body mt-4" style={{ color: "var(--color-fg-2)" }}>
          Correct — which is why none of this is a black box. Every reorder point on screen
          expands to the exact inputs the nightly run used, stored on the row itself. Not
          recalculated for the panel: the same numbers, read back.
        </p>
        <div className="mt-6">
          {[
            [
              "Stockout days are excluded",
              "A SKU that sold nothing because it had nothing to sell has no observation for those days. Counting them divides a real 4-a-day best-seller down to 1.7 and under-orders it for as long as you own the tool.",
            ],
            [
              "Short history divides by short history",
              "A product launched two weeks ago is measured over fourteen days, not ninety — and labelled low confidence rather than presented as a certainty.",
            ],
            [
              "A spike leads; a slow week does not",
              "When the recent window accelerates it carries the blend. When it dips, the longer windows hold, because one quiet week is usually noise.",
            ],
            [
              "Quantities the supplier will accept",
              "Rounded up to the minimum order quantity and then to a whole pack. 130 units against MOQ 100 and packs of 24 is 144, never 130.",
            ],
          ].map(([title, body]) => (
            <div key={title} className="hairline-t py-5">
              <p className="t-title">{title}</p>
              <p className="t-secondary mt-2">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------------- pricing --- */}
      <section className="screen pt-16" style={{ paddingBottom: 0 }}>
        <h2 className="t-label">Pricing</h2>
        <p className="t-h2 mt-3">One stockout costs more than a year of this.</p>
        <p className="t-body mt-4" style={{ color: "var(--color-fg-2)" }}>
          The mug above, dark for eighteen days at 4.41 a day and $22 a unit, is{" "}
          <span className="t-mono">$1,745</span> of sales that never happened. Counter is{" "}
          <span className="t-mono">$708</span> a year.
        </p>

        <div className="mt-6 flex flex-col gap-4">
          {[
            {
              name: "Counter",
              price: "$59",
              skus: "up to 250 SKUs",
              features: [
                "Velocity + reorder points",
                "Stockout alerts",
                "Dead-stock report",
                "1 location",
              ],
            },
            {
              name: "Backroom",
              price: "$99",
              skus: "up to 1,000 SKUs",
              features: [
                "Everything in Counter",
                "Supplier profiles & lead times",
                "PO drafts (CSV or email)",
                "Seasonality-aware forecasts",
                "3 locations",
              ],
              emphasis: true,
            },
            {
              name: "Warehouse",
              price: "$199",
              skus: "up to 5,000 SKUs",
              features: [
                "Everything in Backroom",
                "PO push with supplier portal links",
                "Priority support",
              ],
            },
          ].map((plan) => (
            <div key={plan.name} className="panel p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="t-title">{plan.name}</h3>
                <span className="t-data" style={{ fontSize: 15 }}>
                  {plan.price}/MO
                </span>
              </div>
              <p className="t-data mt-1" style={{ color: "var(--color-fg-3)" }}>
                {plan.skus.toUpperCase()}
              </p>
              {plan.emphasis ? (
                <p className="t-data mt-2" style={{ color: "var(--color-kraft)" }}>
                  WHERE THE PO DRAFTS LIVE · THE TRIAL GIVES YOU THIS
                </p>
              ) : null}
              <ul className="mt-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="hairline-t py-2">
                    <span className="t-data" style={{ color: "var(--color-fg-2)" }}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="t-secondary mt-4">
          Billed through Shopify, so the charge lands on your existing Shopify invoice — there
          is no card to enter here. Cancel from the Shopify admin.
        </p>
      </section>

      {/* ----------------------------------------------------------- final CTA --- */}
      <section className="screen pt-16">
        <p className="t-h2">Know the date. Order before it.</p>
        <p className="t-body mt-3" style={{ color: "var(--color-fg-2)" }}>
          The trial opens on a revenue-at-risk figure computed from your own last 90 days. It
          sells the product with your numbers, or it does not.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Link href="/signup" className="btn btn-primary btn-full">
            {CTA}
          </Link>
          <p className="t-secondary text-center">
            No card. Read-only Shopify scopes. 14 days, then $59&ndash;$199 a month.
          </p>
        </div>

        <footer className="hairline-t mt-12 flex flex-wrap items-center justify-between gap-3 pt-6">
          <span className="t-data" style={{ color: "var(--color-fg-3)" }}>
            SHELFSENSE · INVENTORY FORECASTING FOR SHOPIFY
          </span>
          <Link href="/login" className="t-data">
            SIGN IN
          </Link>
        </footer>
      </section>
    </main>
  );
}
