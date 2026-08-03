import type { Metadata } from "next";
import Link from "next/link";
import { IconFile } from "@/components/icons";
import { UnfurlDevice } from "@/components/marketing/UnfurlDevice";
import { formatPlanPrice, planSpec, PAID_PLANS } from "@/lib/plans";

/**
 * The landing page, built last and to MARKETING_PLAYBOOK.md.
 *
 * Enemy: the critical date that lived only in the contract PDF.
 * One sentence: the contract's dates become a computed timeline the moment the
 * deal opens, and every party gets reminded before every date.
 * Arc: hook → tension → proof → offer. One CTA phrase, verbatim everywhere:
 * "Start free — 14 days". Every artefact on this page is this product's own
 * output on demo data, labelled as such — there are no customers to quote yet
 * and inventing some would be a debt the brand never pays off.
 */
export const metadata: Metadata = {
  title: "ListingLoop — every deadline on the contract, on one line",
  description:
    "Transaction coordination for real-estate agents and TCs. Enter the contract date and eleven deadlines compute themselves — business days, observed holidays, and a diff preview before anything moves.",
};

const CTA = "Start free — 14 days";

export default function LandingPage() {
  return (
    <>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 pt-6">
        <span className="inline-flex items-center gap-2">
          <IconFile size={22} />
          <span className="t-title">ListingLoop</span>
        </span>
        <nav className="flex items-center gap-4">
          <Link href="/login" className="btn-quiet">
            Sign in
          </Link>
          <Link href="/signup" className="btn btn-primary btn-sm hidden sm:inline-flex">
            {CTA}
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-32 lg:pb-20">
        {/* ---------------------------------------------------------- hero */}
        <section className="pt-12 lg:pt-16">
          <h1 className="t-hero max-w-3xl">Every deadline on the contract, on one line.</h1>
          <p className="t-body mt-5 max-w-2xl text-dim">
            Enter the contract date. Eleven deadlines compute themselves — business days counted,
            observed holidays skipped, weekend rolls handled — and every party gets reminded before
            every date without anyone remembering anything.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <Link href="/signup" className="btn btn-primary">
              {CTA}
            </Link>
            <span className="t-secondary">No card. Four starter checklists on arrival.</span>
          </div>

          <div className="mt-10">
            <UnfurlDevice />
          </div>
          <p className="t-secondary mt-2">
            A real file computed by the shipping engine, on demo data. Nothing above is a mockup.
          </p>
        </section>

        {/* --------------------------------------------------- the enemy */}
        <section className="mt-24 max-w-3xl">
          <p className="t-label">The enemy</p>
          <h2 className="t-display mt-2">The critical date that lived only in the contract PDF.</h2>
          <p className="t-body mt-4 text-dim">
            A residential deal carries a dozen deadlines — inspection objection, appraisal, loan
            commitment, HOA docs, final walkthrough, closing — each derived from the contract date
            by rules everyone recomputes by hand. Agents run them from memory and sticky notes. TCs
            run fifteen files from a spreadsheet that does not know Saturdays exist. One missed
            objection deadline is an earnest-money story nobody forgets.
          </p>
        </section>

        {/* ------------------------------------------------------ the math */}
        <section className="mt-20">
          <p className="t-label">The arithmetic nobody does correctly in their head</p>
          <h2 className="t-display mt-2 max-w-3xl">
            Contract Friday, May 22. Ten business days. When is the objection deadline?
          </h2>
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            <div>
              <p className="t-stat">Jun 5</p>
              <p className="t-title mt-2">Counting calendar-ish</p>
              <p className="t-secondary mt-1">
                Ten weekdays after the 22nd, if Memorial Day were a working day. It is not.
              </p>
            </div>
            <div>
              <p className="t-stat">Jun 8</p>
              <p className="t-title mt-2">What the contract actually says</p>
              <p className="t-secondary mt-1">
                Six weekend days skipped, Memorial Day observed. The tenth business day is Monday
                the 8th.
              </p>
            </div>
            <div>
              <p className="t-stat">3 days</p>
              <p className="t-title mt-2">The gap</p>
              <p className="t-secondary mt-1">
                One closed office costs three calendar days, because skipping it pushes the count
                past a weekend. That is the gap an earnest-money dispute lives in.
              </p>
            </div>
          </div>
          <p className="t-secondary mt-6 max-w-2xl">
            Every date in ListingLoop shows the sentence that produced it — &ldquo;Contract date
            (May 22) + 10 business days — 6 weekend days skipped, Memorial Day observed — lands
            Monday, Jun 8.&rdquo; The math is never a black box, so you can check it against the
            form.
          </p>
        </section>

        {/* -------------------------------------------------- the receipts */}
        <section className="mt-20">
          <p className="t-label">Receipts · demo file, this product&rsquo;s own output</p>
          <h2 className="t-display mt-2 max-w-3xl">A recompute you can read back.</h2>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="panel p-5">
              <p className="t-label">Recompute diff</p>
              <ul className="mt-3 list-none p-0">
                <li className="diff-row">
                  <p className="diff-move">
                    Inspection objection deadline moved Jun 2 → Jun 8
                  </p>
                  <p className="diff-reason">6 weekend days skipped, Memorial Day observed</p>
                </li>
                <li className="diff-row">
                  <p className="diff-move">Appraisal received moved Jun 8 → Jun 12</p>
                  <p className="diff-reason">contract date moved</p>
                </li>
                <li className="diff-row">
                  <p className="diff-move">Loan commitment issued moved Jun 17 → Jun 22</p>
                  <p className="diff-reason">rolled forward to the next business day</p>
                </li>
              </ul>
              <p className="t-secondary mt-3">
                Nine of eleven dates move when the contract date is corrected by four days. You see
                that list before anything is written.
              </p>
            </div>
            <div className="panel p-5">
              <p className="t-label">Reminder ledger</p>
              <ul className="mt-3 list-none p-0">
                <li className="hairline-b py-2">
                  <p className="t-mono">T-7 · Inspection objection · for Jun 8</p>
                  <p className="t-secondary">Jun 1 — Dana Okafor, Marisol Vance, Rita Bell</p>
                </li>
                <li className="hairline-b py-2">
                  <p className="t-mono">T-3 · Inspection objection · for Jun 8</p>
                  <p className="t-secondary">Jun 5 — Dana Okafor, Marisol Vance, Rita Bell</p>
                </li>
                <li className="py-2">
                  <p className="t-mono">T-1 · Inspection objection · for Jun 8</p>
                  <p className="t-secondary">Jun 7 — Dana Okafor, Marisol Vance, Rita Bell</p>
                </li>
              </ul>
              <p className="t-secondary mt-3">
                Three rungs, three emails, once each. A rung already in the ledger never fires
                again, and nothing fires after the date has passed — the file says MISSED instead of
                emailing your buyer every morning until closing.
              </p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------- the objection killer */}
        <section className="mt-20 max-w-3xl">
          <p className="t-label">The objection</p>
          <h2 className="t-display mt-2">
            &ldquo;My brokerage already makes me use Dotloop.&rdquo;
          </h2>
          <p className="t-body mt-4 text-dim">
            Good — keep it. ListingLoop is not an e-signature tool and does not want to be your
            compliance archive. Those platforms own signing and storage, and they are famously
            joyless at the coordination layer: dates live in form fields, not in an engine, which is
            why you still run the real timeline in a spreadsheet. This replaces the spreadsheet, not
            the brokerage system. It sits beside Dotloop, SkySlope and Transaction Desk, and your
            whole file exports as a zip on any plan — including a lapsed one.
          </p>
        </section>

        {/* ----------------------------------------------------- pricing */}
        <section className="mt-20">
          <p className="t-label">Pricing</p>
          <h2 className="t-display mt-2 max-w-3xl">Per desk. Closed files never count.</h2>
          <p className="t-body mt-3 max-w-2xl text-dim">
            An independent TC charges $350–500 a file. One missed objection deadline costs more than
            a year of Desk. The comparison that matters is not another app — it is the afternoon you
            spend recomputing dates by hand, every time a contract date is corrected.
          </p>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {PAID_PLANS.map((plan) => {
              const spec = planSpec(plan);
              return (
                <div key={plan} className="panel flex flex-col p-5">
                  <h3 className="t-h2">{spec.name}</h3>
                  <p className="t-stat mt-2">{formatPlanPrice(plan)}</p>
                  <p className="t-secondary mt-2">{spec.blurb}</p>
                  <ul className="mt-4 flex-1 list-none p-0">
                    {spec.features.map((f) => (
                      <li key={f} className="t-body hairline-b py-2">
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link href="/signup" className="btn btn-primary btn-full mt-5">
                    {CTA}
                  </Link>
                </div>
              );
            })}
          </div>
        </section>

        {/* --------------------------------------------------------- FAQ */}
        <section className="mt-20 max-w-3xl">
          <p className="t-label">Honest answers</p>
          <h2 className="t-display mt-2">What this is and is not.</h2>
          <dl className="mt-6">
            <Faq q="Is this an e-signature platform?">
              No. It never touches signing. It computes and tracks the dates, collects the documents
              your checklist names, and reminds the parties. Sign wherever you sign now.
            </Faq>
            <Faq q="Are the starter checklists legal advice?">
              No. They are written against a generic residential resale contract of the kind used in
              Texas and Colorado, with offsets a coordinator would recognise. Edit them to match
              your state form — the rule builder reads every rule back as a sentence so you can
              check it against the paperwork.
            </Faq>
            <Faq q="What happens to a date when I correct the contract date?">
              Nothing, until you approve it. Editing an anchor runs the engine in preview: the
              moving nodes ghost to their new positions on the timeline and every move is listed
              with its reason. Apply writes them and records the diff. Reminders that already went
              out stay in the ledger — the file never rewrites what a party actually received.
            </Faq>
            <Faq q="Do my clients need an account?">
              No. A party gets a personal link that shows what is done, what is next, and what is
              needed from them, with the upload inline. No login, no app, plain language.
            </Faq>
            <Faq q="What if I stop paying?">
              The desk goes read-only and the closing-packet export keeps working. Your timelines,
              checklists and documents stay exactly where they are. Nothing is deleted and nothing
              is held hostage.
            </Faq>
            <Faq q="Which holidays does it observe?">
              The eleven US federal holidays on their observed dates — a Saturday holiday is
              observed the Friday before, a Sunday one the Monday after, because that is the day the
              recorder is shut — plus the state closures for the state on your desk.
            </Faq>
          </dl>
        </section>

        {/* --------------------------------------------------- final CTA */}
        <section className="mt-20 max-w-3xl">
          <h2 className="t-display">Put the sticky note in the bin.</h2>
          <p className="t-body mt-3 text-dim">
            Open one file. Enter the contract date. Read the eleven dates it computes and the
            sentence under each one. If the arithmetic is not better than yours, close the tab.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Link href="/signup" className="btn btn-primary">
              {CTA}
            </Link>
            <Link href="/login" className="btn-quiet">
              I already have a desk
            </Link>
          </div>
        </section>

        <footer className="mt-24 border-t border-line pt-6">
          <p className="t-secondary">
            ListingLoop — transaction coordination for agents and TCs. Pre-launch: every artefact on
            this page is our own output on demo data, and we will not put a customer&rsquo;s name on
            it until they have said yes.
          </p>
        </footer>
      </main>

      {/* Sticky CTA on a phone: the primary action stays in the thumb zone. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-sheet px-5 py-3 pb-[calc(12px+env(safe-area-inset-bottom))] sm:hidden">
        <Link href="/signup" className="btn btn-primary btn-full">
          {CTA}
        </Link>
      </div>
    </>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="hairline-b py-4">
      <dt className="t-title">{q}</dt>
      <dd className="t-body mt-1 text-dim">{children}</dd>
    </div>
  );
}
