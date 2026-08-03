import type { Metadata } from "next";
import Link from "next/link";
import { ClauseChecker } from "@/components/marketing/ClauseChecker";
import { StrikeDemo } from "@/components/marketing/StrikeDemo";
import { Banner } from "@/components/Banner";
import { SeverityChip } from "@/components/SeverityChip";
import { IconCheck, IconCompass, IconGavelOut } from "@/components/icons";
import { formatCents, OVERAGE_CENTS, PLAN_ORDER, PLANS } from "@/lib/plans";
import { DEFAULT_RULES, describeRule } from "@/lib/playbook";
import { FIXTURES } from "@/fixtures/contracts";

/**
 * The marketing page. Message architecture, per MARKETING_PLAYBOOK.md:
 *
 *   Enemy      — signing a 14-page contract you didn't really read, because the only
 *                alternative was a $500 legal bill by Monday.
 *   Sentence   — "Know what you're signing."
 *   Device     — the clause drawn in redline ink.
 *   Arc        — hook (the checker, running) → tension (what the clauses cost) → proof
 *                (the rules, the anchoring, the coverage honesty) → offer ($19 tonight).
 *   CTA        — "Review your contract", repeated verbatim at hero, post-pricing, final
 *                and in the sticky mobile bar.
 *
 * Every number on this page is either arithmetic the visitor can check or a count of
 * something in this repository. There are no testimonials, no logos and no usage numbers:
 * the product is pre-launch, and inventing them would be the one trust debt it could never
 * pay off.
 */

export const metadata: Metadata = {
  title: "ClauseCompass — know what you're signing",
  description:
    "Paste a clause or upload the contract. Every clause quoted, scored against a written playbook, explained in plain English, with redline wording you can send. $19 a contract. Not legal advice.",
};

const CTA = "Review your contract";

const HIGH_RULES = DEFAULT_RULES.filter((r) => r.severityOnFail === "high");
const SAMPLE = FIXTURES[0];

export default function LandingPage() {
  return (
    <>
      <main>
        {/* ---------------------------------------------------------- hero */}
        <section className="screen" style={{ paddingBottom: 0 }}>
          <div className="flex items-center gap-2 pt-6">
            <span style={{ color: "var(--color-oxblood)" }}>
              <IconCompass size={20} />
            </span>
            <span className="t-title">ClauseCompass</span>
            <Link href="/login" className="btn-quiet btn-quiet-sm" style={{ marginLeft: "auto" }}>
              Sign in
            </Link>
          </div>

          <h1 className="t-display mt-10">Know what you&rsquo;re signing.</h1>
          <p className="t-body mt-4" style={{ color: "var(--color-text-2)", maxWidth: "60ch" }}>
            A 14-page MSA lands at 6pm with &ldquo;any concerns? hoping to kick off
            Monday.&rdquo; A lawyer wants $300&ndash;800 to read it — more than the first
            invoice on the job. So you skim, you sign, and you find out later what the IP
            clause meant.
          </p>

          <div className="mt-8">
            <ClauseChecker />
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link className="btn btn-secondary" href="/signup">
              {CTA}
            </Link>
            <span className="t-secondary" style={{ color: "var(--color-text-3)" }}>
              $19 for one contract. No subscription.
            </span>
          </div>
        </section>

        {/* -------------------------------------------------------- device */}
        <section className="screen mt-20" style={{ paddingBottom: 0 }}>
          <p className="t-label">The device</p>
          <h2 className="t-h2 mt-2" style={{ maxWidth: "34ch" }}>
            One clause, drawn in redline ink.
          </h2>
          <p className="t-body mt-3" style={{ color: "var(--color-text-2)", maxWidth: "58ch" }}>
            Every flag comes with the contract&rsquo;s own words, struck where they bite, and
            replacement language written to be pasted into a reply. This is the whole product
            in one card.
          </p>
          <div className="mt-6">
            <StrikeDemo />
          </div>
        </section>

        {/* ---------------------------------------------------------- math */}
        <section className="screen mt-20" style={{ paddingBottom: 0 }}>
          <p className="t-label">The math</p>
          <h2 className="t-h2 mt-2" style={{ maxWidth: "34ch" }}>
            What the clauses cost, against what the review costs.
          </h2>
          <div className="mt-6">
            <div className="hairline-b flex items-baseline justify-between gap-4 py-3">
              <span className="t-body">A lawyer reads the MSA</span>
              <span className="t-data">$300–800</span>
            </div>
            <div className="hairline-b flex items-baseline justify-between gap-4 py-3">
              <span className="t-body">
                Net-60 instead of net-30 on a $6,000 project
                <span className="t-secondary block" style={{ color: "var(--color-text-3)" }}>
                  thirty extra days of your money funding their cash flow
                </span>
              </span>
              <span className="t-data">$6,000 · 30 days</span>
            </div>
            <div className="hairline-b flex items-baseline justify-between gap-4 py-3">
              <span className="t-body">
                An uncapped indemnity on a $4,000 job
                <span className="t-secondary block" style={{ color: "var(--color-text-3)" }}>
                  the fee is not the limit of what you could owe
                </span>
              </span>
              <span className="t-data">no ceiling</span>
            </div>
            <div className="hairline-b flex items-baseline justify-between gap-4 py-3">
              <span className="t-body">ClauseCompass reads the whole thing</span>
              <span className="t-data" style={{ color: "var(--color-oxblood)" }}>
                $19
              </span>
            </div>
          </div>
          <p className="t-secondary mt-4" style={{ maxWidth: "58ch" }}>
            We are the option before the lawyer, not instead of one. Every HIGH flag says
            plainly when a clause is worth a lawyer&rsquo;s hour — that pointer is fixed copy,
            not something a model decides.
          </p>
        </section>

        {/* --------------------------------------------------------- proof */}
        <section className="screen mt-20" style={{ paddingBottom: 0 }}>
          <p className="t-label">How it stays honest</p>
          <h2 className="t-h2 mt-2" style={{ maxWidth: "36ch" }}>
            Written rules, quoted evidence, and a coverage count that admits what it missed.
          </h2>

          <div className="mt-8">
            <article className="hairline-b py-5">
              <p className="t-title">{DEFAULT_RULES.length} rules, all of them readable</p>
              <p className="t-secondary mt-1.5" style={{ maxWidth: "58ch" }}>
                Scoring is deterministic TypeScript, not a chat answer: the same contract and
                the same playbook version always produce the same flags. {HIGH_RULES.length} of
                the rules are rated HIGH. Three of them, verbatim:
              </p>
              <ul className="mt-3" style={{ listStyle: "none", padding: 0 }}>
                {HIGH_RULES.slice(0, 3).map((rule) => (
                  <li key={rule.ruleKey} className="flex items-start gap-2 py-1">
                    <span style={{ color: "var(--color-oxblood)", marginTop: 3 }}>
                      <IconCheck size={18} />
                    </span>
                    <span className="t-secondary" style={{ color: "var(--color-ink)" }}>
                      <strong style={{ fontWeight: 600 }}>{rule.title}.</strong>{" "}
                      {describeRule(rule)}
                    </span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="hairline-b py-5">
              <p className="t-title">Nothing in a report exists without a quote</p>
              <p className="t-secondary mt-1.5" style={{ maxWidth: "58ch" }}>
                Extraction is forced into a typed schema, and then every quote is matched back
                against your document character-for-character. A quote that does not match is
                dropped and the clause is re-requested once; if it still cannot be anchored it
                does not appear. The database enforces it too — a clause row with no source
                span cannot be stored.
              </p>
            </article>

            <article className="hairline-b py-5">
              <p className="t-title">The coverage strip says what was not read</p>
              <p className="t-data mt-2" style={{ color: "var(--color-text-2)" }}>
                15 SECTIONS · 9 ANALYZED · 4 BOILERPLATE ·{" "}
                <span style={{ color: "var(--color-oxblood)" }}>2 NOT ANALYZED</span>
              </p>
              <p className="t-secondary mt-2" style={{ maxWidth: "58ch" }}>
                That is the real strip from our demo contract. A scanned page, or a section no
                clause type matched, is reported rather than quietly skipped. A review that
                covers 80% of a contract while looking complete is worse than no review.
              </p>
            </article>

            <article className="hairline-b py-5">
              <p className="t-title">What a report finds</p>
              <p className="t-secondary mt-1.5" style={{ maxWidth: "58ch" }}>
                Our own demo contract — an invented MSA, written to be a bad one, and labelled
                as a demo everywhere it appears. It raises {SAMPLE.expectedFlags.length} flags,
                including:
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <SeverityChip severity="high" />
                <span className="t-secondary">IP transfers on creation, not on payment</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <SeverityChip severity="high" />
                <span className="t-secondary">Indemnity runs one way, with no cap</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <SeverityChip severity="caution" />
                <span className="t-secondary">Auto-renewal with a 15-day notice window</span>
              </div>
            </article>
          </div>
        </section>

        {/* ----------------------------------------------- objection killer */}
        <section className="screen mt-20" style={{ paddingBottom: 0 }}>
          <p className="t-label">The obvious question</p>
          <h2 className="t-h2 mt-2">&ldquo;Is this legal advice?&rdquo;</h2>
          <p className="t-body mt-3" style={{ maxWidth: "58ch" }}>
            No. ClauseCompass is a reading tool, not a law firm, and it will not tell you
            whether to sign anything. There is no chat box for &ldquo;what should I do?&rdquo; —
            by design, not by omission.
          </p>
          <div className="mt-6">
            <div className="hairline-b py-4">
              <p className="t-label">What it does</p>
              <p className="t-body mt-1.5" style={{ maxWidth: "58ch" }}>
                Finds every clause, quotes it, scores it against written rules, explains it in
                plain English, and gives you wording to ask for instead.
              </p>
            </div>
            <div className="hairline-b py-4">
              <p className="t-label">What it does not do</p>
              <p className="t-body mt-1.5" style={{ maxWidth: "58ch" }}>
                Represent you, judge your situation, or predict how a court would read a clause.
                Explanations are scanned automatically for advice phrasing before they are
                stored, and anything that fails is replaced by the playbook&rsquo;s own wording.
              </p>
            </div>
            <div className="hairline-b py-4">
              <p className="t-label">When to hire a lawyer</p>
              <p className="t-body mt-1.5 flex items-start gap-2" style={{ maxWidth: "58ch" }}>
                <span style={{ color: "var(--color-oxblood)", marginTop: 3 }}>
                  <IconGavelOut size={18} />
                </span>
                <span>
                  Every HIGH flag says so, in fixed copy: an hour of advice costs far less than
                  the clause does. Reading the contract first makes that hour cheaper.
                </span>
              </p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- pricing */}
        <section className="screen mt-20" style={{ paddingBottom: 0 }}>
          <p className="t-label">Pricing</p>
          <h2 className="t-h2 mt-2">Priced for the night the contract arrives.</h2>
          <div className="mt-6">
            {PLAN_ORDER.map((id) => {
              const plan = PLANS[id];
              return (
                <article key={id} className="hairline-b py-5">
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="t-title">{plan.name}</p>
                    <p className="t-data">
                      {plan.monthlyCents > 0
                        ? `${formatCents(plan.monthlyCents)}/mo`
                        : `${formatCents(plan.perContractCents)} once`}
                    </p>
                  </div>
                  <p className="t-secondary mt-1">{plan.blurb}</p>
                  <ul className="mt-3" style={{ listStyle: "none", padding: 0 }}>
                    {plan.features.map((feature) => (
                      <li key={feature} className="t-secondary flex items-start gap-2 py-0.5">
                        <span style={{ color: "var(--color-sage)", marginTop: 2 }}>
                          <IconCheck size={18} />
                        </span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {plan.monthlyCredits > 0 && (
                    <p className="t-label mt-3">
                      {formatCents(Math.round(plan.monthlyCents / plan.monthlyCredits))} per
                      contract at plan volume · extras {formatCents(OVERAGE_CENTS)}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
          <p className="t-secondary mt-4" style={{ maxWidth: "58ch" }}>
            Monthly reviews do not roll over, and we say so here as well as in the product.
            Contracts are deleted 90 days after upload and are never used to train a model.
          </p>
          <div className="measure mt-8">
            <Link className="btn btn-primary btn-full" href="/signup">
              {CTA}
            </Link>
          </div>
        </section>

        {/* ----------------------------------------------------- final CTA */}
        <section className="screen mt-20">
          <h2 className="t-display" style={{ maxWidth: "26ch" }}>
            Read it before you sign it.
          </h2>
          <p className="t-body mt-4" style={{ color: "var(--color-text-2)", maxWidth: "56ch" }}>
            Upload the contract, get every clause quoted and scored in minutes, and send back
            the three changes that matter. Tonight, for $19.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link className="btn btn-primary" href="/signup">
              {CTA}
            </Link>
            <span className="t-secondary" style={{ color: "var(--color-text-3)" }}>
              Or paste one clause above — that part is free.
            </span>
          </div>
          <div className="mt-16">
            <Banner />
            <p className="t-label pb-24 lg:pb-8">
              ClauseCompass · a reading tool for the person the contract is pointed at
            </p>
          </div>
        </section>
      </main>

      {/* Sticky mobile CTA: the same words, in the thumb zone, on the traffic that matters. */}
      <div
        className="sticky-action lg:hidden"
        style={{ bottom: 0, paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
      >
        <Link className="btn btn-primary btn-full" href="/signup">
          {CTA}
        </Link>
      </div>
    </>
  );
}
