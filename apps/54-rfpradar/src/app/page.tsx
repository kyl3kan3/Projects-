import type { Metadata } from "next";
import Link from "next/link";
import { PLANS, PAID_PLANS, TRIAL_DAYS, formatPriceCents } from "@/lib/plans";
import { DEFAULT_CRITERIA, GO_THRESHOLD, weightedVerdict } from "@/lib/scorecard";
import { WEIGHTS, scoreOpportunity } from "@/lib/scoring";
import { FactorRows } from "@/components/FactorList";
import { StatusPill } from "@/components/StatusPill";
import { Check, RadarArc } from "@/components/icons";

export const metadata: Metadata = {
  title: "RFPRadar — the tender you'd have missed, found at 6am",
  description:
    "Every relevant tender found at 6am, scored with reasons, and answered from a library instead of a blank page. SAM.gov plus state portals, go/no-go scorecards, and one deadline calendar — for firms of 5 to 50.",
};

const CTA = "Start free — 14 days";

/**
 * The landing page, built last, to MARKETING_PLAYBOOK.md.
 *
 * Enemy: the tender that got away — found on day eleven of twenty, or never.
 * One sentence: every relevant tender found at 6am, scored with reasons, and
 * answered from a library instead of a blank page.
 * Device: "The tender you'd have missed, found at 6am."
 *
 * The hero is the machine running, and it is running on the product's real code:
 * the scan card below is scored by `scoreOpportunity` from src/lib/scoring.ts at
 * render time and its reasons come out of `FactorRows`, the same component the
 * radar uses. The notice is the sample one this build ships for development, and
 * it is labelled a staged demo — Law 5 forbids inventing receipts, and a
 * pre-launch product has none to show.
 *
 * Four animated moments, no more (Law 6): the scan stamp, the score, the reasons,
 * the deadline chip. Everything below the hero is typeset and static.
 */
export default function LandingPage() {
  const now = new Date();
  const demo = buildDemo(now);

  return (
    <>
      <a href="#pricing" className="sr-only">
        Skip to pricing
      </a>

      <header className="screen pt-5" style={{ paddingBottom: 0 }}>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2" style={{ color: "var(--color-ink)" }}>
            <RadarArc size={22} />
            <span className="t-label" style={{ color: "var(--color-ink-2)" }}>
              RFPRadar
            </span>
          </span>
          <Link href="/login" className="btn-quiet ml-auto">
            Sign in
          </Link>
        </div>
      </header>

      {/* ------------------------------------------------------------ hero */}
      <main className="screen" style={{ paddingBottom: 96 }}>
        <section className="pt-8">
          <p className="t-label">The tender that got away</p>
          <h1 className="t-display mt-3">Found at 6am. Scored by 6:01.</h1>
          <p className="t-body mt-4" style={{ color: "var(--color-ink-2)", maxWidth: "38ch" }}>
            The relevant tender was on a state portal you did not know existed. A partner forwarded
            it on day eleven of twenty. RFPRadar reads the register while you sleep and hands you the
            ones worth reading, with the reasons attached.
          </p>

          {/* The device, running. */}
          <div className="card p-4 mt-6">
            <p className="t-mono beat-stamp" style={{ color: "var(--color-ink-3)" }}>
              SCANNED 3,412 NOTICES · 6 SOURCES · 6:02 AM
            </p>

            <div className="mt-3 beat-card">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="t-title">{demo.title}</h2>
                  <p className="t-secondary mt-1">{demo.agency}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="t-score">{demo.score}</span>
                  <span className="t-label block mt-1">fit</span>
                </div>
              </div>

              <p className="t-mono mt-3" style={{ color: "var(--color-ink-3)" }}>
                {demo.meta}
              </p>

              <div className="mt-3 beat-chip">
                <StatusPill label="due in 21 days" tone="warn" />
              </div>

              <ul className="list-none p-0 m-0 mt-3 flex flex-col gap-1">
                {demo.topReasons.map((reason, index) => (
                  <li
                    key={reason}
                    className="t-secondary beat-reason"
                    style={{ animationDelay: `${240 + index * 40}ms` }}
                  >
                    {reason}
                  </li>
                ))}
              </ul>
            </div>

            <p className="t-secondary mt-4" style={{ color: "var(--color-ink-3)" }}>
              Staged demo. Scored by the product&apos;s own code at page load, using the sample notice
              this build ships for development — not a customer&apos;s live result.
            </p>
          </div>

          <Link href="/signup" className="btn btn-primary w-full mt-6">
            {CTA}
          </Link>
          <p className="t-secondary mt-3 text-center">No card required.</p>
        </section>

        {/* --------------------------------------------------- the reasons */}
        <section className="mt-16">
          <p className="t-label">Scores you can audit</p>
          <h2 className="t-h2 mt-2">Every number expands to its reasons.</h2>
          <p className="t-body mt-3" style={{ color: "var(--color-ink-2)" }}>
            Black-box relevance dies at the second bad match. Here the score is arithmetic over
            factors you set, and each factor is a sentence naming where it was found. This is the
            full breakdown behind the {demo.score} above.
          </p>

          <div className="card p-4 mt-5">
            <FactorRows factors={demo.factors} />
            <p className="t-secondary mt-3">
              Keywords {WEIGHTS.keywords} · NAICS {WEIGHTS.naics} · PSC {WEIGHTS.psc} · geography{" "}
              {WEIGHTS.geography} · agency {WEIGHTS.agency} · value band {WEIGHTS.valueBand}. A factor
              you never configured is left out of the total rather than counted against you.
            </p>
          </div>
        </section>

        {/* ------------------------------------------------- the scorecard */}
        <section className="mt-16">
          <p className="t-label">Ten minutes to an honest no</p>
          <h2 className="t-h2 mt-2">The scorecard makes “no” cheap.</h2>
          <p className="t-body mt-3" style={{ color: "var(--color-ink-2)" }}>
            Five weighted questions before anyone writes a word. The verdict shows its working, the
            decision is recorded with who and when, and a no-bid closes the pursuit with its reason
            kept — which is how a firm gets its first honest win-rate denominator.
          </p>

          <div className="card p-4 mt-5">
            <div className="rows">
              {demo.scorecard.rows.map((row) => (
                <div key={row.key} className="py-3 flex items-baseline gap-3">
                  <span className="t-body flex-1">{row.label}</span>
                  <span className="t-mono" style={{ color: "var(--color-ink-3)" }}>
                    {row.score1to5}/5 × {row.weight} = {row.points}
                  </span>
                </div>
              ))}
            </div>
            <p className="t-mono mt-4" style={{ color: "var(--color-red)" }}>
              NO-GO · {demo.scorecard.explanation}
            </p>
            <p className="t-secondary mt-2">
              A recorded no-bid is a first-class outcome. Nobody else in this segment treats it as one.
            </p>
          </div>
        </section>

        {/* --------------------------------------------------- the library */}
        <section className="mt-16">
          <p className="t-label">Link and snapshot</p>
          <h2 className="t-h2 mt-2">The library outlives every proposal.</h2>
          <p className="t-body mt-3" style={{ color: "var(--color-ink-2)" }}>
            Boilerplate, past answers, bios, and past-performance blurbs live once. Linking one into a
            pursuit freezes its text there: the library keeps improving and the submitted proposal
            stays exactly as submitted. Anything unreviewed for a year says so before you reuse it.
          </p>
          <div className="rows mt-5">
            {[
              ["Linked at v4", "the pursuit keeps the text it froze, permanently"],
              ["Library now at v6", "two improvements later, and the old proposal is untouched"],
              ["Reviewed Jan 2026", "past that, a block warns you before it is reused"],
              ["Won with", "blocks used in a won pursuit are flagged automatically"],
            ].map(([label, body]) => (
              <div key={label} className="py-3">
                <p className="t-mono">{label}</p>
                <p className="t-secondary mt-1">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* -------------------------------------------------- the maths */}
        <section className="mt-16">
          <p className="t-label">The arithmetic</p>
          <h2 className="t-h2 mt-2">One missed tender costs more than a year of this.</h2>
          <div className="rows mt-5">
            <div className="py-4">
              <p className="t-body">Deltek GovWin IQ — discovery</p>
              <p className="t-mono mt-1" style={{ color: "var(--color-ink-3)" }}>
                no public pricing · reported ~$13k–$119k/yr, averaging ~$29k
              </p>
            </div>
            <div className="py-4">
              <p className="t-body">Loopio — response side</p>
              <p className="t-mono mt-1" style={{ color: "var(--color-ink-3)" }}>
                quote-priced · reported median ~$22.8k/yr
              </p>
            </div>
            <div className="py-4">
              <p className="t-body">RFPRadar Pursuit — both jobs</p>
              <p className="t-mono mt-1" style={{ color: "var(--color-federal)" }}>
                {formatPriceCents(PLANS.pursuit.priceCents)}/mo ·{" "}
                {formatPriceCents(PLANS.pursuit.priceCents * 12)}/yr for five seats
              </p>
            </div>
          </div>
          <p className="t-secondary mt-4">
            Figures for GovWin IQ and Loopio are third-party buyer reports, not vendor quotes; both
            are sales-led and neither publishes a price. One winnable tender found on day eleven is
            five figures gone. One doomed pursuit a scorecard would have killed is a proposal week —
            call it $5k–$15k of senior time.
          </p>
        </section>

        {/* --------------------------------------------- objection killer */}
        <section className="mt-16">
          <p className="t-label">The obvious objection</p>
          <h2 className="t-h2 mt-2">“Another feed to ignore.”</h2>
          <p className="t-body mt-3" style={{ color: "var(--color-ink-2)" }}>
            Fair. So the scan shows its restraint as plainly as its finds:
          </p>
          <div className="rows mt-4">
            <div className="py-3">
              <p className="t-body">Below your threshold is suppressed, not deleted.</p>
              <p className="t-secondary mt-1">
                Open the audit view and read every notice the filter dropped, with the reasons it
                dropped them. If the filter is wrong you can see that it is wrong.
              </p>
            </div>
            <div className="py-3">
              <p className="t-body">A quiet morning says so, in one line.</p>
              <p className="t-secondary mt-1">
                “No new matches. 3,412 notices scanned across 6 sources.” Silence you can tell apart
                from breakage.
              </p>
            </div>
            <div className="py-3">
              <p className="t-body">A negative keyword vetoes outright.</p>
              <p className="t-secondary mt-1">
                And names the word that did it, so tuning takes seconds instead of guesswork.
              </p>
            </div>
            <div className="py-3">
              <p className="t-body">Every source shows its last success.</p>
              <p className="t-secondary mt-1">
                A portal that breaks reads as degraded or down with a note — never as a calm, empty
                radar.
              </p>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- pricing */}
        <section className="mt-16" id="pricing">
          <p className="t-label">Pricing</p>
          <h2 className="t-h2 mt-2">Seats, not tenders.</h2>
          <p className="t-body mt-3" style={{ color: "var(--color-ink-2)" }}>
            Every plan includes every discovery feed. Nobody pays extra to see a tender.
          </p>

          <div className="mt-6 flex flex-col gap-4 md:grid md:grid-cols-3">
            {PAID_PLANS.map((id) => {
              const tier = PLANS[id];
              return (
                <article key={id} className="card p-4 flex flex-col">
                  <h3 className="t-title">{tier.name}</h3>
                  <p className="t-stat mt-2" style={{ fontSize: "2rem" }}>
                    {formatPriceCents(tier.priceCents)}
                    <span className="t-secondary"> /mo</span>
                  </p>
                  <p className="t-mono mt-1" style={{ color: "var(--color-ink-3)" }}>
                    {tier.seats} seats · {formatPriceCents(Math.round(tier.priceCents / tier.seats))}{" "}
                    per seat
                  </p>
                  <p className="t-secondary mt-2">{tier.blurb}</p>
                  <ul className="list-none p-0 mt-3 flex flex-col gap-2 flex-1">
                    {tier.includes.map((line) => (
                      <li key={line} className="t-secondary flex items-start gap-2">
                        <span
                          className="mt-[2px] shrink-0"
                          style={{ color: "var(--color-green-text)" }}
                        >
                          <Check size={16} />
                        </span>
                        {line}
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>

          <p className="t-secondary mt-4">
            Annual is two months free. {TRIAL_DAYS}-day trial, no card, full access — the trial is
            long enough for the first “we would have missed this” morning to land inside it.
          </p>

          <Link href="/signup" className="btn btn-primary w-full mt-6">
            {CTA}
          </Link>
        </section>

        {/* ------------------------------------------------------------ faq */}
        <section className="mt-16">
          <p className="t-label">Honest answers</p>
          <div className="rows mt-4">
            {[
              [
                "Which sources, exactly?",
                "Federal via SAM.gov's documented Opportunities API, plus five states chosen for feed quality: Virginia (eVA), Maryland (eMMA), Texas (ESBD), Georgia (GPR), and Washington (WEBS). More states by customer demand, not by press release. A source is a row in a table here, so adding one is a configuration change.",
              ],
              [
                "What happens when a portal changes its format?",
                "That source goes degraded or down with a note you can read, and it stays that way until the connector is fixed. Fifty portals drift; pretending otherwise is how a feed product loses trust in a week.",
              ],
              [
                "Does it write the proposal?",
                "No. It assembles from what your firm has already written and reviewed. AI drafting is deliberately out of v1 — an answer nobody on your team has vouched for is a liability in an evaluated submission.",
              ],
              [
                "Can we get our content back out?",
                "Yes, as JSON, at any time, including if you stop paying. Export stays available in read-only mode, because a promise that lapses exactly when it matters is not a promise.",
              ],
              [
                "Do you have customer case studies?",
                "Not yet — this is pre-launch, and inventing them would be a debt we never pay off. What is on this page is the product's own output, labelled as such.",
              ],
            ].map(([question, answer]) => (
              <details key={question} className="py-3">
                <summary className="t-title cursor-pointer list-none">{question}</summary>
                <p className="t-body mt-2" style={{ color: "var(--color-ink-2)" }}>
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* ----------------------------------------------------- final CTA */}
        <section className="mt-16">
          <h2 className="t-display">The tender you&apos;d have missed, found at 6am.</h2>
          <p className="t-body mt-4" style={{ color: "var(--color-ink-2)" }}>
            Build one keyword profile. Read tomorrow&apos;s scan. Decide whether it found something a
            partner&apos;s forward would have brought you eleven days late.
          </p>
          <Link href="/signup" className="btn btn-primary w-full mt-6">
            {CTA}
          </Link>
          <p className="t-secondary mt-3 text-center">
            No card required. Cancel from the billing portal in two clicks.
          </p>
        </section>

        <footer className="mt-16 hair-t pt-6">
          <p className="t-secondary">
            RFPRadar · the small firm&apos;s capture desk. Public-notice data is public by statute; we
            fetch it politely, with an honest user agent, on a schedule each portal can live with.
          </p>
          <p className="t-secondary mt-2">
            <Link href="/login" className="btn-quiet">
              Sign in
            </Link>
          </p>
        </footer>
      </main>

      {/* Sticky mobile CTA — the same words, in the thumb zone. */}
      <div
        className="md:hidden"
        style={{
          position: "fixed",
          inset: "auto 0 0 0",
          padding: "12px var(--gutter) calc(12px + env(safe-area-inset-bottom))",
          background: "color-mix(in srgb, var(--color-card) 96%, transparent)",
          backdropFilter: "blur(8px)",
          borderTop: "1px solid var(--color-line)",
          zIndex: 40,
        }}
      >
        <Link href="/signup" className="btn btn-primary w-full">
          {CTA}
        </Link>
      </div>
    </>
  );
}

/**
 * The demo, scored by the real scorer at render time rather than typed out as
 * copy. If the weights change, this page changes with them — which is the only
 * way a marketing claim about a score stays true.
 */
function buildDemo(now: Date) {
  const profile = {
    naicsCodes: ["541512"],
    pscCodes: ["D310"],
    keywords: ["managed detection", "endpoint detection", "security operations"],
    negativeKeywords: ["staffing", "janitorial"],
    states: ["VA", "MD", "US"],
    agencies: ["Department of the Army"],
    valueBand: { minCents: 25_000_000, maxCents: 500_000_000 },
  };

  const opportunity = {
    title: "Managed Detection and Response Services for Army Enterprise Networks",
    agency: "Department of the Army, Army Contracting Command · federal",
    state: null,
    naicsCodes: ["541512", "541519"],
    pscCodes: ["D310"],
    description:
      "§3.1 Scope. The contractor shall provide 24x7x365 security operations centre monitoring, triage, and escalation.\n\n" +
      "§3.2 Scope. Managed detection and response shall include endpoint telemetry collection, threat hunting, and incident containment within 15 minutes of a confirmed critical alert.",
    responsesDueAt: new Date(now.getTime() + 21 * 86_400_000),
    estValueBand: { minCents: 250_000_000, maxCents: 1_000_000_000 },
  };

  const result = scoreOpportunity(profile, opportunity, { now });

  // A deliberately bad pursuit, scored by the same verdict maths.
  const scorecard = weightedVerdict(
    DEFAULT_CRITERIA.map((criterion) => ({
      ...criterion,
      score1to5: { incumbent: 1, vehicle: 2, capacity: 2, price: 1, relationship: 1 }[
        criterion.key
      ] ?? 1,
      note: "",
    })),
  );

  return {
    title: opportunity.title,
    agency: opportunity.agency,
    meta: "SAMPLE-W91QUZ-26-R-0114 · due in 21 days · $2.5M–$10M",
    score: result.score,
    factors: result.factors,
    topReasons: result.factors
      .filter((factor) => factor.matched)
      .slice(0, 2)
      .map((factor) => factor.reason),
    scorecard,
    goThreshold: GO_THRESHOLD,
  };
}
