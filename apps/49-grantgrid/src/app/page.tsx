import type { Metadata } from "next";
import Link from "next/link";
import { HeroFit } from "@/components/marketing/HeroFit";
import { IconCheck, IconFlag, IconX } from "@/components/icons";
import { PLANS, PLAN_ORDER, annualSavingLabel, priceLabel } from "@/lib/plans";
import { DEFAULT_OFFSETS, reportDeadlinesFor } from "@/lib/reminders";
import { addDays, formatCivilLong } from "@/lib/dates";

export const metadata: Metadata = {
  title: "GrantGrid — the grant pipeline for small nonprofits",
  description:
    "Every deadline, every reusable answer, and a fit score that tells you which funders to skip. $59–199/mo, built for the nonprofit without a grants manager.",
};

/** The one CTA phrase, repeated verbatim at every decision point. */
const CTA = "Start the 14-day trial";

/**
 * The reminder ladder for a real report date, rendered from the real functions —
 * the receipt is the product's own arithmetic, not a claim about it.
 */
const AWARD_DATE = "2026-09-15";
const [FINAL_REPORT] = reportDeadlinesFor(AWARD_DATE, "final_12", "the funder");
const LADDER = [
  ...DEFAULT_OFFSETS.map((offset) => ({
    on: addDays(FINAL_REPORT.dueOn, -offset),
    label: `${offset} ${offset === 1 ? "day" : "days"} out`,
  })),
  { on: addDays(FINAL_REPORT.dueOn, 1), label: "one overdue notice, then silence" },
];

function CtaButton({ variant = "primary" }: { variant?: "primary" | "secondary" }) {
  return (
    <Link
      href="/signup"
      className={variant === "primary" ? "btn btn-primary" : "btn btn-secondary"}
      style={{ width: "100%", maxWidth: 360 }}
    >
      {CTA}
    </Link>
  );
}

export default function LandingPage() {
  return (
    <main>
      <header className="mx-auto flex max-w-[1160px] items-center justify-between px-5 py-5">
        <span className="t-label">GrantGrid</span>
        <Link href="/login" className="btn-quiet" style={{ minHeight: 44 }}>
          Sign in
        </Link>
      </header>

      {/* ---------------------------------------------------------- hero --- */}
      <section className="mx-auto max-w-[1160px] px-5 pb-14 pt-4 lg:grid lg:grid-cols-2 lg:gap-10">
        <div>
          <h1 className="t-display">Apply, or skip. With the reasons in writing.</h1>
          <p className="t-body mt-5" style={{ color: "var(--color-ink-2)" }}>
            GrantGrid scores every funder against what your nonprofit actually does, shows
            you exactly which criteria produced the number, and then never lets a
            deadline — including the post-award report — go past without telling you.
          </p>
          <div className="mt-8 flex flex-col items-start gap-3">
            <CtaButton />
            <p className="t-secondary" style={{ color: "var(--color-ink-2)" }}>
              No card. 14 days of the full product.
            </p>
          </div>
        </div>
        <div className="mt-10 lg:mt-0">
          <HeroFit />
        </div>
      </section>

      {/* -------------------------------------------------------- enemy --- */}
      <section className="rule-t">
        <div className="mx-auto max-w-[680px] px-5 py-14">
          <p className="t-label">The enemy</p>
          <h2 className="t-h2 mt-3">
            A spreadsheet called GRANTS 2026 FINAL v3, and the report nobody filed.
          </h2>
          <p className="t-body mt-4" style={{ color: "var(--color-ink-2)" }}>
            One overworked director. LOI dates in one inbox, application dates in another,
            report dates nowhere. Every application retyping the same mission paragraph
            from a Word file called <span className="t-data">mission_FINAL_use_this.docx</span>.
            And the quietest loss in fundraising: a late report to a funder who would
            happily have renewed.
          </p>
          <p className="t-body mt-4" style={{ color: "var(--color-ink-2)" }}>
            The tools that fix this start at $299 a month, which is a rounding error for
            a development department and an impossibility for a $400k nonprofit.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------- device --- */}
      <section className="rule-t" style={{ background: "var(--color-sheet)" }}>
        <div className="mx-auto max-w-[680px] px-5 py-14">
          <p className="t-label">The device</p>
          <h2 className="t-h2 mt-3">Five factors. One hundred points. Nothing hidden.</h2>
          <p className="t-body mt-4" style={{ color: "var(--color-ink-2)" }}>
            Every score decomposes into the same five checks, each carrying the sentence
            that produced it.
          </p>
          <div className="mt-6">
            {[
              { label: "Geography", weight: 30, verdict: "match", reason: "Recent giving includes OH, where you work." },
              { label: "Cause areas", weight: 30, verdict: "match", reason: "Funds youth development and education — 2 of your 2 cause areas." },
              { label: "Grant size", weight: 20, verdict: "match", reason: "Typical grants $5k–$25k, and your $10k ask sits inside that range." },
              { label: "New grantees", weight: 12, verdict: "match", reason: "38% of recent grantees had not been funded before." },
              { label: "Unsolicited requests", weight: 8, verdict: "unknown", reason: "Does not say whether unsolicited requests are accepted; worth one phone call." },
            ].map((factor) => (
              <div key={factor.label} className="flex items-start gap-3 rule-t py-3">
                <span style={{ marginTop: 2, color: factor.verdict === "match" ? "var(--color-leaf-text)" : "var(--color-ink-2)" }}>
                  {factor.verdict === "match" ? <IconCheck size={18} /> : <IconX size={18} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="t-label" style={{ color: "var(--color-ink-2)" }}>
                      {factor.label}
                    </span>
                    <span className="t-data" style={{ color: "var(--color-ink-2)" }}>
                      {factor.verdict === "match" ? factor.weight : 0}/{factor.weight}
                    </span>
                  </span>
                  <span className="t-secondary mt-1 block">{factor.reason}</span>
                </span>
              </div>
            ))}
          </div>
          <p className="t-secondary rule-t pt-4" style={{ color: "var(--color-ink-2)" }}>
            And the honest limit, stated in the product as well as here: this compares
            published giving records. It cannot see a program officer&rsquo;s priorities or
            this year&rsquo;s unpublished strategy, and it never pretends to.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------ receipts --- */}
      <section className="rule-t">
        <div className="mx-auto max-w-[680px] px-5 py-14">
          <p className="t-label">Receipts</p>
          <h2 className="t-h2 mt-3">
            GrantGrid is pre-launch, so here is its own arithmetic instead of a
            testimonial.
          </h2>
          <p className="t-body mt-4" style={{ color: "var(--color-ink-2)" }}>
            Enter an award dated {formatCivilLong(AWARD_DATE)} with a final report at
            twelve months. GrantGrid schedules the report for{" "}
            <span className="t-data">{formatCivilLong(FINAL_REPORT.dueOn)}</span> and
            exactly four emails — computed by the same functions the app runs:
          </p>
          <div className="mt-6">
            {LADDER.map((rung) => (
              <div key={rung.on} className="flex items-baseline gap-3 rule-t py-3">
                <span className="t-data shrink-0" style={{ width: 132 }}>
                  {formatCivilLong(rung.on).toUpperCase()}
                </span>
                <span className="t-secondary min-w-0 flex-1">{rung.label}</span>
              </div>
            ))}
          </div>
          <p className="t-secondary rule-t pt-4">
            Four, not five, and not one a day forever. The overdue notice is pinned to a
            fixed distance from the date, so an unfinished report nags you once and then
            trusts you.
          </p>
          <p className="t-secondary mt-3" style={{ color: "var(--color-ink-2)" }}>
            <span style={{ color: "var(--color-gold-text)", verticalAlign: "-3px" }}>
              <IconFlag size={16} />
            </span>{" "}
            Report and renewal last calls go to everyone on the account, not just whoever
            owns the row.
          </p>
        </div>
      </section>

      {/* --------------------------------------------- objection killer --- */}
      <section className="rule-t" style={{ background: "var(--color-sheet)" }}>
        <div className="mx-auto max-w-[680px] px-5 py-14">
          <p className="t-label">The objection</p>
          <h2 className="t-h2 mt-3">&ldquo;How do I know the data is real?&rdquo;</h2>
          <p className="t-body mt-4" style={{ color: "var(--color-ink-2)" }}>
            Because we tell you when it is not. This build ships ten{" "}
            <strong>sample</strong> funder records so you can see the product work — their
            names begin &ldquo;Sample&rdquo;, their EINs are not IRS-issued, their links go
            to example.org, and every card carries a sample mark. Nothing is dressed up as
            a live opportunity.
          </p>
          <p className="t-body mt-4" style={{ color: "var(--color-ink-2)" }}>
            Real records come from IRS 990-PF filings — public, free, and machine-readable
            — and reach the discovery feed only after a person has read the funder&rsquo;s
            own guidelines. Every record shows the date it was last reviewed, and there is
            a one-tap way to tell us it has changed. Curated and narrow beats exhaustive
            and stale when a bad lead costs you a week.
          </p>
          <div className="mt-6">
            {[
              "Fit scores refuse to appear at all until your profile can support them",
              "Long shots are labelled long shots",
              "Unknown is shown as unknown, never as no",
              "Your pipeline, calendar and library work whether or not you use discovery",
            ].map((line) => (
              <div key={line} className="flex items-start gap-3 rule-t py-3">
                <span style={{ marginTop: 2, color: "var(--color-leaf-text)" }}>
                  <IconCheck size={18} />
                </span>
                <span className="t-secondary">{line}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ the math --- */}
      <section className="rule-t">
        <div className="mx-auto max-w-[680px] px-5 py-14">
          <p className="t-label">The math</p>
          <h2 className="t-h2 mt-3">One $10,000 grant pays for fourteen years.</h2>
          <div className="mt-6">
            {[
              { label: "GrantGrid, Seed, annual", value: "$590 / yr" },
              { label: "One modest grant you would otherwise have missed", value: "$10,000" },
              { label: "A grant consultant, one application", value: "$1,500 – $5,000" },
              { label: "Your own hours, retyping the same mission paragraph", value: "the real cost" },
            ].map((line) => (
              <div key={line.label} className="flex items-baseline justify-between gap-3 rule-t py-3">
                <span className="t-secondary min-w-0 flex-1">{line.label}</span>
                <span className="t-data shrink-0">{line.value}</span>
              </div>
            ))}
          </div>
          <p className="t-secondary rule-t pt-4" style={{ color: "var(--color-ink-2)" }}>
            The one number we will not invent is how much you will raise. That depends on
            your programs and your writing, not on our software.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------- pricing --- */}
      <section className="rule-t" style={{ background: "var(--color-sheet)" }}>
        <div className="mx-auto max-w-[1160px] px-5 py-14">
          <p className="t-label">Pricing</p>
          <h2 className="t-h2 mt-3">Per organization. Not per seat.</h2>
          <p className="t-body mt-3" style={{ color: "var(--color-ink-2)" }}>
            Small teams share a login. Charging you for admitting it would be hostile.
          </p>

          <div className="mt-8 md:grid md:grid-cols-3 md:gap-4">
            {PLAN_ORDER.map((id) => {
              const spec = PLANS[id];
              return (
                <article key={id} className="card mt-4 p-4 md:mt-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="t-title">{spec.name}</h3>
                    <span className="t-data-lg">{priceLabel(id, "monthly")}</span>
                  </div>
                  <p className="t-secondary mt-1">{spec.blurb}</p>
                  <p className="t-label mt-1" style={{ color: "var(--color-gold-text)" }}>
                    {annualSavingLabel(id)} paid annually
                  </p>
                  <ul
                    className="mt-3 flex flex-col gap-2"
                    style={{ listStyle: "none", padding: 0 }}
                  >
                    {spec.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <span style={{ color: "var(--color-leaf-text)", marginTop: 4, lineHeight: 0 }}>
                          <IconCheck size={16} />
                        </span>
                        <span className="t-secondary">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>

          <div className="mt-8 flex flex-col items-start gap-3">
            <CtaButton />
            <p className="t-secondary" style={{ color: "var(--color-ink-2)" }}>
              Downgrade and nothing is deleted, hidden, or stops being reminded about.
            </p>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- final CTA --- */}
      <section className="rule-t">
        <div className="mx-auto max-w-[680px] px-5 py-16">
          <h2 className="t-display">Stop guessing which funders to chase.</h2>
          <p className="t-body mt-4" style={{ color: "var(--color-ink-2)" }}>
            Put your pipeline in, get your dates covered, and read the reasons behind every
            score. If it is not obviously better than the spreadsheet in a fortnight, walk
            away — we did not take a card.
          </p>
          <div className="mt-8 flex flex-col items-start gap-3">
            <CtaButton />
          </div>
        </div>
      </section>

      <footer className="rule-t">
        <div className="mx-auto max-w-[1160px] px-5 py-10">
          <p className="t-label">GrantGrid</p>
          <p className="t-secondary mt-2" style={{ color: "var(--color-ink-2)" }}>
            Grant pipeline, deadline calendar, fit-scored discovery and a reusable answer
            library for US nonprofits without a grants manager. Pre-launch: the funder
            records shipped today are samples, clearly marked as such throughout.
          </p>
          <p className="t-secondary mt-3">
            <Link href="/login" className="btn-quiet" style={{ minHeight: 0 }}>
              Sign in
            </Link>
            {" · "}
            <Link href="/signup" className="btn-quiet" style={{ minHeight: 0 }}>
              {CTA}
            </Link>
          </p>
        </div>
      </footer>

      {/* Sticky mobile CTA — the same words, in the thumb zone. */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 px-5 pb-5 pt-3 lg:hidden"
        style={{
          background: "color-mix(in srgb, var(--color-manila) 94%, transparent)",
          backdropFilter: "blur(12px)",
          borderTop: "1px solid var(--color-hairline)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)",
        }}
      >
        <Link href="/signup" className="btn btn-primary w-full">
          {CTA}
        </Link>
      </div>
      <div className="h-24 lg:hidden" aria-hidden="true" />
    </main>
  );
}
