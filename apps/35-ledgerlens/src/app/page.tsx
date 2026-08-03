import type { Metadata } from "next";
import Link from "next/link";
import { HeroExtract } from "@/components/marketing/HeroExtract";
import { CleanupCalculator } from "@/components/marketing/CleanupCalculator";
import { PLANS, PLAN_ORDER, formatPlanPrice } from "@/lib/plans";
import { formatCents } from "@/lib/money";
import { CATEGORY_SEEDS } from "@/lib/categorize";
import { IconCamera, IconDownload, IconFlagSmall, IconLink, IconMailIn } from "@/components/icons";

/**
 * The marketing page, to MARKETING_PLAYBOOK.md.
 *
 * Message architecture, written before the pixels:
 *  - **Enemy:** the January shoebox and the cleanup fee it costs.
 *  - **One sentence:** forward it or photo it, and your accountant gets a clean close
 *    package every month.
 *  - **Device:** the shoebox, closed by the 3rd.
 *  - **Arc:** hook (the machine running) → tension (what January costs) → proof (the
 *    artifact) → offer (priced against the fee).
 *
 * One CTA phrase, repeated verbatim at the hero, after the proof, after pricing, and in the
 * sticky mobile bar: **Start closing your books.**
 *
 * Nothing on this page is a fabricated testimonial, a fake logo or an invented usage number.
 * LedgerLens is pre-launch; the only proof shown is the product's own output, and it is
 * labelled as a demo where it is one.
 */

export const metadata: Metadata = {
  title: "LedgerLens — the shoebox, closed by the 3rd",
  description:
    "Forward an invoice, photo a receipt, and hand your accountant a clean monthly close package: PDF summary, QuickBooks and Xero CSVs, and every source image. Not accounting software.",
  alternates: { canonical: "/" },
};

const CTA = "Start closing your books";

export default function LandingPage() {
  const soloAnnual = PLANS.solo.priceCents * 12;

  return (
    <>
      <header className="screen-plain flex items-center justify-between pt-6" style={{ maxWidth: 1120 }}>
        <span className="t-label" style={{ color: "var(--color-ledger)" }}>
          LedgerLens
        </span>
        <Link href="/login" className="t-secondary" style={{ color: "var(--color-ink-2)" }}>
          Sign in
        </Link>
      </header>

      <main className="screen-plain pb-32" style={{ maxWidth: 1120 }}>
        {/* -------------------------------------------------------------- hero --- */}
        <section className="pt-8">
          <p className="t-label">Pre-accounting for solo operators</p>
          <h1 className="t-display mt-3" style={{ maxWidth: "18ch" }}>
            The shoebox, closed by the 3rd.
          </h1>
          <p className="t-body mt-4" style={{ maxWidth: "42ch", color: "var(--color-ink-2)" }}>
            Forward it or photo it — your accountant gets a clean close package every month.
            No chart of accounts, no reconciliation screens, no double entry. Keep your
            accountant; fire your shoebox.
          </p>

          <HeroExtract />

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className="btn btn-primary btn-full sm:w-auto sm:px-8">
              {CTA}
            </Link>
            <Link href="#the-artifact" className="btn btn-secondary btn-full sm:w-auto sm:px-8">
              See a close package first
            </Link>
          </div>
          <p className="t-secondary mt-3" style={{ color: "var(--color-ink-3)" }}>
            14 days, no card. Five forwarded emails and five photos is the whole trial.
          </p>
        </section>

        {/* ------------------------------------------------------------ enemy --- */}
        <section className="mt-20">
          <p className="t-label">What January costs</p>
          <h2 className="t-h2 mt-3" style={{ maxWidth: "26ch" }}>
            Twelve months in a glovebox, reconstructed by someone billing by the hour.
          </h2>
          <p className="t-body mt-4" style={{ maxWidth: "44ch", color: "var(--color-ink-2)" }}>
            The thermal paper faded. The Home Depot email got deleted. Your preparer charges a
            cleanup fee to guess at twelve months of categories, and the deductions they
            cannot substantiate quietly do not happen.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="panel p-4">
              <p className="t-label">The shoebox</p>
              <p className="t-stat mt-2" style={{ color: "var(--color-red)" }}>
                {formatCents(40000)}
              </p>
              <p className="t-secondary mt-2">
                One typical cleanup fee for a year of unsorted receipts. Categories are a
                professional&rsquo;s best guess, in April, from what survived.
              </p>
            </div>
            <div className="panel p-4">
              <p className="t-label">Twelve months of LedgerLens</p>
              <p className="t-stat mt-2" style={{ color: "var(--color-ledger)" }}>
                {formatCents(soloAnnual)}
              </p>
              <p className="t-secondary mt-2">
                Every document captured the day it happened, categorised while you still
                remember what it was for, and closed monthly.
              </p>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------- math --- */}
        <section className="mt-20">
          <p className="t-label">Your arithmetic, not ours</p>
          <h2 className="t-h2 mt-3">What is your shoebox actually costing?</h2>
          <CleanupCalculator />
        </section>

        {/* ------------------------------------------------------- how it works --- */}
        <section className="mt-20">
          <p className="t-label">The whole product</p>
          <h2 className="t-h2 mt-3">Two ways in, one thing out.</h2>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              {
                Icon: IconMailIn,
                title: "Forward an email",
                body: "Every org gets docs+yourname@in.ledgerlens.app. Attachments, or a bare HTML invoice with the total in the body — both are captured. Forward the same thing twice and you get one entry and one duplicate record, never two entries.",
              },
              {
                Icon: IconCamera,
                title: "Photo a receipt",
                body: "The camera opens straight from the home screen. A soft photo is refused before it is uploaded, not after a model has failed on it — retake takes two seconds, a wrong total costs an audit.",
              },
              {
                Icon: IconDownload,
                title: "Hand over the package",
                body: "On the 1st: a PDF cover with totals by Schedule C line, a QuickBooks CSV, a Xero CSV, and a folder of every original image. Zipped, and downloadable by your accountant from a read-only link.",
              },
            ].map(({ Icon, title, body }) => (
              <div key={title} className="panel p-4">
                <Icon size={20} style={{ color: "var(--color-ledger)" }} />
                <h3 className="t-title mt-3">{title}</h3>
                <p className="t-secondary mt-2">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------- the proof --- */}
        <section id="the-artifact" className="mt-20 scroll-mt-8">
          <p className="t-label">The artifact</p>
          <h2 className="t-h2 mt-3">This is what your accountant receives.</h2>
          <p className="t-secondary mt-2" style={{ maxWidth: "46ch" }}>
            A staged demo built from our own dogfood books — LedgerLens is pre-launch, so there
            are no customer numbers to show you and we are not going to invent any. The layout,
            the categories and the Schedule C lines are exactly what the product produces.
          </p>

          <div className="panel mt-6 p-4" style={{ maxWidth: 520 }}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="t-label">March 2026 close · demo</span>
              <span className="t-data" style={{ color: "var(--color-ink-3)" }}>
                v1 · 2026-04-01
              </span>
            </div>
            <p className="t-stat mt-1" style={{ color: "var(--color-ledger)" }}>
              $4,182<span className="cents">.66</span>
            </p>
            <p className="t-secondary mt-1">31 confirmed entries · $312.44 tax</p>

            <div className="mt-4 hairline-t">
              {[
                ["Supplies", "22", "$1,884.12"],
                ["Fuel", "9", "$928.40"],
                ["Rent — vehicles & equipment", "20a", "$612.00"],
                ["Utilities", "25", "$388.19"],
                ["Insurance", "15", "$204.00"],
                ["Meals", "24b", "$92.95"],
                ["Office expense", "18", "$73.00"],
              ].map(([name, line, amount]) => (
                <div
                  key={name}
                  className="flex items-baseline justify-between gap-3 border-b py-2.5"
                  style={{ borderColor: "var(--color-line)" }}
                >
                  <span className="min-w-0">
                    <span className="t-body block truncate">{name}</span>
                    <span className="t-data block" style={{ color: "var(--color-ink-3)" }}>
                      Schedule C {line}
                    </span>
                  </span>
                  <span className="t-mono shrink-0 text-[15px]">{amount}</span>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-3 py-3">
                <span className="t-title">Total</span>
                <span className="t-mono text-[17px]" style={{ color: "var(--color-ledger)" }}>
                  $4,182.66
                </span>
              </div>
              <span style={{ display: "block", height: 1.5, background: "var(--color-ledger)" }} aria-hidden="true" />
            </div>

            <div className="mt-5">
              <span className="t-label">In the package</span>
              <div className="mt-2 hairline-t">
                {[
                  "ledgerlens-2026-03-summary.pdf",
                  "ledgerlens-2026-03.csv",
                  "ledgerlens-2026-03-quickbooks.csv",
                  "ledgerlens-2026-03-xero.csv",
                  "sources/ — 31 originals",
                ].map((file) => (
                  <p
                    key={file}
                    className="t-data flex items-center gap-2 border-b py-2.5"
                    style={{ borderColor: "var(--color-line)" }}
                  >
                    <IconDownload size={16} style={{ color: "var(--color-ledger)", flex: "none" }} />
                    <span className="truncate">{file}</span>
                  </p>
                ))}
              </div>
            </div>

            <p className="t-secondary mt-4" style={{ color: "var(--color-ink-3)" }}>
              Prepared with LedgerLens.
            </p>
          </div>

          <div className="mt-6">
            <Link href="/signup" className="btn btn-primary btn-full sm:w-auto sm:px-8">
              {CTA}
            </Link>
          </div>
        </section>

        {/* ------------------------------------------------------ the objection --- */}
        <section className="mt-20">
          <p className="t-label">The obvious objection</p>
          <h2 className="t-h2 mt-3" style={{ maxWidth: "24ch" }}>
            &ldquo;What if the AI reads it wrong?&rdquo;
          </h2>
          <p className="t-body mt-4" style={{ maxWidth: "46ch", color: "var(--color-ink-2)" }}>
            Then it says so. Every field carries a confidence score, and anything under the
            threshold lands in a review queue instead of your books.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="panel p-4">
              <IconFlagSmall size={20} style={{ color: "var(--color-flag)" }} />
              <h3 className="t-title mt-3">Flagged, never guessed</h3>
              <p className="t-secondary mt-2">
                A smudged total is a flag and a number — &ldquo;total · 61%&rdquo; — not a
                confident entry. Tap any figure to see the line it was read from. Nothing
                unreviewed reaches an export: the close refuses to build until the queue is
                clear, and if you force it, the unreviewed documents are named in the PDF and
                left out of the totals.
              </p>
            </div>
            <div className="panel p-4">
              <IconLink size={20} style={{ color: "var(--color-ledger)" }} />
              <h3 className="t-title mt-3">It gets quieter every month</h3>
              <p className="t-secondary mt-2">
                Correct a category once — &ldquo;this Shell station is Fuel, not Meals&rdquo; —
                and it becomes a permanent rule for that vendor. Next month&rsquo;s identical
                receipt skips review entirely. Month six asks less than month one.
              </p>
            </div>
          </div>

          <p className="t-secondary mt-6" style={{ maxWidth: "50ch", color: "var(--color-ink-3)" }}>
            Categories map to real IRS Schedule C lines — {CATEGORY_SEEDS.length} of them,
            from Advertising (line 8) to Other expenses (27a). LedgerLens prepares the file;
            a professional files the return. Nothing here is tax advice.
          </p>
        </section>

        {/* ----------------------------------------------------------- pricing --- */}
        <section className="mt-20">
          <p className="t-label">Pricing</p>
          <h2 className="t-h2 mt-3">Less than one January.</h2>
          <p className="t-secondary mt-2" style={{ maxWidth: "44ch" }}>
            Tiered by document volume, because that is the only honest axis. Annual billing is
            two months free. Documents past your cap queue until the next cycle — never a
            surprise bill, never your data held hostage.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {PLAN_ORDER.map((id) => (
              <div key={id} className="panel p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="t-title">{PLANS[id].name}</span>
                  <span className="t-mono text-[17px]">{formatPlanPrice(id)}</span>
                </div>
                <p className="t-data mt-1" style={{ color: "var(--color-ink-3)" }}>
                  up to {PLANS[id].documentCap} documents / month
                </p>
                <p className="t-secondary mt-3">{PLANS[id].blurb}</p>
                <p className="t-data mt-3" style={{ color: "var(--color-ink-3)" }}>
                  {formatCents(PLANS[id].priceCents * 10)} / year billed annually
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <Link href="/signup" className="btn btn-primary btn-full sm:w-auto sm:px-8">
              {CTA}
            </Link>
          </div>
          <p className="t-secondary mt-3" style={{ color: "var(--color-ink-3)" }}>
            No free tier. The $19 floor is there so the queue belongs to people with an actual
            shoebox problem.
          </p>
        </section>

        {/* -------------------------------------------------------- final claim --- */}
        <section className="mt-20">
          <h2 className="t-display" style={{ maxWidth: "20ch" }}>
            Keep your accountant. Fire your shoebox.
          </h2>
          <p className="t-body mt-4" style={{ maxWidth: "40ch", color: "var(--color-ink-2)" }}>
            LedgerLens is not accounting software and never will be. It is the pipeline between
            the receipt in your hand and the person who files your return.
          </p>
          <div className="mt-6">
            <Link href="/signup" className="btn btn-primary btn-full sm:w-auto sm:px-8">
              {CTA}
            </Link>
          </div>
        </section>

        <footer className="mt-20 hairline-t pt-6">
          <p className="t-secondary" style={{ color: "var(--color-ink-3)" }}>
            LedgerLens · pre-accounting for solo operators. Schedule C categorisation is a
            preparation aid, not tax advice.
          </p>
          <p className="t-secondary mt-2">
            <Link href="/login">Sign in</Link>
          </p>
        </footer>
      </main>

      {/* The sticky mobile bar: same CTA phrase, in the thumb zone. */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 p-4 sm:hidden"
        style={{
          background: "color-mix(in srgb, var(--color-stock) 94%, transparent)",
          backdropFilter: "blur(12px)",
          borderTop: "1px solid var(--color-line)",
          paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
        }}
      >
        <Link href="/signup" className="btn btn-primary btn-full">
          {CTA}
        </Link>
      </div>
    </>
  );
}
