import type { Metadata } from "next";
import Link from "next/link";
import { HeroDemo } from "@/components/marketing/HeroDemo";
import { IconCheck, TallyMark } from "@/components/icons";
import { annualCents, effectiveMonthlyCents, PAID_PLANS, PLANS } from "@/lib/plans";
import { templatesFor } from "@/lib/questionnaire";
import { FACTOR_SEEDS } from "@/db/factors";

export const metadata: Metadata = {
  title: "GreenTally — the questionnaire answered before lunch",
  description:
    "Your customer wants your carbon number by Friday. Upload the bills, get a defensible Scope 1/2/3 footprint, a CSRD-lite PDF, and ready-to-paste answers — every figure traceable to the bill and the published factor behind it.",
};

/**
 * The landing page, built last, to MARKETING_PLAYBOOK.md.
 *
 *  - **Enemy:** the unanswered supplier questionnaire with a deadline on it — and the
 *    $10k–$30k consultant quote that is the only other way out.
 *  - **One sentence:** your customer's carbon questionnaire, answered before lunch, with
 *    every number traceable to the bill it came from.
 *  - **Device:** the questionnaire answered before lunch.
 *  - **One CTA phrase, repeated verbatim:** "Start the footprint preview".
 *  - **Four animated beats only:** the bill resolving, the figure landing, the thread
 *    drawing, the answer appearing. Everything else is typeset and still.
 *  - **Receipts:** the product's own staged output, labelled a staged demo. No
 *    testimonials, no logos, no usage numbers — this product is pre-launch and saying
 *    otherwise would be a debt it never pays off.
 */
const CTA = "Start the footprint preview";

const money = (cents: number) => `$${(cents / 100).toFixed(0)}`;

export default function LandingPage() {
  const answerCount = templatesFor("custom").length;
  const factorCount = FACTOR_SEEDS.length;

  return (
    <>
      <header className="screen-plain flex items-center justify-between pt-6" style={{ maxWidth: 1120 }}>
        <span className="flex items-center gap-2" style={{ color: "var(--color-accent-text)" }}>
          <TallyMark size={22} />
          <span className="t-label" style={{ color: "var(--color-accent-text)" }}>
            GreenTally
          </span>
        </span>
        <Link href="/login" className="t-secondary" style={{ fontWeight: 600 }}>
          Sign in
        </Link>
      </header>

      {/* ---------------------------------------------------------------- hero */}
      <main>
        <section className="screen-plain pt-10" style={{ maxWidth: 1120 }}>
          <div className="lg:flex lg:items-start lg:gap-16">
            <div className="lg:flex-1">
              <p className="t-label">Supplier sustainability questionnaires</p>
              <h1 className="t-h1 mt-3" style={{ maxWidth: "22ch" }}>
                Your customer wants your carbon number by Friday.
              </h1>
              <p className="t-body mt-5" style={{ maxWidth: "44ch" }}>
                Upload the utility bills and a spend export. Get a defensible Scope 1/2
                footprint with a spend-based Scope 3 screen, a CSRD-lite PDF, and{" "}
                {answerCount} ready-to-paste answers — each one carrying the bill and the
                published factor it came from.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/signup" className="btn btn-primary">
                  {CTA}
                </Link>
                <Link href="#the-math" className="btn btn-secondary">
                  See the arithmetic
                </Link>
              </div>
              <p className="t-secondary mt-3">
                No card. One bill in, a real partial number out, in the first session.
              </p>
            </div>

            <div className="mt-10 lg:mt-0 lg:flex-1">
              <HeroDemo />
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------- enemy */}
        <section className="screen-plain mt-20" style={{ maxWidth: 1120 }}>
          <h2 className="t-h2" style={{ maxWidth: "26ch" }}>
            The form is not the problem. The deadline on it is.
          </h2>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="row-plain">
              <p className="t-title">Ignore it</p>
              <p className="t-secondary mt-2" style={{ maxWidth: "36ch" }}>
                Procurement scorecards increasingly gate a contract on a submitted response,
                not a good one. A blank field reads as non-compliant.
              </p>
            </div>
            <div className="row-plain">
              <p className="t-title">Hire a consultant</p>
              <p className="t-secondary mt-2" style={{ maxWidth: "36ch" }}>
                A first footprint plus questionnaire support is typically quoted at
                $10,000–$30,000, and it recurs every year the customer asks again.
              </p>
            </div>
            <div className="row-plain">
              <p className="t-title">Buy enterprise carbon software</p>
              <p className="t-secondary mt-2" style={{ maxWidth: "36ch" }}>
                Priced and sold for sustainability teams, with implementations measured in
                months. Your deadline is measured in days.
              </p>
            </div>
          </div>
          <p className="t-body mt-8" style={{ maxWidth: "52ch" }}>
            The actual job is small and mechanical: twelve months of bills, a general-ledger
            export, published emission factors, arithmetic, and a document that survives a
            procurement analyst reading it carefully. That is a product, not an engagement.
          </p>
        </section>

        {/* ------------------------------------------------------------ the math */}
        <section id="the-math" className="screen-plain mt-20" style={{ maxWidth: 1120 }}>
          <p className="t-label">The arithmetic</p>
          <h2 className="t-h2 mt-3">What the alternative costs</h2>
          <div className="mt-6 scroll-x">
            <table className="report-table" style={{ minWidth: 480 }}>
              <thead>
                <tr>
                  <th>Route</th>
                  <th className="num">Year one</th>
                  <th className="num">Every year after</th>
                  <th>Time to a document</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Boutique carbon consultant</td>
                  <td className="num">$10,000–$30,000</td>
                  <td className="num">$10,000–$30,000</td>
                  <td>6–12 weeks</td>
                </tr>
                <tr>
                  <td>Enterprise carbon platform</td>
                  <td className="num">$30,000+</td>
                  <td className="num">$30,000+</td>
                  <td>Months, after a sales cycle</td>
                </tr>
                <tr>
                  <td>GreenTally Standard, billed annually</td>
                  <td className="num">{money(annualCents("standard"))}</td>
                  <td className="num">{money(annualCents("standard"))}</td>
                  <td>Bills Monday, PDF Friday</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="t-secondary mt-3" style={{ maxWidth: "56ch" }}>
            Consultant and platform ranges are typical published market pricing for a first
            SMB footprint with questionnaire support, not quotes we have collected. Ours is
            the price on this page.
          </p>
          <p className="t-body mt-6" style={{ maxWidth: "48ch" }}>
            One enterprise contract kept is worth more than every line above. That is the
            whole business case, and it is the reason nobody asks procurement for approval
            to buy this.
          </p>
        </section>

        {/* ------------------------------------------------------------ receipts */}
        <section className="screen-plain mt-20" style={{ maxWidth: 1120 }}>
          <p className="t-label">What comes out</p>
          <h2 className="t-h2 mt-3" style={{ maxWidth: "24ch" }}>
            A number, and the paper trail underneath it
          </h2>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="panel p-4">
              <p className="t-label">Report cover, staged demo</p>
              <p className="t-h2 mt-3">Meserole Precision LLC</p>
              <p className="t-secondary">Reporting year 2025</p>
              <p className="t-mono mt-4" style={{ fontSize: 34, fontWeight: 500, lineHeight: 1 }}>
                106.0 <span style={{ fontSize: 14 }}>tCO2e</span>
              </p>
              <p className="t-data mt-3" style={{ color: "var(--color-fg-2)" }}>
                SCOPE 1 22.1 · SCOPE 2 (MARKET) 41.5 · SCOPE 3 (SCREEN) 42.4
              </p>
              <p className="report-note mt-4" style={{ maxWidth: "46ch" }}>
                <strong>This report is not assured.</strong> No third party has verified these
                figures. Scope 3 is a spend-based screening estimate and is labelled as such
                everywhere it appears.
              </p>
              <p className="t-secondary mt-4">
                A fictional 42-person Brooklyn machine shop, computed by the engine that
                ships. Not a customer.
              </p>
            </div>

            <div className="panel p-4">
              <p className="t-label">CDP-STYLE C6.2 — staged demo</p>
              <p className="t-title mt-3" style={{ maxWidth: "42ch" }}>
                Describe your organisation&apos;s approach to reporting Scope 2 emissions.
              </p>
              <p className="t-body mt-3" style={{ maxWidth: "46ch" }}>
                We report both methods, as the Scope 2 Guidance requires. Location-based
                figures use grid-average emission rates for each site&apos;s grid region.
                Market-based figures credit electricity covered by contractual instruments at
                zero and apply the same grid rate to the remainder. Brooklyn shop: 35% covered
                by a named supply agreement.
              </p>
              <p className="t-data mt-4" style={{ color: "var(--color-accent-text)" }}>
                SOURCES — eGRID NYCW factor · the contract, named · both Scope 2 figures
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            {[
              [
                `${factorCount} published factors, bundled`,
                "EPA, eGRID, DEFRA and USEEIO, each row carrying its publisher, table and vintage. No runtime dependency on a factor API.",
              ],
              [
                "Both Scope 2 methods, always",
                "Location and market based, side by side, with the contractual instrument named. Reporting one of them is the fastest way to get a form sent back.",
              ],
              [
                "Nothing accepted silently",
                "A reading below the confidence threshold, or one that fails a unit-plausibility, period-continuity or duplicate check, waits for a person.",
              ],
            ].map(([title, body]) => (
              <div key={title} className="row-plain">
                <p className="t-title">{title}</p>
                <p className="t-secondary mt-2" style={{ maxWidth: "36ch" }}>
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------ objection killer */}
        <section className="screen-plain mt-20" style={{ maxWidth: 1120 }}>
          <p className="t-label">The objection</p>
          <h2 className="t-h2 mt-3" style={{ maxWidth: "28ch" }}>
            “A $199 tool&apos;s report will get dismissed.”
          </h2>
          <p className="t-body mt-5" style={{ maxWidth: "52ch" }}>
            It would, if it read like one. What survives a careful reader is not polish — it
            is a document that states its own limits before you can find them.
          </p>
          <ul className="mt-6">
            {[
              "Every figure links to the invoice, the quantity as printed, the unit conversion, and the published factor with its vintage.",
              "Scope 3 is labelled a screening estimate, in those words, with its uncertainty stated.",
              "Coverage gaps are named month by month instead of extrapolated.",
              "“This report is not assured” is on the cover, not in a footnote.",
              "Spend on electricity and fuel is excluded from Scope 3 because your bills already counted it — the double-count nobody notices.",
            ].map((line) => (
              <li key={line} className="flex items-start gap-3 py-2">
                <span className="mark-accepted" style={{ marginTop: 3 }}>
                  <IconCheck size={16} />
                </span>
                <span className="t-body" style={{ maxWidth: "50ch" }}>
                  {line}
                </span>
              </li>
            ))}
          </ul>
          <Link href="/signup" className="btn btn-primary mt-8">
            {CTA}
          </Link>
        </section>

        {/* ------------------------------------------------------------- pricing */}
        <section className="screen-plain mt-20" style={{ maxWidth: 1120 }}>
          <p className="t-label">Pricing</p>
          <h2 className="t-h2 mt-3">Annual billing is ten months for twelve</h2>
          <p className="t-secondary mt-2" style={{ maxWidth: "48ch" }}>
            The job recurs with the reporting cycle, which is the only reason the discount
            exists.
          </p>

          <div className="mt-8 flex flex-col gap-6 lg:flex-row">
            {PAID_PLANS.map((id) => (
              <section key={id} className="panel flex-1 p-4">
                <p className="t-label">{PLANS[id].name}</p>
                <p className="t-mono mt-3" style={{ fontSize: 30, fontWeight: 500, lineHeight: 1 }}>
                  {money(effectiveMonthlyCents(id, "year"))}
                  <span className="t-secondary" style={{ fontSize: 13 }}> /mo</span>
                </p>
                <p className="t-data mt-1" style={{ color: "var(--color-fg-2)" }}>
                  {money(annualCents(id))} ANNUALLY · {money(PLANS[id].monthlyCents)}/MO MONTHLY
                </p>
                <p className="t-secondary mt-3" style={{ maxWidth: "36ch" }}>
                  {PLANS[id].blurb}
                </p>
                <ul className="mt-4">
                  {PLANS[id].features.map((f) => (
                    <li key={f} className="flex items-start gap-2 py-1">
                      <span className="mark-accepted" style={{ marginTop: 2 }}>
                        <IconCheck size={16} />
                      </span>
                      <span className="t-body">{f}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="panel mt-6 p-4">
            <p className="t-label">Free — {PLANS.preview.name}</p>
            <p className="t-body mt-2" style={{ maxWidth: "52ch" }}>
              One site, one utility bill, a real partial Scope 2 figure with the factor it came
              from, and a watermarked report cover. No card, no expiry, and no invented number
              — the preview says exactly what it is not.
            </p>
            <Link href="/signup" className="btn btn-secondary mt-4">
              {CTA}
            </Link>
          </div>
        </section>

        {/* ----------------------------------------------------------- final CTA */}
        <section className="screen-plain mt-20 pb-32 lg:pb-24" style={{ maxWidth: 1120 }}>
          <h2 className="t-h1" style={{ maxWidth: "20ch" }}>
            Answer the form. Keep the contract.
          </h2>
          <p className="t-body mt-5" style={{ maxWidth: "44ch" }}>
            Bills in on Monday, a defensible PDF and {answerCount} mapped answers by Friday.
            Every number traceable to the bill it came from.
          </p>
          <Link href="/signup" className="btn btn-primary mt-8">
            {CTA}
          </Link>
        </section>
      </main>

      <footer className="hairline-t">
        <div className="screen-plain flex flex-col gap-2 py-8" style={{ maxWidth: 1120 }}>
          <span className="flex items-center gap-2" style={{ color: "var(--color-accent-text)" }}>
            <TallyMark size={18} />
            <span className="t-label" style={{ color: "var(--color-accent-text)" }}>
              GreenTally
            </span>
          </span>
          <p className="t-secondary" style={{ maxWidth: "56ch" }}>
            Carbon reporting for SMBs under supplier pressure. Not an assurance provider; the
            reports GreenTally produces are self-prepared inventories and say so on their
            cover.
          </p>
          <p className="t-secondary">
            <Link href="/login">Sign in</Link> · <Link href="/signup">{CTA}</Link>
          </p>
        </div>
      </footer>

      {/* Sticky mobile CTA — same words, every time */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 lg:hidden"
        style={{
          padding: "12px var(--gutter) calc(12px + env(safe-area-inset-bottom))",
          background: "color-mix(in srgb, var(--color-bg) 96%, transparent)",
          backdropFilter: "blur(12px)",
          borderTop: "1px solid var(--color-line)",
        }}
      >
        <Link href="/signup" className="btn btn-primary btn-full">
          {CTA}
        </Link>
      </div>
    </>
  );
}
