/**
 * The landing page, to MARKETING_PLAYBOOK.md.
 *
 * Message architecture, written before the markup:
 *
 *   Enemy       — the whiteboard that promised the same 40 chairs to two
 *                 Saturdays. Not a competitor: the Saturday morning where the
 *                 second truck is loading and there is nothing to load.
 *   One sentence— an overbooking is structurally impossible when the quote and
 *                 the calendar are the same number.
 *   Arc         — hook (the device running) → tension (what the whiteboard costs)
 *                 → proof (a real availability calculation, a labelled photo pair)
 *                 → offer (three plans, anchored against one lost Saturday).
 *   Device      — "Double-booked never again."
 *   CTA         — "Start free — 14 days", verbatim, at hero, post-proof,
 *                 post-pricing, and in the sticky mobile bar.
 *
 * Nothing on this page is a fabricated receipt. There are no testimonials, no
 * logos, no usage numbers: RigRent is pre-launch and MARKETING_PLAYBOOK law 5
 * says a trust debt like that never gets paid off. The one artefact shown is
 * staged from the app's own seed data and labelled as such.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { GaugeDevice, PhotoPairReceipt } from "@/components/marketing/GaugeDevice";
import { IconAlert, IconCamera, IconDocument, IconHold, IconTruck, IconYard } from "@/components/icons";
import { PAID_PLANS, PLANS, TRIAL_DAYS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "RigRent — double-booked never again",
  description:
    "Inventory and bookings for party & equipment rental businesses. Availability that can't double-book, deposit holds that release themselves on a clean return, and condition photos on both ends of every rental.",
};

const CTA = "Start free — 14 days";

export default function LandingPage() {
  return (
    <>
      <main style={{ paddingBottom: 80 }}>
        {/* ---------------------------------------------------------- hero --- */}
        <section style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px 0" }}>
          <p className="t-placard tone-dim">RigRent</p>
          <h1 className="t-display" style={{ marginTop: 12, maxWidth: "20ch" }}>
            Double-booked never again.
          </h1>
          <p className="t-body" style={{ marginTop: 16, maxWidth: "56ch" }}>
            One quantity-tracked calendar that every quote reads from. When 32 of your 40 chairs are
            already promised to Saturday, the next quote says so — and names the order that has them —
            before anybody hits send.
          </p>

          <div style={{ marginTop: 24 }}>
            <GaugeDevice />
          </div>

          <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/signup" className="btn btn-primary">
              {CTA}
            </Link>
            <Link href="/login" className="btn btn-secondary">
              Sign in
            </Link>
          </div>
          <p className="t-secondary" style={{ marginTop: 12 }}>
            No card. {TRIAL_DAYS} days of everything, including deposit holds and photo pairs.
          </p>
        </section>

        <div className="hero-rule" style={{ marginTop: 56 }} />

        {/* --------------------------------------------------- the enemy --- */}
        <section style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>
          <p className="t-label">The enemy</p>
          <h2 className="t-h2" style={{ marginTop: 8 }}>
            The whiteboard that promised the same 40 chairs to two Saturdays.
          </h2>
          <p className="t-body" style={{ marginTop: 16 }}>
            You find out at 6am, when the second truck is loading and the rack is empty. Then it is
            phone calls, a rental from a competitor at retail, and a customer who tells people.
          </p>
          <p className="t-body" style={{ marginTop: 12 }}>
            The whiteboard is not the problem because people are careless. It is the problem because
            the quote and the calendar are two different objects, and a human being is the only thing
            keeping them equal. RigRent makes them one object. There is nowhere for a double-booking
            to live.
          </p>
        </section>

        <div className="hero-rule" />

        {/* ---------------------------------------------------- the math --- */}
        <section style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>
          <p className="t-label">The arithmetic</p>
          <h2 className="t-h2" style={{ marginTop: 8 }}>
            One lost Saturday costs more than a year of this.
          </h2>
          <div className="panel" style={{ marginTop: 20, padding: 20 }}>
            <MathRow label="A wedding order you had to hand back" value="$1,850" />
            <MathRow label="Chairs and tables re-rented at retail to cover it" value="$640" />
            <MathRow label="Deposit you could not defend without photos" value="$300" />
            <div className="hairline-t" style={{ margin: "12px 0" }} />
            <MathRow label="One Saturday" value="$2,790" strong />
            <div style={{ marginTop: 16 }}>
              <MathRow label="RigRent Fleet, twelve months" value="$1,548" />
            </div>
          </div>
          <p className="t-secondary" style={{ marginTop: 12 }}>
            Those are the numbers from one order the size of a mid-sized wedding — plug in your own.
            The point is not the total; it is that the arithmetic only has to work once.
          </p>
        </section>

        <div className="hero-rule" />

        {/* ----------------------------------------------------- receipts --- */}
        <section style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>
          <p className="t-label">Receipts</p>
          <h2 className="t-h2" style={{ marginTop: 8 }}>
            A real availability calculation, and a damage claim with its photo pair.
          </h2>
          <p className="t-body" style={{ marginTop: 16 }}>
            Availability is one SQL query with a half-open date overlap:{" "}
            <span className="t-mono">owned − booked − maintenance</span>, computed live on every quote
            line and re-checked inside the transaction that accepts the order. A quote that sat in an
            inbox for a week cannot commit gear that sold in the meantime — the acceptance is refused
            and the conflicting order number comes back with it.
          </p>
          <p className="t-body" style={{ marginTop: 12 }}>
            Gear back on Sunday is available again on Sunday. Same-day turnarounds are the case the
            test suite is built around, because a yard that can turn a load around in a morning will
            not use software that says it cannot.
          </p>
          <div style={{ marginTop: 24 }}>
            <PhotoPairReceipt />
          </div>
        </section>

        <div className="hero-rule" />

        {/* ----------------------------------------- the operational half --- */}
        <section style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>
          <p className="t-label">The back half of the rental</p>
          <h2 className="t-h2" style={{ marginTop: 8 }}>
            Quoting is the easy part. Saturday is not.
          </h2>
          <div className="stack" style={{ marginTop: 20, gap: 24 }}>
            <Feature Icon={IconHold} title="Deposits that are holds, not charges">
              A manual-capture authorisation on your own Stripe account — your customer&rsquo;s money
              never touches ours. A clean check-in cancels it the same day and nothing ever moved. A
              documented claim captures exactly the claim and releases the rest.
            </Feature>
            <Feature Icon={IconCamera} title="Condition photos on both ends">
              Out-photos at load, in-photos at return, per item line. The damage claim is the
              difference between two photo sets, not a memory contest six weeks later.
            </Feature>
            <Feature Icon={IconTruck} title="Load lists, not order lists">
              Three orders each wanting 40 chairs is one line reading 120. Stops in the order you
              actually drive them, and driver check-off from the van.
            </Feature>
            <Feature Icon={IconYard} title="Maintenance holds count">
              A tent in for a sidewall repair is as unavailable as one on a truck, and the gauge knows
              it.
            </Feature>
            <Feature Icon={IconDocument} title="A contract with a hash">
              The customer signs and initials the damage clause; the PDF they read is hashed at the
              moment of signing and the sha256 is on the order for ever.
            </Feature>
          </div>

          <div style={{ marginTop: 32 }}>
            <Link href="/signup" className="btn btn-primary btn-full">
              {CTA}
            </Link>
          </div>
        </section>

        <div className="hero-rule" />

        {/* --------------------------------------------- objection killer --- */}
        <section style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>
          <p className="t-label">The objection</p>
          <h2 className="t-h2" style={{ marginTop: 8 }}>
            &ldquo;We already tried rental software. It took a month and we went back to the
            whiteboard.&rdquo;
          </h2>
          <p className="t-body" style={{ marginTop: 16 }}>
            That is usually true, and it is usually because the software was shaped for a hundred-truck
            yard with an onboarding contract. RigRent asks for one thing to get started: the item you
            own the most of, and how many of it you own. Quote against it in five minutes.
          </p>
          <div className="panel" style={{ marginTop: 20, padding: 20 }}>
            <p className="t-title">
              <IconAlert size={18} /> What it deliberately does not do
            </p>
            <ul className="stack" style={{ marginTop: 12, gap: 8, paddingLeft: 0, listStyle: "none" }}>
              <li className="t-secondary">
                No public checkout. Quotes stay human-approved, because a stranger booking your only
                marquee at 2am is not a feature.
              </li>
              <li className="t-secondary">
                No accounting module. Export everything and let your bookkeeper keep their software.
              </li>
              <li className="t-secondary">
                No customer logins. Your customer gets a signed link, signs it, and never remembers a
                password.
              </li>
            </ul>
          </div>
        </section>

        <div className="hero-rule" />

        {/* ------------------------------------------------------ pricing --- */}
        <section style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 20px" }}>
          <p className="t-label">Pricing</p>
          <h2 className="t-h2" style={{ marginTop: 8 }}>
            Less than a Saturday. Every month, for a year.
          </h2>
          <div className="price-grid" style={{ marginTop: 24 }}>
            {PAID_PLANS.map((plan) => {
              const spec = PLANS[plan];
              return (
                <div key={plan} className="panel" style={{ padding: 20 }}>
                  <p className="t-placard tone-dim">{spec.name}</p>
                  <p className="t-count" style={{ marginTop: 8 }}>
                    ${spec.priceMonthly}
                    <span className="t-secondary"> /mo</span>
                  </p>
                  <p className="t-secondary" style={{ marginTop: 8 }}>
                    {spec.blurb}
                  </p>
                  <ul
                    className="stack"
                    style={{ marginTop: 16, gap: 6, paddingLeft: 0, listStyle: "none" }}
                  >
                    <PlanLine on>
                      {Number.isFinite(spec.users) ? `${spec.users} users` : "Unlimited users"}
                    </PlanLine>
                    <PlanLine on>Availability, quotes, contracts, deposit holds</PlanLine>
                    <PlanLine on={spec.runs}>Runs, load lists, driver check-off</PlanLine>
                    <PlanLine on={spec.damageClaims}>Damage claims against the deposit</PlanLine>
                    <PlanLine on={spec.serials}>Per-unit serials</PlanLine>
                    <PlanLine on={spec.maintenanceHolds}>Maintenance holds</PlanLine>
                  </ul>
                  <Link
                    href="/signup"
                    className="btn btn-secondary btn-full"
                    style={{ marginTop: 20 }}
                  >
                    {CTA}
                  </Link>
                </div>
              );
            })}
          </div>
          <p className="t-secondary" style={{ marginTop: 16 }}>
            {TRIAL_DAYS}-day free trial, no card. Deposits ride your own Stripe account, so your
            customers&rsquo; money never touches RigRent and you pay Stripe&rsquo;s normal rate on it —
            not ours.
          </p>
        </section>

        <div className="hero-rule" />

        {/* ---------------------------------------------------------- faq --- */}
        <section style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>
          <p className="t-label">Honest answers</p>
          <div className="stack" style={{ marginTop: 16 }}>
            <Faq q="Is the deposit a charge?">
              No. It is an authorisation hold on the customer&rsquo;s card, on your Stripe account.
              Their statement shows a pending line that disappears. Money only moves when you capture
              against a claim you have photographed and priced from a fee schedule they signed.
            </Faq>
            <Faq q="Card authorisations expire. What about a three-week tent rental?">
              A nightly pass re-authorises any hold that would lapse before the gear is due back, with
              two days of runway so a declined card is something you chase rather than discover. A hold
              that has already lapsed is flagged on the order for a person, not retried for ever.
            </Faq>
            <Faq q="Can I turn a load around the same day?">
              Yes. The booking window is half-open: gear due back on the 9th is available again on the
              9th. That is the case the availability tests are built around.
            </Faq>
            <Faq q="What happens if my trial ends and I don't pay?">
              RigRent goes read-only and says so. Nothing is deleted — your inventory, orders, photos
              and claims stay exactly where they are, and exports keep working on any plan in any
              billing state.
            </Faq>
            <Faq q="Do you have customer stories?">
              Not yet, and we are not going to invent any. RigRent is pre-launch. The artefacts on this
              page are staged from our own seeded demo yard and labelled as such — when there are real
              ones, with real consent, they will replace them.
            </Faq>
          </div>
        </section>

        {/* --------------------------------------------------- final CTA --- */}
        <section style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>
          <h2 className="t-h2">Kill the whiteboard before the next Saturday.</h2>
          <p className="t-body" style={{ marginTop: 12 }}>
            Add the item you own the most of, quote against it, and watch a line block with a name
            attached.
          </p>
          <Link href="/signup" className="btn btn-primary btn-full" style={{ marginTop: 24 }}>
            {CTA}
          </Link>
        </section>

        <footer
          className="hero-rule"
          style={{ maxWidth: 720, margin: "0 auto", padding: "24px 20px 0" }}
        >
          <p className="t-secondary">
            RigRent — inventory and bookings for party &amp; equipment rental businesses. Deposits run
            on your own Stripe account.
          </p>
        </footer>
      </main>

      {/* Sticky thumb-zone CTA on a phone. Same words, every placement. */}
      <div className="cta-bar no-print">
        <Link href="/signup" className="btn btn-primary btn-full">
          {CTA}
        </Link>
      </div>
    </>
  );
}

function MathRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="between" style={{ minHeight: 28 }}>
      <span className={strong ? "t-title" : "t-secondary"}>{label}</span>
      <span className={strong ? "t-mono-lg" : "t-mono"}>{value}</span>
    </div>
  );
}

function Feature({
  Icon,
  title,
  children,
}: {
  Icon: (props: { size?: number }) => React.ReactElement;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="t-title">
        <Icon size={20} /> {title}
      </p>
      <p className="t-body" style={{ marginTop: 8 }}>
        {children}
      </p>
    </div>
  );
}

function PlanLine({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <li
      className="t-secondary"
      style={{ color: on ? "var(--color-ink)" : "var(--color-dim)" }}
    >
      {on ? "· " : "— not on this tier: "}
      {children}
    </li>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="hairline-b" style={{ padding: "12px 0" }}>
      <summary className="t-title" style={{ cursor: "pointer" }}>
        {q}
      </summary>
      <p className="t-body" style={{ marginTop: 12 }}>
        {children}
      </p>
    </details>
  );
}
