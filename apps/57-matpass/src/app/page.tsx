/**
 * src/app/page.tsx — the marketing page, built last, to MARKETING_PLAYBOOK.md.
 *
 * Enemy: the index-card ledger. The stripe that got forgotten, the kid whose
 * grading got missed, the student who quietly quit three weeks before anyone
 * noticed.
 *
 * One sentence the whole page exists to prove: *every stripe earned, on the wall
 * and on record.*
 *
 * Device: the belt bar (HeroBelt) — the counter ticks, the bar fills, a stripe
 * seats with a snap, then the grading list adds the name by itself.
 *
 * Receipts: MatPass is pre-launch, so there are no customers to quote and none
 * are invented. Every figure here is either the product's own arithmetic shown
 * working, a publicly published competitor price with its source linked, or a
 * clearly labelled staged demonstration. Law 5 — no fabricated receipts, ever.
 *
 * One CTA phrase, verbatim, at hero / post-proof / post-pricing / sticky bar:
 * "Start free — 14 days".
 */

import type { Metadata } from "next";
import Link from "next/link";
import { HeroBelt } from "@/components/marketing/HeroBelt";
import { IconBeltBar, IconCheck } from "@/components/icons";
import { annualCents, formatMoney, PLANS, PLAN_ORDER } from "@/lib/plans";

export const metadata: Metadata = {
  title: "MatPass — every stripe earned, on the wall and on record",
  description:
    "Martial-arts school software built on the progression ledger. Belt and stripe tracking per curriculum, kiosk check-in, grading events that assemble their own eligibility list, family billing on your own Stripe, and a drop-off alarm that fires while the student is still saveable. Start free — 14 days.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "MatPass — every stripe earned, on the wall and on record",
    description:
      "The grading list assembles itself. The drop-off alarm fires while the student is still saveable. Start free — 14 days, no card.",
    type: "website",
  },
};

const CTA = "Start free — 14 days";

const FEATURES: [string, string][] = [
  [
    "Curricula that mean something",
    "Rank ladders with minimum classes, minimum days in rank, stripe steps and instructor sign-off. Templates for BJJ adult and kids, karate, taekwondo and judo, all editable.",
  ],
  [
    "Kiosk check-in in five seconds",
    "A device-token-locked tablet at the door. Three letters of a name or a PIN, tap the class, done. Offline taps queue on the tablet and sync exactly once.",
  ],
  [
    "Grading events, end to end",
    "Eligible and near-miss lists, invitations to the household, event-day promote/hold/no-show, and a batch review before anything is written.",
  ],
  [
    "Promotions that are permanent",
    "Every promotion carries its date, its event and its grader. A correction appends a reversal — the record is never quietly rewritten.",
  ],
  [
    "Families, not line items",
    "One household, three students, one payment method, one family rate. Tuition bills on your own Stripe account; we never touch it.",
  ],
  [
    "Attendance never held hostage",
    "A past-due family's kid still checks in. The desk sees the card failure and has the conversation. That is a rule, with a test behind it.",
  ],
];

const COMPARISONS: [string, string, string, string | null][] = [
  [
    "Kicksite",
    "$49–199/mo by student count",
    "Belt tracking without deep eligibility rules; retention as a report you have to remember to open.",
    "https://www.wodify.com/blog/pricing-guide-martial-arts-software",
  ],
  [
    "Zen Planner",
    "$99–289/mo, commonly $348–525+ with add-ons",
    "Gym software wearing a gi. The martial-arts features are a skin over a membership database.",
    "https://zenplanner.com/pricing/",
  ],
  [
    "Gymdesk",
    "$75–200/mo by member count",
    "The closest modern competitor, and fairly priced — but a thinner progression model and generic retention analytics.",
    "https://gymdesk.com/blog/best-martial-arts-management-software",
  ],
  [
    "The whiteboard and index cards",
    "Free",
    "The forgotten stripe, the skipped grading, and the student who quit three weeks before you noticed.",
    null,
  ],
];

export default function LandingPage() {
  return (
    <>
      <header className="marketing" style={{ paddingTop: 20 }}>
        <nav className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2 fg">
            <span className="crimson">
              <IconBeltBar size={22} />
            </span>
            <span className="t-title">MatPass</span>
          </span>
          <Link href="/login" className="t-secondary crimson">
            Sign in
          </Link>
        </nav>
      </header>

      <main className="marketing">
        {/* ---------------------------------------------------------- hero */}
        <section className="hero-grid" style={{ paddingTop: 32 }}>
          <div>
            <p className="t-label">Martial-arts school management</p>
            <h1 className="t-display lede" style={{ marginTop: 12 }}>
              Every stripe earned, on the wall and on record.
            </h1>
            <p className="t-body prose" style={{ marginTop: 20 }}>
              Your school is a progression machine. Every student is somewhere on a ladder — and right
              now that ladder lives on index cards, a whiteboard, and your memory. MatPass is the
              ledger: curricula with real requirements, check-ins that feed eligibility, and grading
              events that assemble their own candidate list.
            </p>
            <div className="flex items-center gap-4" style={{ marginTop: 24, flexWrap: "wrap" }}>
              <Link href="/signup" className="btn btn-primary">
                {CTA}
              </Link>
              <span className="t-secondary">
                No card required. Import your students in an evening.
              </span>
            </div>
          </div>
          <div style={{ marginTop: 32 }}>
            <HeroBelt />
            <p className="t-secondary fg-3" style={{ marginTop: 12 }}>
              A staged demonstration with invented students — MatPass is pre-launch and has no
              customer data to show. This is the real interface, running on made-up names.
            </p>
          </div>
        </section>

        {/* -------------------------------------------------------- enemy */}
        <section>
          <p className="t-label">What you are actually fighting</p>
          <h2 className="t-h2 lede" style={{ marginTop: 12 }}>
            Three places to check, and one of them is your memory.
          </h2>
          <div className="split-even" style={{ marginTop: 24 }}>
            <div>
              <p className="t-title">The stripe that got forgotten</p>
              <p className="t-secondary prose" style={{ marginTop: 6 }}>
                A kid hits twenty classes in a rank that needs twenty. Nobody counted, so nobody
                noticed, so nothing happened. He noticed.
              </p>
            </div>
            <div>
              <p className="t-title">The grading that skipped a kid</p>
              <p className="t-secondary prose" style={{ marginTop: 6 }}>
                Eleven names on the index cards; twelve deserved to be there. You found out from the
                parent, in the car park, afterwards.
              </p>
            </div>
            <div>
              <p className="t-title">&ldquo;When does she test?&rdquo;</p>
              <p className="t-secondary prose" style={{ marginTop: 6 }}>
                The honest answer today is &ldquo;let me check three places&rdquo;. The honest answer
                in MatPass is a progress bar the parent could read over your shoulder.
              </p>
            </div>
            <div>
              <p className="t-title">The quiet quit</p>
              <p className="t-secondary prose" style={{ marginTop: 6 }}>
                Marcus has not trained in three weeks. In this industry that three weeks <em>is</em>{" "}
                the cancellation — it just has not been emailed yet.
              </p>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------- the device */}
        <section className="beat-scroll">
          <p className="t-label">The self-assembling list</p>
          <h2 className="t-h2 lede" style={{ marginTop: 12 }}>
            &ldquo;Who&rsquo;s ready to test?&rdquo; is a query, not a weekend.
          </h2>
          <p className="t-body prose" style={{ marginTop: 16 }}>
            Pick a date and your programs. MatPass measures every active enrollment against its rank
            requirements — classes since the last promotion, days in rank, instructor sign-off where
            the curriculum demands one — and hands you two lists.
          </p>

          <div className="card" style={{ padding: 20, marginTop: 24 }}>
            <p className="t-label">Eligible</p>
            <div className="row">
              <div style={{ flex: 1 }}>
                <p className="t-title">Amara Okafor</p>
                <p className="t-data fg-2" style={{ marginTop: 4 }}>
                  12 / 12 classes · 41 / 36 days
                </p>
              </div>
              <span className="pill pill-eligible">Eligible</span>
            </div>
            <div className="row">
              <div style={{ flex: 1 }}>
                <p className="t-title">Tomas Lindqvist</p>
                <p className="t-data fg-2" style={{ marginTop: 4 }}>
                  20 / 20 classes · 152 / 146 days
                </p>
              </div>
              <span className="pill pill-eligible">Eligible</span>
            </div>
            <p className="t-label" style={{ paddingTop: 24 }}>
              Near miss — the coaching list
            </p>
            <div className="row">
              <div style={{ flex: 1 }}>
                <p className="t-title">Sofia Reyes</p>
                <p className="t-data fg-2" style={{ marginTop: 4 }}>
                  10 / 12 classes · 58 / 36 days
                </p>
                <p className="t-data amber" style={{ marginTop: 4 }}>
                  2 classes short
                </p>
              </div>
              <span className="pill pill-warn">Near miss</span>
            </div>
            <div className="row">
              <div style={{ flex: 1 }}>
                <p className="t-title">Priya Raman</p>
                <p className="t-data fg-2" style={{ marginTop: 4 }}>
                  14 / 12 classes · 25 / 36 days
                </p>
                <p className="t-data amber" style={{ marginTop: 4 }}>
                  11 days short
                </p>
              </div>
              <span className="pill pill-warn">Near miss</span>
            </div>
          </div>
          <p className="t-secondary fg-3" style={{ marginTop: 12 }}>
            Staged demonstration, invented students. The near-miss deltas are what the engine actually
            computes — &ldquo;2 classes short&rdquo; means exactly two.
          </p>
        </section>

        {/* ----------------------------------------------------- the math */}
        <section className="beat-scroll">
          <p className="t-label">The math</p>
          <h2 className="t-h2 lede" style={{ marginTop: 12 }}>
            One saved family pays for the year.
          </h2>
          <div className="split-even" style={{ marginTop: 24 }}>
            <div className="card" style={{ padding: 20 }}>
              <p className="t-label">A 150-student school</p>
              <p className="t-stat" style={{ marginTop: 8 }}>
                {formatMoney(PLANS.academy.priceCents)}
              </p>
              <p className="t-secondary" style={{ marginTop: 8 }}>
                per month on the Academy plan — about half of one student&rsquo;s tuition at
                $130&ndash;180 a month.
              </p>
            </div>
            <div className="card" style={{ padding: 20 }}>
              <p className="t-label">One family caught before they quit</p>
              <p className="t-stat" style={{ marginTop: 8 }}>
                {formatMoney(180000)}
              </p>
              <p className="t-secondary" style={{ marginTop: 8 }}>
                a $150-a-month family, retained for a year. That is the software paid for, with{" "}
                {formatMoney(180000 - annualCents("academy"))} left over.
              </p>
            </div>
          </div>
          <p className="t-secondary prose" style={{ marginTop: 16 }}>
            Plus the hours before every grading, refunded. Counting one student&rsquo;s classes across
            index cards takes minutes; counting 150 takes a weekend. MatPass takes the query.
          </p>
        </section>

        {/* -------------------------------------------- objection killer */}
        <section className="beat-scroll">
          <p className="t-label">The objection</p>
          <h2 className="t-h2 lede" style={{ marginTop: 12 }}>
            &ldquo;My whiteboard works fine.&rdquo;
          </h2>
          <p className="t-body prose" style={{ marginTop: 16 }}>
            It does — until the fourth program, the second location, or the quiet quit. A whiteboard
            has one blind spot that costs real money: it cannot tell you who <em>stopped</em> coming.
          </p>
          <div className="card" style={{ padding: 20, marginTop: 24 }}>
            <p className="t-label">The drop-off alarm</p>
            <p className="t-title" style={{ marginTop: 8 }}>
              Marcus Okafor
            </p>
            <p className="t-data" style={{ marginTop: 8 }}>
              last seen 19 days ago · was 3x/week · now 0.3x/week
            </p>
            <p className="t-secondary" style={{ marginTop: 8 }}>
              Okafor family · one tap logs the call, the note, and the outcome.
            </p>
            <div className="flex items-center gap-2" style={{ marginTop: 16 }}>
              <span className="pill pill-alarm">Flagged</span>
            </div>
          </div>
          <p className="t-secondary prose" style={{ marginTop: 16 }}>
            The baseline is the student&rsquo;s own cadence, not a blanket &ldquo;inactive 30
            days&rdquo;. A 3x/week kid who drops to once is in trouble; a steady 1x/week adult is
            fine. So the alarm is personal, and it is early — while the student is still saveable.
          </p>
          <p className="t-secondary fg-3" style={{ marginTop: 12 }}>
            Staged demonstration. We will publish real recovery rates when design-partner schools have
            given us real numbers and permission to quote them — not before.
          </p>
        </section>

        {/* ------------------------------------------------ what you get */}
        <section>
          <p className="t-label">In every plan</p>
          <h2 className="t-h2 lede" style={{ marginTop: 12 }}>
            The ledger first. Billing bolted onto it, not the other way round.
          </h2>
          <div className="split-even" style={{ marginTop: 24 }}>
            {FEATURES.map(([title, body]) => (
              <div key={title}>
                <p className="t-title flex items-center gap-2">
                  <span className="crimson" style={{ flex: "none" }}>
                    <IconCheck size={18} />
                  </span>
                  {title}
                </p>
                <p className="t-secondary prose" style={{ marginTop: 6 }}>
                  {body}
                </p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 32 }}>
            <Link href="/signup" className="btn btn-primary">
              {CTA}
            </Link>
          </div>
        </section>

        {/* -------------------------------------------------- the pricing */}
        <section className="beat-scroll">
          <p className="t-label">Pricing</p>
          <h2 className="t-h2 lede" style={{ marginTop: 12 }}>
            Priced by student count. Every feature in every tier.
          </h2>
          <p className="t-body prose" style={{ marginTop: 16 }}>
            No per-feature ransom, no add-on that doubles the bill in month three. Annual is two
            months free, and payment processing is at Stripe&rsquo;s standard rates — we take no
            markup on your tuition.
          </p>

          <div className="price-grid" style={{ marginTop: 24 }}>
            {PLAN_ORDER.map((tier) => {
              const plan = PLANS[tier];
              return (
                <div key={tier} className="card" style={{ padding: 20 }}>
                  <p className="t-label">{plan.name}</p>
                  <p className="t-stat" style={{ marginTop: 8 }}>
                    {formatMoney(plan.priceCents)}
                  </p>
                  <p className="t-secondary" style={{ marginTop: 4 }}>
                    per month · up to {plan.studentLimit} students
                  </p>
                  <p className="t-data fg-3" style={{ marginTop: 8 }}>
                    {formatMoney(annualCents(tier))}/year
                  </p>
                  <p className="t-secondary" style={{ marginTop: 12 }}>
                    {plan.blurb}
                  </p>
                  <ul style={{ marginTop: 16, paddingLeft: 0, listStyle: "none" }}>
                    {plan.includes.map((item) => (
                      <li key={item} className="t-secondary" style={{ marginTop: 6 }}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <p className="t-label" style={{ paddingTop: 40 }}>
            Anchored against what you would otherwise pay
          </p>
          <div className="scroll-x" style={{ marginTop: 12 }}>
            <table style={{ borderCollapse: "collapse", minWidth: 520, width: "100%" }}>
              <thead>
                <tr>
                  <th className="t-label" style={{ textAlign: "left", padding: "8px 12px 8px 0" }}>
                    Instead of
                  </th>
                  <th className="t-label" style={{ textAlign: "left", padding: "8px 12px" }}>
                    Published price
                  </th>
                  <th className="t-label" style={{ textAlign: "left", padding: "8px 0 8px 12px" }}>
                    What it costs you
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISONS.map(([name, price, cost, href]) => (
                  <tr key={name} className="hairline-t">
                    <td
                      className="t-title"
                      style={{ padding: "12px 12px 12px 0", verticalAlign: "top" }}
                    >
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer">
                          {name}
                        </a>
                      ) : (
                        name
                      )}
                    </td>
                    <td className="t-data fg-2" style={{ padding: 12, verticalAlign: "top" }}>
                      {price}
                    </td>
                    <td
                      className="t-secondary"
                      style={{ padding: "12px 0 12px 12px", verticalAlign: "top" }}
                    >
                      {cost}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="t-secondary fg-3" style={{ marginTop: 12 }}>
            Competitor prices are the ones they publish, linked above, as of this writing. Check them
            yourself — they change.
          </p>

          <div style={{ marginTop: 32 }}>
            <Link href="/signup" className="btn btn-primary">
              {CTA}
            </Link>
          </div>
        </section>

        {/* ------------------------------------------------ the exit ramp */}
        <section>
          <p className="t-label">Not ready</p>
          <h2 className="t-h2 lede" style={{ marginTop: 12 }}>
            Then start with one question you cannot answer today.
          </h2>
          <p className="t-body prose" style={{ marginTop: 16 }}>
            Load a curriculum template, paste in one program&rsquo;s roster with its rank and
            last-promoted columns, and let MatPass tell you who could grade this quarter. That takes
            about ten minutes and no card — and if the answer surprises you, you already know what the
            index cards have been costing.
          </p>
          <p className="t-secondary prose" style={{ marginTop: 16 }}>
            Your data is yours: the roster, the promotion history and the attendance ledger all export
            as CSV, on any plan, whenever you like.
          </p>
        </section>

        {/* ------------------------------------------------------ closing */}
        <section>
          <h2 className="t-display lede">Every stripe earned, on the wall and on record.</h2>
          <div className="flex items-center gap-4" style={{ marginTop: 24, flexWrap: "wrap" }}>
            <Link href="/signup" className="btn btn-primary">
              {CTA}
            </Link>
            <span className="t-secondary">
              No card required. Import your students in an evening.
            </span>
          </div>
        </section>

        <footer className="hairline-t" style={{ marginTop: 56, paddingTop: 24 }}>
          <p className="t-secondary fg-3">
            MatPass — the progression ledger for martial-arts schools. Pre-launch: no customer
            testimonials, logos or usage figures appear on this page, because there are none to show
            yet.
          </p>
          <p className="t-secondary" style={{ marginTop: 8 }}>
            <Link href="/login">Sign in</Link> · <Link href="/signup">Start a trial</Link>
          </p>
        </footer>
      </main>

      {/* The sticky mobile CTA — the same phrase, a fourth time. */}
      <div className="sticky-cta">
        <Link href="/signup" className="btn btn-primary btn-full">
          {CTA}
        </Link>
      </div>
    </>
  );
}
