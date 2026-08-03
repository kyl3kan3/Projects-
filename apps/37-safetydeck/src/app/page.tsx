import type { Metadata } from "next";
import Link from "next/link";
import { SignOffDemo } from "@/components/marketing/SignOffDemo";
import {
  IconAlertTriangle,
  IconBinderRings,
  IconCheck,
  IconCloudOff,
  IconPenLine,
} from "@/components/icons";
import {
  PLANS,
  PLAN_ORDER,
  SERIOUS_PENALTY_CENTS,
  WILLFUL_PENALTY_CENTS,
  formatUsd,
  monthsCoveredByOneCitation,
} from "@/lib/plans";
import { SEED_TALKS } from "@/content/talks";

export const metadata: Metadata = {
  title: "SafetyDeck — the signature that beats the citation",
  description:
    "Toolbox talks your foreman runs from a phone, crew signatures captured at the huddle, and an incident log that comes out the other end as a correct OSHA 300A. When OSHA asks for your records, you hand them a binder in one tap.",
  openGraph: {
    title: "SafetyDeck — the signature that beats the citation",
    description:
      "The OSHA compliance kit sized to a real contractor: toolbox talks with on-phone crew sign-off, an incident log that emits correct 300/300A output, and a cert-expiry tracker.",
    type: "website",
  },
};

/** The one CTA phrase, repeated verbatim at hero / post-proof / post-pricing / sticky bar. */
const CTA = "Start the 14-day trial";

export default function LandingPage() {
  const yearsCovered = Math.floor(monthsCoveredByOneCitation("crew") / 12);

  return (
    <>
      <header className="marketing flex items-center justify-between py-5">
        <span className="eyebrow">SafetyDeck</span>
        <nav className="flex items-center gap-5">
          <Link href="#pricing" className="t-secondary" style={{ color: "var(--color-fg-2)" }}>
            Pricing
          </Link>
          <Link href="/login" className="t-secondary" style={{ color: "var(--color-fg-2)" }}>
            Sign in
          </Link>
        </nav>
      </header>

      {/* ---------------- Hero: the machine running ---------------- */}
      <section className="marketing pb-16 pt-4 lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:pt-10">
        <div>
          <p className="eyebrow">For contractors with 10–100 in the field</p>
          <h1 className="t-hero mt-4">
            The signature that beats the citation.
          </h1>
          <p className="t-body mt-5" style={{ color: "var(--color-fg-2)", maxWidth: "38ch" }}>
            Your foreman runs Monday&apos;s toolbox talk from his phone. The crew signs on the
            screen at the huddle — no app, no logins, no signal needed. When OSHA asks for your
            records, you hand them a binder in one tap.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/signup" className="btn btn-primary">
              {CTA}
            </Link>
            <p className="t-secondary">No card. Fourteen days of the whole product.</p>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
            {[
              [IconPenLine, "Signatures at the huddle"],
              [IconCloudOff, "Works with no bars"],
              [IconBinderRings, "300A that prints"],
            ].map(([Icon, label]) => {
              const I = Icon as typeof IconCheck;
              return (
                <li key={label as string} className="t-secondary flex items-center gap-2">
                  <I size={18} style={{ color: "var(--color-hardhat)" }} />
                  {label as string}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="mt-10 lg:mt-0 lg:justify-self-end">
          <SignOffDemo />
          <p className="t-secondary mt-3" style={{ maxWidth: 340 }}>
            A crew sign-off completing, at the size a foreman actually holds. Eight people, eight
            minutes of talk, four minutes of signatures, one phone.
          </p>
        </div>
      </section>

      {/* ---------------- The enemy ---------------- */}
      <section className="marketing beat rule-t py-16">
        <p className="eyebrow">The enemy</p>
        <h2 className="t-h2 mt-3" style={{ maxWidth: "34ch" }}>
          Nobody gets cited for not having the talk. They get cited for not being able to prove
          it.
        </h2>
        <p className="t-body mt-4" style={{ color: "var(--color-fg-2)", maxWidth: "60ch" }}>
          When OSHA shows up — after an incident, a complaint, or a drive-by — the first questions
          are documentary. Show me your training records. Show me your injury log. Show me the
          300A you posted in February. At most small contractors those records are on a clipboard
          in a truck, in a foreman&apos;s photo roll, or nowhere. That gap is the citation.
        </p>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <figure className="panel p-5">
            <p className="t-label">One serious violation, 2025 maximum</p>
            <p className="t-stat mt-2" style={{ color: "var(--color-red)" }}>
              {formatUsd(SERIOUS_PENALTY_CENTS)}
            </p>
            <figcaption className="t-secondary mt-2">
              Per violation. They arrive in multiples.{" "}
              <a href="https://www.osha.gov/penalties" target="_blank" rel="noreferrer">
                osha.gov/penalties
              </a>
            </figcaption>
          </figure>
          <figure className="panel p-5">
            <p className="t-label">Willful or repeated, 2025 maximum</p>
            <p className="t-stat mt-2" style={{ color: "var(--color-red)" }}>
              {formatUsd(WILLFUL_PENALTY_CENTS)}
            </p>
            <figcaption className="t-secondary mt-2">
              Adjusted annually.{" "}
              <a
                href="https://www.osha.gov/news/newsreleases/osha-trade-release/20250114"
                target="_blank"
                rel="noreferrer"
              >
                osha.gov news release
              </a>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ---------------- The math, written out ---------------- */}
      <section className="marketing beat rule-t py-16">
        <p className="eyebrow">The arithmetic</p>
        <h2 className="t-h2 mt-3">$59 a month against $16,550 a citation.</h2>
        <div className="sum mt-6" style={{ maxWidth: 560 }}>
          <div className="sum-row">
            <span className="t-body">Crew plan, one year</span>
            <span className="t-mono" style={{ fontSize: 18 }}>
              {formatUsd(PLANS.crew.annualCents)}
            </span>
          </div>
          <div className="sum-row">
            <span className="t-body">One serious violation, avoided</span>
            <span className="t-mono" style={{ fontSize: 18, color: "var(--color-red)" }}>
              −{formatUsd(SERIOUS_PENALTY_CENTS)}
            </span>
          </div>
          <div className="sum-row sum-total">
            <span className="t-title">Months of SafetyDeck one citation pays for</span>
            <span className="t-stat" style={{ color: "var(--color-hardhat)" }}>
              {monthsCoveredByOneCitation("crew")}
            </span>
          </div>
        </div>
        <p className="t-secondary mt-4" style={{ maxWidth: "60ch" }}>
          That is {yearsCovered} years of the $59 plan for one avoided serious violation, at 2025
          federal penalty levels. And there is a second forcing function that has nothing to do
          with inspectors: the GC prequalification packet that asks for your written safety
          program and your training records before you can bid.
        </p>
      </section>

      {/* ---------------- Receipts (Law 5: honest, never fabricated) ---------------- */}
      <section className="marketing beat rule-t py-16">
        <p className="eyebrow">Receipts</p>
        <h2 className="t-h2 mt-3">This is our own binder, not a customer&apos;s.</h2>
        <p className="t-body mt-4" style={{ color: "var(--color-fg-2)", maxWidth: "60ch" }}>
          SafetyDeck is pre-launch, so there are no customer logos here and no testimonials —
          those get invented on pages like this one, and we would rather earn them. What follows
          is the export from our own test company, staged with a real crew flow on a real phone.
          Every number is what the software produced.
        </p>
        <div className="panel mt-8 overflow-hidden">
          <p className="t-label px-5 pt-5">Staged demo · SafetyDeck test records · 7-page bundle</p>
          <ul className="mt-2 px-5 pb-5">
            {[
              ["Cover and manifest", "Company, range, who exported it, and when"],
              ["Toolbox-talk attendance", "4 signatures, each with device time and sync time"],
              ["OSHA Form 300, 2025 and 2026", "Recordable cases, privacy cases masked"],
              ["OSHA Form 300A, 2026", "2 recordable cases · 9 days away · 10 restricted · certified"],
              ["Cert matrix", "4 employees, 4 cards, status as of the export date"],
              ["Incident list", "Every case including the first-aid-only records"],
            ].map(([title, detail]) => (
              <li key={title} className="rule-b flex items-start gap-3 py-3 last:border-b-0">
                <IconCheck size={18} style={{ color: "var(--color-green)", flex: "none", marginTop: 2 }} />
                <span>
                  <span className="t-title block">{title}</span>
                  <span className="t-secondary block">{detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="t-secondary mt-4">
          Two clocks on every signature, and both of them printed: the device time at the huddle
          and the server time when it synced. Nothing is back-dated to look contemporaneous —
          that is what makes a record worth having.
        </p>
        <div className="mt-8">
          <Link href="/signup" className="btn btn-primary">
            {CTA}
          </Link>
        </div>
      </section>

      {/* ---------------- Objection killer ---------------- */}
      <section className="marketing beat rule-t py-16">
        <p className="eyebrow">The objection</p>
        <h2 className="t-h2 mt-3">&ldquo;My crews will never use an app.&rdquo;</h2>
        <p className="t-body mt-4" style={{ color: "var(--color-fg-2)", maxWidth: "60ch" }}>
          Correct, and they never have to. There is no app and there are no worker accounts. The
          foreman gets one text on Monday. He opens the link, reads the talk out loud, taps
          <span className="t-mono"> Start sign-off</span>, and hands the phone around the circle.
          Each person taps their name and signs on the yellow line. Four minutes for eight people.
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {[
            [
              "No install, no login",
              "A signed link in a text message. It works on the phone he already has, in whatever browser opened it.",
            ],
            [
              "No signal required",
              "Signatures are captured on the device and queue there. When the truck comes back into coverage they sync themselves — including a photo of the huddle.",
            ],
            [
              "No editing, ever",
              "Once a signature has synced, nothing can change it. Corrections append. The database refuses an update as well as the software.",
            ],
          ].map(([title, body]) => (
            <div key={title}>
              <p className="t-title">{title}</p>
              <p className="t-secondary mt-2">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- What is in the kit ---------------- */}
      <section className="marketing rule-t py-16">
        <p className="eyebrow">The kit</p>
        <h2 className="t-h2 mt-3">Everything the paperwork needs, nothing it does not.</h2>
        <div className="mt-8 grid gap-8 sm:grid-cols-2">
          {[
            [
              `${SEED_TALKS.length} toolbox talks, ready to read`,
              "Fall protection, trenching, silica, heat, lockout, ladders — hazard-tagged, five minutes each, written to be read aloud in daylight glare. Add your own; print any of them.",
            ],
            [
              "Sign-off at the huddle",
              "Signature, optional photo, GPS and time stamp. Both the device clock and the sync clock are kept, and both are shown.",
            ],
            [
              "An incident log that produces the 300A",
              "Plain-language intake, one question per screen, with the 1904 rule text cited beside the answer that decides the case. Correct 300, 301 and signable 300A come out the other end.",
            ],
            [
              "The 8- and 24-hour clock",
              "A fatality or a hospitalisation surfaces the reporting duty immediately, with the deadline counting down and the hotline one tap away. We never file on your behalf.",
            ],
            [
              "Cert expiry that escalates",
              "OSHA 10 and 30, first aid, fit tests, licenses — with a photo of the card and reminders at 60, 30 and 7 days, then once when it lapses. Once, not every morning.",
            ],
            [
              "The inspection binder",
              "One button, one dated PDF: attendance with signatures, the 300 log, the 300A, the cert matrix, the incident list. Every export is logged.",
            ],
          ].map(([title, body]) => (
            <div key={title}>
              <p className="t-title">{title}</p>
              <p className="t-secondary mt-2">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Pricing ---------------- */}
      <section id="pricing" className="marketing beat rule-t py-16">
        <p className="eyebrow">Pricing</p>
        <h2 className="t-h2 mt-3">Priced by field headcount. Every plan has every feature.</h2>
        <p className="t-secondary mt-3" style={{ maxWidth: "60ch" }}>
          Nothing about compliance is held back for a higher tier — putting the 300A behind a
          paywall would be malpractice. Annual is two months free.
        </p>
        <div className="mt-8 grid gap-5 sm:grid-cols-3">
          {PLAN_ORDER.map((id) => {
            const plan = PLANS[id];
            return (
              <div
                key={id}
                className="panel p-5"
                style={{ borderLeft: id === "company" ? "2px solid var(--color-hardhat)" : undefined }}
              >
                <p className="t-title">{plan.name}</p>
                <p className="t-stat mt-2">{formatUsd(plan.priceCents)}</p>
                <p className="t-secondary">per month · up to {plan.headcount} field employees</p>
                <p className="t-secondary mt-3">{plan.tagline}</p>
                <ul className="mt-4">
                  {plan.includes.map((item) => (
                    <li key={item} className="t-secondary flex items-start gap-2 py-1">
                      <IconCheck
                        size={16}
                        style={{ color: "var(--color-green)", flex: "none", marginTop: 3 }}
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link href="/signup" className="btn btn-primary">
            {CTA}
          </Link>
          <p className="t-secondary">
            Cancel and your records stay: read-only, exportable, for the full five-year retention
            duty.
          </p>
        </div>
      </section>

      {/* ---------------- Final CTA + the honest disclaimer ---------------- */}
      <section className="marketing rule-t py-16">
        <h2 className="t-hero" style={{ maxWidth: "26ch" }}>
          Have the paperwork before anyone asks for it.
        </h2>
        <div className="mt-7">
          <Link href="/signup" className="btn btn-primary">
            {CTA}
          </Link>
        </div>
        <p className="t-secondary mt-8 flex items-start gap-2" style={{ maxWidth: "62ch" }}>
          <IconAlertTriangle size={18} style={{ color: "var(--color-fg-3)", flex: "none", marginTop: 2 }} />
          SafetyDeck is recordkeeping software, not legal advice. Recordability decisions come from
          versioned 29 CFR 1904 logic that is cited on screen and stamped on every form, and the
          employer remains responsible for the accuracy of its records. Federal OSHA forms in v1 —
          check your state plan where it differs.
        </p>
      </section>

      <footer className="marketing rule-t flex flex-wrap items-center justify-between gap-4 py-8 pb-28 md:pb-8">
        <span className="t-secondary">SafetyDeck · toolbox talks, incident logs, cert tracking</span>
        <span className="flex gap-5">
          <Link href="/login" className="t-secondary" style={{ color: "var(--color-fg-2)" }}>
            Sign in
          </Link>
          <Link href="/signup" className="t-secondary" style={{ color: "var(--color-fg-2)" }}>
            Start a trial
          </Link>
        </span>
      </footer>

      <div className="sticky-cta">
        <Link href="/signup" className="btn btn-primary btn-full">
          {CTA}
        </Link>
      </div>
    </>
  );
}
