import type { Metadata } from "next";
import Link from "next/link";
import {
  IconCheck,
  IconEye,
  IconMapPin,
  IconPennant,
} from "@/components/icons";

/**
 * The marketing page, to MARKETING_PLAYBOOK.md.
 *
 * Message architecture, written before any markup:
 *
 *  - **Enemy:** the ten hours a week a volunteer registrar loses to a Google Form,
 *    Venmo screenshots, a spreadsheet, and forty "what time is the game?" texts.
 *  - **One sentence:** RosterRally runs the season, so opening it, filling it and
 *    getting paid for it takes a weekend instead of a term.
 *  - **Device (playbook row 45):** *Season opened, filled, and paid in a weekend.*
 *  - **Arc:** hook (the gate catching a double-booked field) → tension (the ten
 *    hours) → proof (what the software does, shown as its own output) → offer
 *    (the arithmetic against SportsEngine) → one CTA, repeated verbatim.
 *
 * Four animated beats and no more: the conflict gate resolving, the device
 * landing, the receipts filling in, and the arithmetic writing itself out. Every
 * number on this page is either the product's own pricing or a cited public figure
 * from README.md. There are no testimonials, because we have no customers yet, and
 * inventing one is a debt the brand never pays off.
 */

export const metadata: Metadata = {
  title: "RosterRally — season opened, filled, and paid in a weekend",
  description:
    "Youth sports club operations for the volunteer registrar: season registration with payments, rosters, conflict-checked schedules, parent messages you can prove arrived, and volunteer signups. $1.50 per paid registration, or $49/mo flat.",
};

const CTA = "Open your season";

export default function LandingPage() {
  return (
    <div className="world-night min-h-dvh">
      {/* ---- Hero: the machine running, before any claim ------------------ */}
      <header className="screen-plain pt-10">
        <p className="t-label">RosterRally</p>
        <h1 className="t-display mt-4 max-w-[22ch]">
          Season opened, filled, and paid in a weekend.
        </h1>
        <p className="t-body mt-5 max-w-[52ch]" style={{ color: "var(--fg-2)" }}>
          Registration, rosters, a schedule that refuses to publish itself broken, and messages you
          can prove arrived. Built for the one volunteer who does all of it on a Tuesday night.
        </p>

        {/* Beat 1 — the conflict gate, caught and cleared. */}
        <section className="panel mt-8 p-4" aria-label="The conflict gate, before and after">
          <p className="t-label">Saturday · Miller Park</p>

          <div className="mt-3 beat-line" style={{ animationDelay: "0ms" }}>
            <div className="row">
              <span className="t-data" style={{ width: 56 }}>
                9:00A
              </span>
              <span className="min-w-0 flex-1">
                <span className="t-title block">Thunder v Rapids · U10 Boys</span>
                <span className="t-secondary flex items-center gap-1" style={{ color: "var(--fg-3)" }}>
                  <IconMapPin size={14} />
                  Miller Park · Field 2
                </span>
              </span>
            </div>
          </div>

          <div className="beat-line" style={{ animationDelay: "120ms" }}>
            <div className="row">
              <span className="t-data" style={{ width: 56 }}>
                10:29A
              </span>
              <span className="min-w-0 flex-1">
                <span className="t-title block">Comets practice · U12 Girls</span>
                <span className="t-secondary flex items-center gap-1" style={{ color: "var(--fg-3)" }}>
                  <IconMapPin size={14} />
                  Miller Park · Field 2
                </span>
                <span className="mt-2 block">
                  <span className="pennant" data-severity="hard">
                    <IconPennant size={14} />
                    FIELD OVERLAP
                  </span>
                </span>
              </span>
            </div>
          </div>

          <div className="beat-line mt-3" style={{ animationDelay: "260ms" }}>
            <p className="t-secondary" style={{ color: "var(--bad)" }}>
              1 HARD · PUBLISH BLOCKED — one minute of overlap on one patch of grass. Back-to-back at
              10:30 would have been fine.
            </p>
          </div>

          <div className="beat-line mt-4 hairline-t pt-4" style={{ animationDelay: "420ms" }}>
            <div className="row row-clear">
              <span className="t-data" style={{ width: 56 }}>
                10:30A
              </span>
              <span className="min-w-0 flex-1">
                <span className="t-title block">Comets practice · U12 Girls</span>
                <span className="t-secondary flex items-center gap-1" style={{ color: "var(--fg-3)" }}>
                  <IconMapPin size={14} />
                  Miller Park · Field 2
                </span>
              </span>
              <span className="pennant" data-severity="clear">
                <IconCheck size={14} />
                All clear
              </span>
            </div>
            <p className="t-secondary mt-3 turf">Published to 94 families · 61 by text</p>
          </div>
        </section>

        <p className="mt-6">
          <Link href="/signup" className="btn btn-primary btn-full">
            {CTA}
          </Link>
        </p>
        <p className="t-secondary mt-3" style={{ color: "var(--fg-3)" }}>
          No card. Parents never download anything. The screen above is our own demo club, staged
          from real product output.
        </p>
      </header>

      {/* ---- The enemy, named ------------------------------------------- */}
      <section className="screen-plain beat2 pt-16">
        <p className="t-label">The Tuesday night</p>
        <h2 className="t-h2 mt-3 max-w-[30ch]">
          Ten hours a week, unpaid, and the schedule still went out wrong.
        </h2>
        <div className="mt-6 max-w-[54ch]">
          <p className="t-body">
            A Google Form nobody can edit twice. Venmo screenshots against a spreadsheet. Rosters in
            a second spreadsheet. And the email that went out on Thursday, before anyone noticed the
            U10 and U12 games were on the same field at the same hour.
          </p>
          <p className="t-body mt-4">
            The fix is not a bigger platform. It is a console that assumes a volunteer, defaults
            everything, and refuses to let you send the broken version.
          </p>
        </div>

        <div className="mt-8 flex items-baseline gap-6">
          <div>
            <p className="t-label">Before</p>
            <p className="t-stat" style={{ color: "var(--fg-3)" }}>
              10<span className="t-data">hrs/wk</span>
            </p>
          </div>
          <div>
            <p className="t-label">With RosterRally</p>
            <p className="t-stat" style={{ color: "var(--color-chalk)" }}>
              20<span className="t-data">min</span>
            </p>
          </div>
        </div>
        <p className="t-secondary mt-2" style={{ color: "var(--fg-3)" }}>
          Our own target for a registrar's weekly load once a season is open. We will publish
          measured numbers from design-partner clubs when we have them, not before.
        </p>
      </section>

      {/* ---- Proof: the product's own output ---------------------------- */}
      <section className="screen-plain beat3 pt-16">
        <p className="t-label">What it actually does</p>
        <h2 className="t-h2 mt-3 max-w-[30ch]">Four things, each one a Tuesday you get back.</h2>

        <div className="mt-8 split-even">
          <div>
            <p className="t-title">Registration that finishes</p>
            <p className="t-secondary mt-2">
              One child per screen, a real waiver checkbox with the text inline, sibling discounts
              and scholarship codes applied in front of the parent. Deposit plus monthly payments
              when a family needs it. Capacity and waitlists handled without a human.
            </p>
          </div>
          <div>
            <p className="t-title">A schedule with a gate</p>
            <p className="t-secondary mt-2">
              Same field, same time — blocked. One team in two places — blocked. A coach on two teams
              or a family with two children playing at once — flagged for your call, recorded against
              your name. Correct across a daylight-saving weekend, because times are instants, not
              strings.
            </p>
          </div>
          <div>
            <p className="t-title">Messages you can prove arrived</p>
            <p className="t-secondary mt-2">
              Per-family delivery and read state, and one tap to re-send to exactly the households
              who have not opened it. Texts show delivery and link views, never a fake &ldquo;read&rdquo;
              — nobody can observe an SMS being read, so we do not pretend to.
            </p>
          </div>
          <div>
            <p className="t-title">Volunteers, without the clipboard</p>
            <p className="t-secondary mt-2">
              Snack bar, field lines, scorekeeper — capacity enforced, claimed from a link with no
              login, reminded the day before. The nudge goes only to families who have not done a
              shift yet.
            </p>
          </div>
        </div>

        {/* Beat 3 — receipts filling in. */}
        <div className="panel mt-8 p-4">
          <p className="t-label">Rain plan for Saturday · sent to 94</p>
          {[
            ["The Alvarez family", "OPENED 6:42P", "var(--accent)"],
            ["The Okonkwo family", "OPENED 7:03P", "var(--accent)"],
            ["The Brennan family", "DELIVERED", "var(--fg-2)"],
            ["The Nguyen family", "VIEWED LINK 8:15P", "var(--accent)"],
            ["The Santos family", "BOUNCED", "var(--bad)"],
          ].map(([who, state, color], i) => (
            <div key={who} className="row beat-line" style={{ animationDelay: `${i * 90}ms` }}>
              <span className="t-title flex-1">{who}</span>
              <span className="t-data flex items-center gap-1" style={{ color }}>
                {state.startsWith("OPENED") || state.startsWith("VIEWED") ? <IconEye size={12} /> : null}
                {state}
              </span>
            </div>
          ))}
          <p className="t-secondary mt-3 turf">Re-send to 1 unreached</p>
        </div>
        <p className="t-secondary mt-3" style={{ color: "var(--fg-3)" }}>
          A staged demo of the receipt grid, with our own demo club&apos;s data.
        </p>
      </section>

      {/* ---- Objection killer ------------------------------------------ */}
      <section className="screen-plain pt-16">
        <p className="t-label">The objection we hear first</p>
        <h2 className="t-h2 mt-3 max-w-[32ch]">
          &ldquo;Our parents will never use another app.&rdquo;
        </h2>
        <p className="t-body mt-4 max-w-[54ch]">
          They will not have to. There is no app. A parent gets one link that is their schedule, their
          messages, what they owe and the volunteer slots they can claim — for the whole season, with
          no password to forget. A calendar feed they subscribe to once keeps moving when you move a
          game.
        </p>
        <p className="t-body mt-4 max-w-[54ch]">
          And the data about their children stays where it should: medical notes are encrypted, hidden
          from coaches and left out of every export, and no family&apos;s page ever shows another
          family&apos;s contact details.
        </p>
      </section>

      {/* ---- The math, written out -------------------------------------- */}
      <section className="screen-plain beat4 pt-16">
        <p className="t-label">The arithmetic</p>
        <h2 className="t-h2 mt-3">A 150-registration club, one season.</h2>

        <div className="panel mt-6 p-4">
          <div className="row">
            <span className="t-title flex-1">SportsEngine, entry tier</span>
            <span className="t-data">$799/yr + per-transaction fees</span>
          </div>
          <div className="row">
            <span className="t-title flex-1">TeamSnap, per team</span>
            <span className="t-data">up to $150/yr × every team</span>
          </div>
          <div className="row">
            <span className="t-title flex-1">RosterRally, per registration</span>
            <span className="t-data turf">150 × $1.50 = $225/yr</span>
          </div>
          <div className="row">
            <span className="t-title flex-1">RosterRally, flat</span>
            <span className="t-data turf">$49/mo — everything unlimited</span>
          </div>
        </div>
        <p className="t-secondary mt-3" style={{ color: "var(--fg-3)" }}>
          Incumbent prices as published at the time of writing (SportsEngine entry pricing and
          TeamSnap team plans; see the comparison notes in our README). Stripe&apos;s processing fees
          are separate and stated plainly to parents. Scholarship codes never carry our fee, and a
          refund gives it back.
        </p>

        <div className="mt-8">
          <p className="t-label">Pricing, in full</p>
          <div className="mt-2 split-even">
            <div className="panel p-4">
              <p className="t-title">Per registration</p>
              <p className="t-stat mt-2" style={{ color: "var(--color-chalk)" }}>
                $1.50
              </p>
              <p className="t-secondary mt-2">
                Per paid registration. Pass it to parents as its own honest line, or absorb it.
                Unlimited teams, messages and volunteers. Free for the club otherwise.
              </p>
            </div>
            <div className="panel p-4">
              <p className="t-title">Club flat</p>
              <p className="t-stat mt-2" style={{ color: "var(--color-chalk)" }}>
                $49<span className="t-data">/mo</span>
              </p>
              <p className="t-secondary mt-2">
                For clubs that hate per-fees or run a lot of scholarship places. Everything
                unlimited. No per-team or per-seat pricing, ever.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Final CTA: the same words ---------------------------------- */}
      <section className="screen-plain pt-16 pb-24">
        <h2 className="t-h2 max-w-[26ch]">
          Open the season this weekend. Post one link. Watch it fill.
        </h2>
        <p className="t-body mt-4 max-w-[50ch]" style={{ color: "var(--fg-2)" }}>
          Registration, rosters, schedule, messages and volunteers — one product, built for the person
          who is doing all five jobs already.
        </p>
        <p className="mt-6 max-w-[320px]">
          <Link href="/signup" className="btn btn-primary btn-full">
            {CTA}
          </Link>
        </p>
        <p className="t-secondary mt-3">
          Already set up? <Link href="/login">Sign in</Link>
        </p>
        <p className="t-secondary mt-10" style={{ color: "var(--fg-3)" }}>
          RosterRally is pre-launch. Every screen on this page is our own demo club, labelled as such.
          When we have design-partner clubs with real seasons behind them, their numbers will replace
          these words.
        </p>
      </section>

      {/* The sticky CTA: the same phrase, in the thumb zone. */}
      <div className="sticky-cta lg:hidden">
        <Link href="/signup" className="btn btn-primary btn-full">
          {CTA}
        </Link>
      </div>
    </div>
  );
}
