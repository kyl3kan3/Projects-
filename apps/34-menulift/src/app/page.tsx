import type { Metadata } from "next";
import Link from "next/link";
import { HeroMenu } from "@/components/marketing/HeroMenu";
import { DemoMatrix } from "@/components/marketing/DemoMatrix";
import { PLANS, PLAN_IDS, monthlyTotalCents } from "@/lib/plans";
import { money } from "@/lib/format";
import { IconCheck } from "@/components/icons";

/**
 * Landing page, to MARKETING_PLAYBOOK.md.
 *
 *  - **Enemy:** the laminated menu that lags reality by weeks, and not knowing
 *    which dishes pay the rent.
 *  - **One sentence:** your menu, live in seconds and quadranted by margin.
 *  - **Device:** stars → dogs. Used in the hero, the proof, and the pricing math.
 *  - **CTA phrase, repeated verbatim four times:** "Start the 14-day trial".
 *  - **Four animated beats only:** the 86 sweep drawing itself in the hero, the
 *    quadrant dots landing, the reprint math, and nothing else. Everything
 *    collapses under `prefers-reduced-motion`.
 *
 * No testimonials, no logos, no usage numbers: this product is pre-launch and
 * every receipt on this page is its own output, labelled as a demo.
 */

export const metadata: Metadata = {
  title: "MenuLift — your menu, live in seconds and quadranted by margin",
  description:
    "A QR menu that loads before the water arrives, one-tap 86ing that reaches every phone in seconds, and the stars/plowhorses/puzzles/dogs matrix from a POS export you already know how to run.",
};

const CTA = "Start the 14-day trial";

function Cta({ tone = "primary" }: { tone?: "primary" | "secondary" }) {
  return (
    <Link
      href="/signup"
      className={`btn ${tone === "primary" ? "btn-primary" : "btn-secondary"}`}
      style={{ textDecoration: "none" }}
    >
      {CTA}
    </Link>
  );
}

export default function LandingPage() {
  const reprintLowCents = 20000;
  const reprintHighCents = 50000;
  const menuYearCents = PLANS.menu.priceCents * 12;

  return (
    <div style={{ paddingBottom: 80 }}>
      <header className="screen" style={{ paddingTop: 24, maxWidth: 1200, margin: "0 auto" }}>
        <nav style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <p className="t-label" style={{ margin: 0, flex: 1 }}>
            MenuLift
          </p>
          <Link href="/login" className="btn-quiet" style={{ color: "var(--fg-2)" }}>
            Sign in
          </Link>
        </nav>
      </header>

      {/* ---- Hero: the machine running, above anything we claim about it ---- */}
      <main className="screen" style={{ maxWidth: 1200, margin: "0 auto" }}>
        <section
          style={{
            paddingTop: 40,
            display: "grid",
            gap: 40,
            gridTemplateColumns: "minmax(0, 1fr)",
          }}
        >
          <div>
            <h1 className="t-display" style={{ margin: 0, maxWidth: "14em" }}>
              The kitchen ran out at 7:40. The menu knew at 7:40.
            </h1>
            <p className="t-body" style={{ marginTop: 20, maxWidth: "34em", fontSize: 17 }}>
              A QR menu that loads before the water arrives, one tap to 86 a dish from the pass, and
              the margin math that tells you which plates actually pay the rent. No app, no PDF, no
              trip to the print shop.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
              <Cta />
              <Link href="#matrix" className="btn btn-secondary" style={{ textDecoration: "none" }}>
                See the matrix first
              </Link>
            </div>
            <p className="t-secondary" style={{ marginTop: 12 }}>
              No card to start. Less than one reprint run per month after that.
            </p>
          </div>

          <div style={{ display: "flex", justifyContent: "center" }}>
            <HeroMenu />
          </div>
        </section>

        {/* ---- The device ---- */}
        <section id="matrix" className="hairline-t" style={{ marginTop: 80, paddingTop: 40 }}>
          <p className="t-label" style={{ margin: 0 }}>
            The device
          </p>
          <h2 className="t-h2" style={{ marginTop: 12, marginBottom: 12, maxWidth: "22em" }}>
            Your menu, quadranted: stars to dogs
          </h2>
          <p className="t-body" style={{ marginTop: 0, marginBottom: 32, maxWidth: "34em" }}>
            Popularity across, margin up. Every hospitality programme teaches this analysis; almost
            nobody runs it, because it means joining what the POS knows to what the invoices know.
            Upload one CSV, enter your plate costs, and it runs itself.
          </p>
          <div style={{ maxWidth: 480 }}>
            <DemoMatrix />
          </div>
        </section>

        {/* ---- The math ---- */}
        <section className="hairline-t" style={{ marginTop: 80, paddingTop: 40 }}>
          <p className="t-label" style={{ margin: 0 }}>
            The math
          </p>
          <h2 className="t-h2" style={{ marginTop: 12, marginBottom: 24, maxWidth: "22em" }}>
            One reprint cycle buys a year of never reprinting
          </h2>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, maxWidth: 480 }}>
            {[
              ["One reprint run", `${money(reprintLowCents)}–${money(reprintHighCents)}`, "and it's stale within weeks"],
              [`MenuLift ${PLANS.menu.name}, a whole year`, money(menuYearCents), "one location, changed as often as you like"],
            ].map(([label, value, note]) => (
              <li key={label} className="row" style={{ display: "block" }}>
                <span style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
                  <span className="t-body" style={{ flex: 1 }}>
                    {label}
                  </span>
                  <span className="t-data" style={{ flex: "0 0 auto" }}>
                    {value}
                  </span>
                </span>
                <span className="t-secondary" style={{ display: "block", marginTop: 4 }}>
                  {note}
                </span>
              </li>
            ))}
          </ul>
          <p className="t-secondary" style={{ marginTop: 16, maxWidth: "34em" }}>
            Print-shop figures are typical independent-restaurant ranges, not a quote — get yours and
            do this arithmetic with real numbers. The point holds either way.
          </p>
          <div style={{ marginTop: 24 }}>
            <Cta />
          </div>
        </section>

        {/* ---- Receipts: what the product does, in its own words ---- */}
        <section className="hairline-t" style={{ marginTop: 80, paddingTop: 40 }}>
          <p className="t-label" style={{ margin: 0 }}>
            What it does
          </p>
          <div style={{ display: "grid", gap: 32, marginTop: 24 }}>
            {[
              {
                title: "One tap, live everywhere",
                body: "The 86 board is a phone screen for the expo station. A tap strikes the dish, and every live QR menu regenerates immediately — not on a five-minute timer. At 4am local time, everything comes back, unless you said it shouldn't.",
              },
              {
                title: "Change history you didn't have to turn on",
                body: "Every price, description, dietary tag, 86, and photo decision writes a row with a name and a timestamp. There is no way to change a price quietly.",
              },
              {
                title: "Photos you approve, or don't",
                body: "A phone snap goes through relight and a consistent crop, and you see before and after on a slider. Nothing reaches a guest without you pressing approve, and a shot too dark to save is told to you plainly instead of published badly.",
              },
              {
                title: "An analysis that admits what it can't know",
                body: "A dish that sold nine times is not a dog — it's unmeasured, and the matrix says so instead of guessing. Same for a plate with no cost entered. Refusing to answer is the feature.",
              },
            ].map((feature) => (
              <article key={feature.title} style={{ maxWidth: "34em" }}>
                <h3 className="t-dish" style={{ margin: 0 }}>
                  {feature.title}
                </h3>
                <p className="t-body" style={{ marginTop: 8, marginBottom: 0, color: "var(--fg-2)" }}>
                  {feature.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* ---- Objection killer ---- */}
        <section className="hairline-t" style={{ marginTop: 80, paddingTop: 40 }}>
          <p className="t-label" style={{ margin: 0 }}>
            The obvious objection
          </p>
          <h2 className="t-h2" style={{ marginTop: 12, marginBottom: 16, maxWidth: "22em" }}>
            &ldquo;Guests hate QR menus.&rdquo;
          </h2>
          <p className="t-body" style={{ margin: 0, maxWidth: "34em" }}>
            Guests hate <em>pinch-zooming a PDF in a dim room</em>. That is a different complaint, and
            it is the one this fixes: real text at 17px, prices in a mono column you can scan like a
            receipt, a dark variant when the phone is dark, and no spinner between a hungry guest and
            the food. Paper still ships too — table tents and window cards are vector PDFs in the base
            tier, because the print shop is the incumbent and pretending otherwise is how you lose the
            room.
          </p>
        </section>

        {/* ---- Pricing ---- */}
        <section className="hairline-t" style={{ marginTop: 80, paddingTop: 40 }}>
          <p className="t-label" style={{ margin: 0 }}>
            Pricing
          </p>
          <h2 className="t-h2" style={{ marginTop: 12, marginBottom: 8 }}>
            Per location, per month
          </h2>
          <p className="t-secondary" style={{ marginTop: 0, marginBottom: 24 }}>
            14 days free on every tier. 20% off every location past the first — three sites on Margin
            is {money(monthlyTotalCents("margin", 3))} a month, one invoice.
          </p>
          <div style={{ display: "grid", gap: 16, maxWidth: 480 }}>
            {PLAN_IDS.map((id) => {
              const plan = PLANS[id];
              return (
                <section key={id} className="card" style={{ padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                    <h3 className="t-dish" style={{ margin: 0, flex: 1 }}>
                      {plan.name}
                    </h3>
                    <p className="t-data" style={{ margin: 0 }}>
                      {money(plan.priceCents)}/mo
                    </p>
                  </div>
                  <p className="t-secondary" style={{ margin: "4px 0 12px" }}>
                    {plan.tagline}
                  </p>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
                    {plan.adds.map((line) => (
                      <li key={line} className="t-secondary" style={{ display: "flex", gap: 8 }}>
                        <span style={{ color: "#5f7e4e", flex: "0 0 auto" }}>
                          <IconCheck size={16} />
                        </span>
                        {line}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
          <div style={{ marginTop: 24 }}>
            <Cta />
          </div>
        </section>

        {/* ---- Final CTA ---- */}
        <section className="hairline-t" style={{ marginTop: 80, paddingTop: 40 }}>
          <h2 className="t-display" style={{ margin: 0, maxWidth: "16em" }}>
            Put tonight&apos;s menu where tonight&apos;s guests are.
          </h2>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
            <Cta />
            <Link href="/login" className="btn btn-secondary" style={{ textDecoration: "none" }}>
              Sign in
            </Link>
          </div>
        </section>
      </main>

      <footer className="screen hairline-t" style={{ maxWidth: 1200, margin: "56px auto 0", paddingTop: 24 }}>
        <p className="t-secondary" style={{ margin: 0 }}>
          MenuLift is pre-launch. Every number and every screen on this page is the product&apos;s own
          output on a demo restaurant — there are no customer testimonials here because there are no
          customers yet.
        </p>
      </footer>
    </div>
  );
}
