import type { Metadata } from "next";
import Link from "next/link";
import { DriveawayDemo } from "@/components/marketing/DriveawayDemo";
import { LagMath } from "@/components/marketing/LagMath";
import { IconCheck, IconClock, IconFlag, IconSend } from "@/components/icons";
import { PLANS, PLAN_ORDER, TRIAL_DAYS, TRIAL_QUOTE_LIMIT, formatPlanPrice } from "@/lib/plans";

export const metadata: Metadata = {
  title: "QuoteFox — send the bid from the driveway",
  description:
    "Walk the job narrating on your phone. QuoteFox drafts the line items from your own price book, flags what it cannot price, and sends a branded proposal the homeowner can accept and pay a deposit on before you pull away.",
};

/** The one CTA phrase, repeated verbatim at every decision point. */
const CTA = "Start quoting free";

export default function LandingPage() {
  return (
    <main>
      {/* ---- hero: the claim, and the machine running ---------------------- */}
      <header className="gutter" style={{ paddingTop: 24, maxWidth: 1120, margin: "0 auto" }}>
        <nav
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
        >
          <span className="t-label" style={{ color: "var(--color-hi-vis)" }}>
            QuoteFox
          </span>
          <Link href="/login" className="t-secondary" style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}>
            Sign in
          </Link>
        </nav>

        <h1 className="t-display" style={{ marginTop: 32 }}>
          Send the bid from the driveway.
        </h1>
        <p className="t-body" style={{ marginTop: 16, maxWidth: "38ch", color: "var(--color-text-2)" }}>
          Walk the job narrating like you already do. QuoteFox turns the walkthrough into line items
          priced from <strong style={{ color: "var(--color-text)" }}>your</strong> price book, flags
          anything it can't price instead of guessing, and sends a branded proposal the homeowner can
          accept and pay a deposit on — before you pull away.
        </p>
        <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/signup" className="btn btn-primary">
            {CTA}
          </Link>
          <Link href="#how" className="btn btn-secondary">
            See how it drafts
          </Link>
        </div>
        <p className="t-secondary" style={{ marginTop: 12, color: "var(--color-text-3)" }}>
          {TRIAL_DAYS} days, no card, {TRIAL_QUOTE_LIMIT} AI-drafted quotes — enough to win one real
          job.
        </p>

        <div style={{ marginTop: 32 }}>
          <DriveawayDemo />
        </div>
      </header>

      {/* ---- the enemy ----------------------------------------------------- */}
      <section className="gutter" style={{ paddingTop: 64, maxWidth: 1120, margin: "0 auto" }}>
        <p className="t-label">The enemy</p>
        <h2 className="t-h2" style={{ marginTop: 12, maxWidth: "26ch" }}>
          The estimate written twice — once in your head, once at 10pm.
        </h2>
        <p className="t-body" style={{ marginTop: 16, maxWidth: "44ch", color: "var(--color-text-2)" }}>
          You priced the job in the driveway. Then you priced it again at the kitchen table from memory
          and blurry photos, in a Word template you last touched in 2019. Two to five days go by, and
          the homeowner has three other bids.
        </p>

        <div
          style={{
            display: "grid",
            gap: 20,
            marginTop: 32,
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          }}
        >
          <div>
            <p className="t-label">The old way</p>
            <p className="t-data" style={{ fontSize: 28, marginTop: 8, color: "var(--color-text-3)" }}>
              2–5 days
            </p>
            <p className="t-secondary" style={{ marginTop: 8 }}>
              Walk the job at 2pm. Write it at 10pm. Send it Thursday, maybe.
            </p>
          </div>
          <div>
            <p className="t-label">With QuoteFox</p>
            <p className="t-data" style={{ fontSize: 28, marginTop: 8, color: "var(--color-hi-vis)" }}>
              Same hour
            </p>
            <p className="t-secondary" style={{ marginTop: 8 }}>
              Walk the job at 2pm. Review the draft in the truck. Sent at 2:19pm, from the driveway.
            </p>
          </div>
        </div>
        <p className="t-secondary" style={{ marginTop: 24, color: "var(--color-text-3)", maxWidth: "46ch" }}>
          Lead-response research consistently finds the first vendor to respond wins the majority of
          jobs — the widely-cited Lead Connect figure is 78%. We did not run that study, and we are not
          going to pretend we did; the point is that speed is the whole game, and speed is the one
          thing a 10pm kitchen table cannot give you.
        </p>
      </section>

      {/* ---- how it works -------------------------------------------------- */}
      <section id="how" className="gutter" style={{ paddingTop: 64, maxWidth: 1120, margin: "0 auto" }}>
        <p className="t-label">The device</p>
        <h2 className="t-h2" style={{ marginTop: 12, maxWidth: "24ch" }}>
          Narration and photos in. Priced line items out.
        </h2>
        <div style={{ marginTop: 24 }}>
          {[
            {
              Icon: IconClock,
              title: "Walk it and talk it",
              body: "Record with pause and resume, snap the photos you were taking anyway. Uploads chunk and retry, so a basement with one bar does not cost you the walkthrough.",
            },
            {
              Icon: IconFlag,
              title: "Only your prices, never a guess",
              body: "Every line references an item in your own price book with your own markup. Anything the walkthrough mentioned that isn't in there comes back flagged “needs pricing” with the sentence you said — and a flagged line blocks sending until you price it.",
            },
            {
              Icon: IconSend,
              title: "Accepted and paid before you leave",
              body: "A branded proposal link, typed-name signature, timestamped acceptance record, archived PDF, and a deposit taken on your own Stripe account. We take none of it.",
            },
          ].map(({ Icon, title, body }) => (
            <div key={title} className="row" style={{ alignItems: "flex-start" }}>
              <Icon size={20} style={{ color: "var(--color-hi-vis)", flex: "none", marginTop: 2 }} />
              <span>
                <span className="t-title" style={{ display: "block" }}>
                  {title}
                </span>
                <span className="t-secondary" style={{ display: "block", marginTop: 4 }}>
                  {body}
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ---- the objection -------------------------------------------------- */}
      <section className="gutter" style={{ paddingTop: 64, maxWidth: 1120, margin: "0 auto" }}>
        <p className="t-label">The objection</p>
        <h2 className="t-h2" style={{ marginTop: 12, maxWidth: "28ch" }}>
          “I'm not signing my name to a number a robot made up.”
        </h2>
        <p className="t-body" style={{ marginTop: 16, maxWidth: "44ch", color: "var(--color-text-2)" }}>
          Neither would we. So QuoteFox cannot invent a price: the drafting model is handed your price
          book and is only allowed to reference items that are in it. If it returns an id that is not
          yours, that row is converted to a flag, not a lookup. Every line shows the transcript moment
          it came from, so auditing a draft is one tap per row.
        </p>
        <div className="panel" style={{ padding: 16, marginTop: 24, maxWidth: 520 }}>
          <p className="t-secondary" style={{ display: "flex", gap: 8 }}>
            <IconFlag size={18} style={{ color: "var(--color-amber)", flex: "none" }} />
            <span>
              <strong style={{ color: "var(--color-text)" }}>Crane to set the rooftop unit</strong> —
              needs pricing · from 00:48 in the walkthrough
            </span>
          </p>
          <p className="t-secondary" style={{ marginTop: 10, color: "var(--color-text-3)" }}>
            That is the whole trick: the draft says what it does not know, out loud, and refuses to send
            until you have answered it.
          </p>
        </div>
      </section>

      {/* ---- the math ------------------------------------------------------- */}
      <section className="gutter" style={{ paddingTop: 64, maxWidth: 1120, margin: "0 auto" }}>
        <p className="t-label">The math</p>
        <h2 className="t-h2" style={{ marginTop: 12, maxWidth: "26ch" }}>
          What the lag costs you, in your numbers.
        </h2>
        <div style={{ marginTop: 24, maxWidth: 520 }}>
          <LagMath />
        </div>
      </section>

      {/* ---- receipts ------------------------------------------------------- */}
      <section className="gutter" style={{ paddingTop: 64, maxWidth: 1120, margin: "0 auto" }}>
        <p className="t-label">Receipts</p>
        <h2 className="t-h2" style={{ marginTop: 12, maxWidth: "26ch" }}>
          We are pre-launch, and we are not going to fake this part.
        </h2>
        <p className="t-body" style={{ marginTop: 16, maxWidth: "44ch", color: "var(--color-text-2)" }}>
          There are no customer logos on this page and no testimonials, because QuoteFox has not shipped
          to customers yet. What you can see is the real thing running: the hero above is our own sample
          HVAC walkthrough drafted by the same code you would use, and the trial gives you your own
          receipt inside an afternoon.
        </p>
        <p className="t-secondary" style={{ marginTop: 16, color: "var(--color-text-3)", maxWidth: "44ch" }}>
          When design partners have sent real proposals and collected real deposits, their numbers — with
          their names and their permission — will replace this paragraph. Until then, this is what
          honesty looks like on a landing page.
        </p>
      </section>

      {/* ---- pricing -------------------------------------------------------- */}
      <section className="gutter" style={{ paddingTop: 64, maxWidth: 1120, margin: "0 auto" }}>
        <p className="t-label">Pricing</p>
        <h2 className="t-h2" style={{ marginTop: 12, maxWidth: "24ch" }}>
          Flat monthly. No cut of your deposits, ever.
        </h2>
        <p className="t-secondary" style={{ marginTop: 12, maxWidth: "44ch" }}>
          Deposits land on your own Stripe account and you pay Stripe's processing fee — nothing to us.
          The metered unit is AI-drafted quotes; capture and sending are never metered.
        </p>
        <div
          style={{
            display: "grid",
            gap: 20,
            marginTop: 32,
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          }}
        >
          {PLAN_ORDER.map((id) => (
            <div key={id} className="panel" style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <p className="t-title">{PLANS[id].name}</p>
                <p className="t-data" style={{ fontSize: 16 }}>
                  {formatPlanPrice(id)}
                </p>
              </div>
              <p className="t-secondary" style={{ marginTop: 8 }}>
                {PLANS[id].blurb}
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: 6 }}>
                {PLANS[id].bullets.map((bullet) => (
                  <li key={bullet} className="t-secondary" style={{ display: "flex", gap: 8 }}>
                    <IconCheck size={16} style={{ color: "var(--color-hi-vis)", flex: "none" }} />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="t-secondary" style={{ marginTop: 24, color: "var(--color-text-3)", maxWidth: "46ch" }}>
          For comparison, published incumbent pricing: Housecall Pro from $79/mo with proposals a $40/mo
          add-on and a flat-rate price book $149/mo; Jobber $39–$599/mo with quoting on mid tiers
          (both as listed by those vendors in 2026). QuoteFox does one thing instead of all of them.
        </p>
        <div style={{ marginTop: 24 }}>
          <Link href="/signup" className="btn btn-primary">
            {CTA}
          </Link>
        </div>
      </section>

      {/* ---- final CTA ------------------------------------------------------ */}
      <section
        className="gutter"
        style={{ paddingTop: 64, paddingBottom: 120, maxWidth: 1120, margin: "0 auto" }}
      >
        <h2 className="t-h2" style={{ maxWidth: "22ch" }}>
          Walk the next job. Send the bid before you pull away.
        </h2>
        <p className="t-secondary" style={{ marginTop: 12, maxWidth: "40ch" }}>
          Set up your shop in one evening: pick your trade, take the starter price book or import your
          rate sheet, and the next walkthrough quotes itself.
        </p>
        <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/signup" className="btn btn-primary">
            {CTA}
          </Link>
          <Link href="/login" className="btn btn-secondary">
            Sign in
          </Link>
        </div>
        <p className="t-secondary" style={{ marginTop: 32, color: "var(--color-text-3)" }}>
          QuoteFox · built for HVAC, roofing, electrical and plumbing shops where the owner still writes
          every estimate.
        </p>
      </section>

      {/* The sticky CTA is a conversion feature on mobile, not a nicety. */}
      <div className="thumb-bar thumb-bar-plain">
        <Link href="/signup" className="btn btn-primary btn-full">
          {CTA}
        </Link>
      </div>
    </main>
  );
}
