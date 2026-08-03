import type { Metadata } from "next";
import Link from "next/link";
import { ParseDevice } from "@/components/marketing/ParseDevice";
import { PAID_PLANS, PLANS, priceLabel } from "@/lib/plans";
import { IconShield } from "@/components/icons";

export const metadata: Metadata = {
  title: "CertShield — expired COIs caught before the claim",
  description:
    "Certificate-of-insurance tracking for property managers and GCs. Every COI parsed into structured coverage, checked against the requirement it must meet, and chased automatically before it lapses.",
  openGraph: {
    title: "Expired COIs caught before the claim.",
    description:
      "The COI folder that was current in March is a liability. CertShield parses every certificate, names every deficiency in a sentence, and chases renewals before they lapse.",
    type: "website",
  },
};

/** The one CTA phrase, verbatim at every placement. */
const CTA = "Start free — 14 days";

function Cta({ variant = "primary" }: { variant?: "primary" | "secondary" }) {
  return (
    <Link href="/signup" className={`btn btn-${variant}`}>
      {CTA}
    </Link>
  );
}

export default function LandingPage() {
  return (
    <>
      <header
        className="hairline-b"
        style={{ padding: "16px var(--gutter)", display: "flex", alignItems: "center", gap: 12 }}
      >
        <Link
          href="/"
          className="flex items-center no-underline"
          style={{ gap: 8, color: "var(--color-ink)" }}
        >
          <span style={{ color: "var(--color-seal)" }}>
            <IconShield size={20} />
          </span>
          <span className="t-title" style={{ fontWeight: 600 }}>
            CertShield
          </span>
        </Link>
        <Link href="/login" className="btn-quiet" style={{ marginLeft: "auto" }}>
          Sign in
        </Link>
      </header>

      <main style={{ paddingBottom: 96 }}>
        {/* 1 — Hero: the claim, the machine running, the CTA, the de-risk line. */}
        <section
          style={{ padding: "32px var(--gutter) 0", maxWidth: 1120, margin: "0 auto" }}
          className="lg:flex lg:items-start lg:gap-12"
        >
          <div className="lg:w-1/2">
            <h1 className="t-display">Expired COIs caught before the claim.</h1>
            <p className="t-body" style={{ marginTop: 16, maxWidth: "56ch" }}>
              CertShield reads every certificate of insurance your vendors send, checks it against the
              requirement in your contract, and chases the renewal before it lapses. When something
              does not meet the requirement, it says so in a sentence you can forward to the agent.
            </p>
            <div className="flex" style={{ gap: 12, marginTop: 24, flexWrap: "wrap" }}>
              <Cta />
              <Link href="#device" className="btn btn-secondary">
                Watch a certificate become a verdict
              </Link>
            </div>
            <p className="t-secondary" style={{ marginTop: 12 }}>
              No card. Import your vendors, send upload links, first verdict the same afternoon.
            </p>
          </div>
          <div id="device" className="lg:w-1/2" style={{ marginTop: 32 }}>
            <ParseDevice />
          </div>
        </section>

        {/* 2 — The enemy, named. */}
        <section
          className="hairline-t"
          style={{ marginTop: 56, padding: "40px var(--gutter) 0", maxWidth: 720, marginInline: "auto" }}
        >
          <p className="t-label">The enemy</p>
          <h2 className="t-h2" style={{ marginTop: 8 }}>
            The COI folder that was current in March.
          </h2>
          <p className="t-body" style={{ marginTop: 12 }}>
            You are contractually required to hold valid insurance for every vendor on every property.
            The folder is always stale: certificates expire mid-engagement, limits quietly do not meet
            the requirement, additional-insured endorsements are missing — and nobody finds out until
            there is a claim and the indemnity chain fails.
          </p>
          <p className="t-body" style={{ marginTop: 12 }}>
            Chasing renewals is a spreadsheet, an inbox, and hope. CertShield kills the stale folder.
          </p>
        </section>

        {/* 3 — The math, calculated in front of the buyer. */}
        <section
          className="hairline-t"
          style={{ marginTop: 40, padding: "40px var(--gutter) 0", maxWidth: 720, marginInline: "auto" }}
        >
          <p className="t-label">The arithmetic</p>
          <h2 className="t-h2" style={{ marginTop: 8 }}>
            120 vendors. Four renewal chases each. One afternoon a week, gone.
          </h2>
          <div className="matrix-wrap" style={{ marginTop: 16 }}>
            <table className="matrix">
              <tbody>
                <tr>
                  <td>Vendors in a 600-door portfolio</td>
                  <td className="num">120</td>
                </tr>
                <tr>
                  <td>Renewal touches a year, at 4 per policy cycle</td>
                  <td className="num">480</td>
                </tr>
                <tr>
                  <td>Six minutes each, chasing and filing</td>
                  <td className="num">48 hours</td>
                </tr>
                <tr>
                  <td>At $32/hour, loaded, for a coordinator</td>
                  <td className="num">$1,536/yr</td>
                </tr>
                <tr>
                  <td>CertShield Portfolio</td>
                  <td className="num">$2,388/yr</td>
                </tr>
                <tr>
                  <td>One uninsured slip-and-fall your indemnity did not cover</td>
                  <td className="num">Six figures</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="t-secondary" style={{ marginTop: 12 }}>
            The hours are the small number. The reason anyone buys this is the last row — and the last
            row is not an estimate you should take from a marketing page, it is the number your broker
            will quote you.
          </p>
        </section>

        {/* 4 — Receipts: a real deficiency sentence and a chase timeline. */}
        <section
          className="hairline-t"
          style={{ marginTop: 40, padding: "40px var(--gutter) 0", maxWidth: 720, marginInline: "auto" }}
        >
          <p className="t-label">Receipts</p>
          <h2 className="t-h2" style={{ marginTop: 8 }}>
            Verdicts are sentences, not badges.
          </h2>
          <p className="t-body" style={{ marginTop: 12 }}>
            Every deficiency CertShield finds is written out. This is the actual output of the engine,
            not a mock-up of one:
          </p>
          <div className="panel" style={{ marginTop: 16, padding: 16 }}>
            <p className="t-label">Cordova Landscape &amp; Irrigation · Bayview Terrace</p>
            <p className="placard" data-tone="claim" style={{ marginTop: 8 }}>
              Deficient
            </p>
            <p className="deficiency" style={{ marginTop: 8 }}>
              GL each occurrence $500,000 is below the required $1,000,000.
            </p>
            <p className="deficiency">GL aggregate $1,000,000 is below the required $2,000,000.</p>
            <p className="deficiency">
              GL each occurrence does not grant additional-insured status, which this engagement
              requires.
            </p>
            <p className="t-secondary" style={{ marginTop: 12 }}>
              Demo portfolio, generated by the product itself. No real customer&apos;s file is shown.
            </p>
          </div>
          <p className="t-body" style={{ marginTop: 20 }}>
            And the chase that follows is a ledger, not a promise — each rung recorded once per
            renewal cycle, to the vendor and their agent:
          </p>
          <div style={{ marginTop: 12 }}>
            <div className="timeline-row">
              <span>Jul 21 09:02</span>
              <span className="timeline-verb">Renewal request — 30 days</span>
              <span>tomas@cordovalandscape · policies@cascaderisk</span>
            </div>
            <div className="timeline-row">
              <span>Aug 06 09:01</span>
              <span className="timeline-verb">Renewal request — 14 days</span>
              <span>tomas@cordovalandscape · policies@cascaderisk</span>
            </div>
            <div className="timeline-row">
              <span>Aug 03 09:01</span>
              <span className="timeline-verb">Deficiency letter</span>
              <span>three named reasons, quoted verbatim</span>
            </div>
          </div>
        </section>

        {/* 5 — The objection: can I trust a machine reading my insurance documents? */}
        <section
          className="hairline-t"
          style={{ marginTop: 40, padding: "40px var(--gutter) 0", maxWidth: 720, marginInline: "auto" }}
        >
          <p className="t-label">The obvious objection</p>
          <h2 className="t-h2" style={{ marginTop: 8 }}>
            &ldquo;I am not letting software guess at my insurance.&rdquo;
          </h2>
          <p className="t-body" style={{ marginTop: 12 }}>
            Nor are we. Every field CertShield reads off a form carries a confidence score, and
            anything below the bar goes to a person before it counts. A certificate never enters
            compliance quietly:
          </p>
          <ul className="t-body" style={{ marginTop: 16, paddingLeft: 20, listStyle: "disc" }}>
            <li style={{ marginTop: 8 }}>
              A blank ADDL INSD column is recorded as <em>unknown</em>, never as a no and never as a
              yes.
            </li>
            <li style={{ marginTop: 8 }}>
              A two-digit year drops the field&apos;s confidence, because the century had to be
              assumed.
            </li>
            <li style={{ marginTop: 8 }}>
              A scan with no text layer <strong>fails</strong>, and says so. The PDF still lands, and
              someone types it in.
            </li>
            <li style={{ marginTop: 8 }}>
              The review screen shows the form beside the fields, with the uncertain ones underlined
              and their score printed.
            </li>
            <li style={{ marginTop: 8 }}>
              The compliance check itself is not a model at all. It is a deterministic comparison of
              limits, dates and checkboxes against your template — the same inputs always produce the
              same verdict, and the verdict is a sentence you can check by eye.
            </li>
          </ul>
        </section>

        {/* 6 — Pricing, anchored. */}
        <section
          className="hairline-t"
          style={{ marginTop: 40, padding: "40px var(--gutter) 0", maxWidth: 900, marginInline: "auto" }}
        >
          <p className="t-label">Pricing</p>
          <h2 className="t-h2" style={{ marginTop: 8 }}>
            Per company. Never per certificate.
          </h2>
          <p className="t-body" style={{ marginTop: 12, maxWidth: "62ch" }}>
            The incumbents charge per certificate, which taxes the exact diligence you are paying for.
            Upload as many as your vendors&apos; agents send.
          </p>
          <div
            style={{
              marginTop: 24,
              display: "grid",
              gap: 16,
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            }}
          >
            {PAID_PLANS.map((id) => {
              const plan = PLANS[id];
              return (
                <section key={id} className="panel" style={{ padding: 20 }}>
                  <div className="flex items-baseline justify-between" style={{ gap: 8 }}>
                    <h3 className="t-title" style={{ fontWeight: 600 }}>
                      {plan.name}
                    </h3>
                    <span className="t-mono-lg">{priceLabel(plan)}</span>
                  </div>
                  <p className="t-secondary" style={{ marginTop: 8 }}>
                    {plan.blurb}
                  </p>
                  <p className="t-secondary" style={{ marginTop: 8 }}>
                    {plan.vendors == null
                      ? "Unlimited vendors"
                      : `Works out to $${(plan.priceCents / 100 / plan.vendors).toFixed(2)} per vendor per month at the cap.`}
                  </p>
                </section>
              );
            })}
          </div>
          <div style={{ marginTop: 24 }}>
            <Cta />
            <p className="t-secondary" style={{ marginTop: 12 }}>
              14 days, no card. If your trial ends without a plan, nothing is deleted and your audit
              binders still export.
            </p>
          </div>
        </section>

        {/* 7 — Honest FAQ. */}
        <section
          className="hairline-t"
          style={{ marginTop: 40, padding: "40px var(--gutter) 0", maxWidth: 720, marginInline: "auto" }}
        >
          <p className="t-label">Straight answers</p>
          {[
            {
              q: "What exactly do you read off the certificate?",
              a: "Carrier, producer, the certificate holder, and per policy line: the policy number, effective and expiry dates, the limit, and the ADDL INSD and SUBR WVD columns. Each with its own confidence score.",
            },
            {
              q: "What does a human still have to do?",
              a: "Confirm anything the parser was not sure about, and type in the occasional scan. On a clean text PDF from an agency system, usually nothing.",
            },
            {
              q: "Do you count an umbrella toward a short general liability limit?",
              a: "No. Whether an umbrella satisfies an underlying requirement is a reading of your contract, and guessing it would hand you a confident wrong 'compliant'. The umbrella is tracked as its own required line.",
            },
            {
              q: "Do you evidence primary and non-contributory?",
              a: "Not yet, and the requirements editor says so where you set the flag. An ACORD 25 has no box for it — evidencing it needs the endorsement page, which is on the roadmap and is not pretended at today.",
            },
            {
              q: "How often do vendors get chased?",
              a: "Renewal requests at 30, 14, 7 and 1 day before expiry, one lapse notice after, and a deficiency letter naming each gap. Each fires exactly once per renewal cycle, and the whole ladder stops the moment a compliant replacement lands.",
            },
            {
              q: "Do my vendors need an account?",
              a: "No. They get a link. That is the entire vendor experience, and it works on a phone because that is where an agent's assistant will open it.",
            },
            {
              q: "Is this legal advice?",
              a: "No. CertShield checks what your template says against what the certificate says. Your broker and your counsel decide what the template should say.",
            },
          ].map((item) => (
            <details key={item.q} className="hairline-b" style={{ padding: "14px 0" }}>
              <summary
                className="t-title"
                style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}
              >
                {item.q}
              </summary>
              <p className="t-body" style={{ marginTop: 8 }}>
                {item.a}
              </p>
            </details>
          ))}
        </section>

        {/* 8 — Final CTA, the claim as an imperative. */}
        <section
          className="hairline-t"
          style={{ marginTop: 40, padding: "40px var(--gutter) 0", maxWidth: 720, marginInline: "auto" }}
        >
          <h2 className="t-display">Close the folder. Open the file.</h2>
          <p className="t-body" style={{ marginTop: 12, maxWidth: "56ch" }}>
            Import your vendors on Tuesday. Compliant-or-chasing by Friday. Then never wonder what is
            in the folder again.
          </p>
          <div style={{ marginTop: 24 }}>
            <Cta />
          </div>
        </section>
      </main>

      <footer
        className="hairline-t"
        style={{ padding: "24px var(--gutter) 40px", maxWidth: 720, margin: "0 auto" }}
      >
        <p className="t-secondary">
          CertShield · certificate-of-insurance tracking for property managers and general
          contractors. Pre-launch: every figure on this page is either demo data generated by the
          product or arithmetic you can check.
        </p>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          <Link href="/login" className="btn-quiet">
            Sign in
          </Link>
        </p>
      </footer>

      {/* Sticky mobile CTA — the same words, in the thumb zone. */}
      <div
        className="no-print lg:hidden"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "12px var(--gutter) calc(12px + env(safe-area-inset-bottom))",
          background: "var(--color-sheet)",
          borderTop: "1px solid var(--color-line)",
          zIndex: 20,
        }}
      >
        <Link href="/signup" className="btn btn-primary btn-full">
          {CTA}
        </Link>
      </div>
    </>
  );
}
