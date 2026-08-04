import type { Metadata } from "next";
import Link from "next/link";
import { Calculator } from "@/components/marketing/Calculator";
import { SlotDevice } from "@/components/marketing/SlotDevice";
import { Icon } from "@/components/icons";
import { PLAN_SPECS, TRIAL_DAYS, type BillablePlan } from "@/lib/plans";
import { money } from "@/lib/format";

/**
 * The landing page, per MARKETING_PLAYBOOK.md.
 *
 *   Enemy        — the 2:00 that did not show: an unpaid hour with the chair rent still running.
 *   One sentence — "The no-show that paid for itself."
 *   Device       — the flipped slot writing its own ledger line, reused in the hero, the maths
 *                  and the pricing, using the product's own four beats.
 *   Arc          — hook, tension, proof, offer. Nothing here that does not prove the sentence.
 *   CTA          — "Claim your booking page", verbatim at the hero, after the proof, after the
 *                  pricing, and in the sticky mobile bar.
 *
 * Every number on this page is either the visitor's own (the calculator) or a published figure
 * with its source linked. There are no testimonials, no logos and no usage claims, because
 * ChairFlow has no customers yet — and the demo ledger says so where it stands.
 */
export const metadata: Metadata = {
  title: "ChairFlow — the no-show that paid for itself",
  description:
    "Booking and no-show protection for chair-renting stylists and barbers. A booking page with card-on-file deposits that convert to no-show fees under your own policy, rebooking nudges on each client's real rhythm, and a chair-rent ledger both sides can read.",
  openGraph: {
    title: "The no-show that paid for itself.",
    description:
      "2:00 flips to NO-SHOW. The fee writes itself into the ledger: no-show fee · per policy agreed Jun 12 · +$22.50. The chair got paid anyway.",
    type: "website",
  },
};

const CTA = "Claim your booking page";
const ORDER: BillablePlan[] = ["chair", "book", "shop"];

export default function LandingPage() {
  return (
    <>
      <main className="marketing">
        {/* ---- Hook: the machine, running, above the fold ---- */}
        <section>
          <header
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              paddingTop: 24,
              paddingBottom: 32,
            }}
          >
            <Icon name="chair-seat" size={22} />
            <span className="t-title">ChairFlow</span>
            <Link href="/login" className="btn-quiet" style={{ marginLeft: "auto", minHeight: 44 }}>
              Sign in
            </Link>
          </header>

          <p className="eyebrow">For chair renters and booth barbers</p>
          <h1 className="t-display" style={{ margin: "0 0 16px" }}>
            The no-show that paid for itself.
          </h1>
          <p className="lede" style={{ margin: "0 0 24px" }}>
            Your booking page holds a card. Your policy — your words, your numbers — is what
            charges it when somebody does not turn up. You never have to ask.
          </p>

          <SlotDevice />

          <div style={{ display: "grid", gap: 8, paddingTop: 24 }}>
            <Link className="btn btn-primary" href="/signup">
              {CTA}
            </Link>
            <p className="t-secondary" style={{ margin: 0 }}>
              Free for {TRIAL_DAYS} days, no card. Your handle is reserved in 60 seconds.
            </p>
          </div>
        </section>

        {/* ---- Tension: name the enemy ---- */}
        <section>
          <p className="eyebrow">The enemy</p>
          <h2 className="t-h2" style={{ margin: "0 0 16px" }}>
            The 2:00 that didn&apos;t show, and the rent that ran anyway.
          </h2>
          <p className="lede" style={{ margin: "0 0 16px" }}>
            You are a one-person business with a landlord and no receptionist. A missed appointment
            is not a statistic — it is an unpaid hour with the chair rent still running, and nobody
            notices except you.
          </p>
          <p className="lede" style={{ margin: 0 }}>
            Hair stylists average around 13% no-shows and barbers around 10%; pen-and-paper shops
            reach 20%. At $40–80 of service revenue a miss, a 40-appointment week quietly donates
            hundreds of dollars a month to people who did not arrive.
          </p>
          <p className="t-secondary" style={{ margin: "16px 0 0" }}>
            Rates:{" "}
            <a
              href="https://heygoldie.com/tools/no-show-cost-calculator"
              style={{ color: "var(--color-cobalt)", fontWeight: 700 }}
              rel="noreferrer"
            >
              Goldie
            </a>
            {" and "}
            <a
              href="https://waitq.app/blog/barbershop-statistics"
              style={{ color: "var(--color-cobalt)", fontWeight: 700 }}
              rel="noreferrer"
            >
              WaitQ
            </a>
            . Cost per miss:{" "}
            <a
              href="https://getsquire.com/business-edge/real-cost-of-no-shows"
              style={{ color: "var(--color-cobalt)", fontWeight: 700 }}
              rel="noreferrer"
            >
              Squire
            </a>
            .
          </p>
        </section>

        {/* ---- The math, in front of them ---- */}
        <section>
          <p className="eyebrow">Your arithmetic</p>
          <h2 className="t-h2" style={{ margin: "0 0 16px" }}>
            What is walking out of your door
          </h2>
          <Calculator />
        </section>

        {/* ---- Proof: the artifacts, honestly labelled ---- */}
        <section>
          <p className="eyebrow">Receipts</p>
          <h2 className="t-h2" style={{ margin: "0 0 16px" }}>
            The policy, the agreement, and the line it writes
          </h2>
          <p className="lede" style={{ margin: "0 0 24px" }}>
            Competitors have a deposit <em>setting</em>. ChairFlow has a policy <em>engine</em>:
            your rules rendered as a page your clients agree to at booking, versioned when you
            change them, and quoted on every charge.
          </p>

          <div className="policy-panel" style={{ marginBottom: 16 }}>
            <p className="t-label" style={{ margin: 0 }}>
              The policy
            </p>
            <p className="t-secondary" style={{ margin: "4px 0 12px" }}>
              Cancel free until 24h before. Late cancel 25%. No-show 50%.
            </p>
            <p className="t-policy" style={{ margin: 0 }}>
              {"Cancel or reschedule free up to 24 hours before your appointment.\n\nInside 24 hours, a late-cancellation fee of 25% of the service price applies.\n\nIf you do not show up, a no-show fee of 50% of the service price applies.\n\nYour card is kept on file securely with Stripe and is only charged under this policy. Any deposit you paid is applied to the fee first."}
            </p>
            <p
              className="t-mono"
              style={{
                margin: "12px 0 0",
                paddingTop: 12,
                borderTop: "1px solid var(--color-hairline)",
                color: "var(--color-ink-2)",
              }}
            >
              Agreed 2026-06-12 14:03 UTC · policy v1
            </p>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <p className="t-label" style={{ margin: "0 0 8px" }}>
              A month of protection
            </p>
            <div className="ledger-line">
              <span>
                no-show fee ·{" "}
                <span style={{ color: "var(--color-ink-2)" }}>per policy agreed Jun 12</span>
              </span>
              <span className="ledger-amount">+$12.50</span>
            </div>
            <div className="ledger-line">
              <span>
                deposit kept ·{" "}
                <span style={{ color: "var(--color-ink-2)" }}>per policy agreed Jun 12</span>
              </span>
              <span className="ledger-amount">+$10.00</span>
            </div>
            <div className="ledger-line">
              <span>
                late-cancel fee ·{" "}
                <span style={{ color: "var(--color-ink-2)" }}>per policy agreed May 30</span>
              </span>
              <span className="ledger-amount">+$15.50</span>
            </div>
            <div className="ledger-line">
              <span>
                no-show fee ·{" "}
                <span style={{ color: "var(--color-ink-2)" }}>per policy agreed Jun 02</span>
              </span>
              <span className="ledger-amount ledger-amount-waived">$22.50 waived</span>
            </div>
            <p className="t-secondary" style={{ margin: "16px 0 0" }}>
              This is our own demo chair — the same data the app ships with, not a customer&apos;s
              book. ChairFlow is pre-launch and has no customers to quote yet; when it does, the
              receipts here will be real ones, with their permission.
            </p>
          </div>
        </section>

        {/* ---- Objection killer ---- */}
        <section>
          <p className="eyebrow">The objection</p>
          <h2 className="t-h2" style={{ margin: "0 0 16px" }}>
            &ldquo;Charging a regular feels harsh.&rdquo;
          </h2>
          <p className="lede" style={{ margin: "0 0 16px" }}>
            You don&apos;t charge them. The policy they agreed to when they booked does — and you
            have the timestamp, the version and their own tap on record. That sentence is the
            product: <em>it&apos;s the policy you agreed to when you booked.</em>
          </p>
          <p className="lede" style={{ margin: 0 }}>
            And when you want to let it go, grace is one tap. Charging is deliberate — you hold the
            button down. Waiving is not: it is a single tap, always on the screen, and the waived
            line stays in your ledger so the record of what you forgave survives.
          </p>
          <div className="card" style={{ padding: 16, marginTop: 24, display: "grid", gap: 8 }}>
            <p className="t-label" style={{ margin: 0 }}>
              The fee sheet, before anything is charged
            </p>
            <Row term="Skin fade">$45</Row>
            <Row term="No-show fee at 50%">$22.50</Row>
            <Row term="Deposit already held">-$10.00</Row>
            <Row term="To charge the card" strong>
              $12.50
            </Row>
            <p className="t-secondary" style={{ margin: "8px 0 0" }}>
              Hold to charge per policy · or waive it
            </p>
          </div>
        </section>

        {/* ---- What else it does ---- */}
        <section>
          <p className="eyebrow">Beyond the fee</p>
          <h2 className="t-h2" style={{ margin: "0 0 16px" }}>
            The second leak is quieter
          </h2>
          <div className="stack" style={{ gap: 24 }}>
            <Feature
              icon="pulse-return"
              title="The client who used to come every four weeks is at week seven"
              body="ChairFlow computes each client's own rhythm from their visits — a median, not an average, so one holiday does not hide a drift. Past due plus a grace window, they get one text with a one-tap booking link. Two per cycle, quiet hours honoured, STOP honoured everywhere."
            />
            <Feature
              icon="bell-slot"
              title="A cancellation offers itself to somebody who wanted that hour"
              body="A freed slot goes to the first matching person on your waitlist. First tap wins, the offer expires in an hour, and it books through the same policy agreement as everything else."
            />
            <Feature
              icon="key-rent"
              title="Chair rent, in one ledger both of you read"
              body="Your shop owner sets the weekly rent; the paid and unpaid weeks are a grid neither side can quietly rewrite. ChairFlow takes no cut of rent."
            />
            <Feature
              icon="link-bio"
              title="Your clients stay yours"
              body="No marketplace, no discovery feed, nobody selling your regulars a cheaper barber. Your handle, your book, your card-on-file relationships, exportable any day."
            />
          </div>
        </section>

        {/* ---- Post-proof CTA, same words ---- */}
        <section>
          <Link className="btn btn-primary btn-full" href="/signup">
            {CTA}
          </Link>
          <p className="t-secondary" style={{ margin: "8px 0 0" }}>
            Free for {TRIAL_DAYS} days, no card. Your handle is reserved in 60 seconds.
          </p>
        </section>

        {/* ---- Pricing, anchored ---- */}
        <section>
          <p className="eyebrow">Pricing</p>
          <h2 className="t-h2" style={{ margin: "0 0 16px" }}>
            Priced for one chair, not for a suite
          </h2>
          <p className="lede" style={{ margin: "0 0 24px" }}>
            GlossGenius starts at $24/mo, Booksy is $29.99 plus $20 a team member, Squire runs
            $30–150. Those are suites: POS, payroll, marketing. You are renting a chair.
          </p>

          <div className="stack" style={{ gap: 12 }}>
            {ORDER.map((plan) => {
              const spec = PLAN_SPECS[plan];
              return (
                <div key={plan} className="card" style={{ padding: 16, display: "grid", gap: 8 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 12,
                    }}
                  >
                    <span className="t-title">{spec.name}</span>
                    <span className="t-mono" style={{ fontSize: "1.0625rem" }}>
                      {money(spec.priceCents)}/mo
                    </span>
                  </div>
                  <p className="t-secondary" style={{ margin: 0 }}>
                    {spec.tagline}
                  </p>
                  <ul className="t-secondary" style={{ margin: 0, paddingLeft: 20 }}>
                    {spec.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <div className="ledger-line" style={{ marginTop: 24 }}>
            <span>one $45 no-show, charged at 50%, against Chair at $19</span>
            <span className="ledger-amount">+$3.50</span>
          </div>
          <p className="t-secondary" style={{ margin: "8px 0 0" }}>
            That is the whole pitch: the first protected appointment of the month has already paid
            for the month. Annual billing is two months free.
          </p>
        </section>

        {/* ---- The honest FAQ ---- */}
        <section>
          <p className="eyebrow">Straight answers</p>
          <h2 className="t-h2" style={{ margin: "0 0 16px" }}>
            Who holds the money, and what does it cost
          </h2>
          <div className="stack">
            <Faq
              q="Whose Stripe account do deposits and fees go through?"
              a="Yours. ChairFlow sets you up with a Stripe Connect Express account in your own name; deposits and fees are charged on it and paid out to you. Client money never touches our balance sheet, and we take no cut of it."
            />
            <Faq
              q="So what does it actually cost me?"
              a="Your ChairFlow subscription, plus Stripe's standard processing on anything you collect. Nothing else in v1. If we ever add a fee on card volume it will be announced, disclosed on this page, and it will not be retroactive."
            />
            <Faq
              q="Can I take bookings before Stripe is set up?"
              a="Yes. Your page works from the moment you claim your handle. Until Stripe is connected it takes bookings without holding a card — clients still agree to your policy, but there is nothing to charge if they do not show. Finishing Stripe is what switches the protection on."
            />
            <Faq
              q="What happens to my clients if I stop paying?"
              a="Your booking page stops taking bookings and nothing is sent or charged. Your client list, their history and your ledger stay readable and exportable. We do not hold your book hostage."
            />
            <Faq
              q="Will you text my clients things I did not write?"
              a="No. Confirmations, reminders, rebooking nudges and waitlist offers — that is the whole list, all of them capped, all of them inside your quiet hours, and STOP is honoured immediately and everywhere."
            />
            <Faq
              q="Do you sell me new clients?"
              a="No, and we are not going to pretend otherwise. ChairFlow protects the book you have. If what you want is discovery and lead-gen, a marketplace app is the honest answer — it will also sit between you and your clients, which is why we do not do it."
            />
          </div>
        </section>

        {/* ---- Final CTA, same words again ---- */}
        <section>
          <h2 className="t-h2" style={{ margin: "0 0 16px" }}>
            Let the policy do the asking.
          </h2>
          <Link className="btn btn-primary btn-full" href="/signup">
            {CTA}
          </Link>
          <p className="t-secondary" style={{ margin: "8px 0 24px" }}>
            Free for {TRIAL_DAYS} days, no card. Your handle is reserved in 60 seconds.
          </p>
          <p className="t-secondary" style={{ margin: 0 }}>
            ChairFlow · booking and no-show protection for chair renters ·{" "}
            <Link href="/login" style={{ color: "var(--color-cobalt)", fontWeight: 700 }}>
              Sign in
            </Link>
          </p>
        </section>
      </main>

      <div className="sticky-cta">
        <Link className="btn btn-primary" href="/signup">
          {CTA}
        </Link>
      </div>
    </>
  );
}

function Row({
  term,
  children,
  strong,
}: {
  term: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        padding: "8px 0",
        borderBottom: "1px solid var(--color-hairline)",
      }}
    >
      <span className="t-secondary" style={strong ? { color: "var(--color-ink)" } : undefined}>
        {term}
      </span>
      <span className="t-mono" style={{ fontWeight: strong ? 700 : 500 }}>
        {children}
      </span>
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: "pulse-return" | "bell-slot" | "key-rent" | "link-bio";
  title: string;
  body: string;
}) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <span style={{ color: "var(--color-cobalt)", flex: "none", paddingTop: 2 }}>
        <Icon name={icon} size={22} />
      </span>
      <div>
        <p className="t-title" style={{ margin: 0 }}>
          {title}
        </p>
        <p className="t-secondary" style={{ margin: "4px 0 0", maxWidth: "60ch" }}>
          {body}
        </p>
      </div>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div style={{ padding: "16px 0", borderBottom: "1px solid var(--color-hairline)" }}>
      <p className="t-title" style={{ margin: 0 }}>
        {q}
      </p>
      <p className="t-secondary" style={{ margin: "4px 0 0", maxWidth: "62ch" }}>
        {a}
      </p>
    </div>
  );
}
