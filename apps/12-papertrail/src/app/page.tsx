import type { Metadata } from "next";
import Link from "next/link";
import { HeroChain } from "@/components/marketing/HeroChain";
import { IconCheck } from "@/components/icons";
import { PLANS } from "@/lib/plans";

/**
 * Landing page, to MARKETING_PLAYBOOK.md.
 *
 *  Enemy — the gap between "yes" and paid, where the paperwork gets postponed
 *          and the money leaks.
 *  Sentence — proposal, contract and invoice are one thread, so nothing is
 *          retyped and the deposit is already asked for.
 *  Device — proposal → contract → paid: one thread.
 *  Arc — hook (the chain running) → tension (the leak) → proof (the audit trail
 *          and the arithmetic) → offer ($12 against $25 and $36).
 *
 * Every number on this page is either the product's own arithmetic or a public
 * competitor price. There are no testimonials, logos, or usage claims, because
 * this is pre-launch and inventing them would be a debt we never pay off.
 */

export const metadata: Metadata = {
  title: "PaperTrail — proposal to paid, one thread",
  description:
    "Proposals, contracts and invoices for freelancers as one linked chain: accepted terms flow into the contract, and signing raises the deposit invoice automatically. $12/mo.",
};

const CTA = "Start free — 3 documents a month";

export default function LandingPage() {
  return (
    <div style={{ paddingBottom: 96 }}>
      {/* ---- Hero: the machine running ------------------------------------ */}
      <header className="screen pt-8" style={{ paddingBottom: 0 }}>
        <nav className="flex items-center justify-between">
          <span className="t-label">PaperTrail</span>
          <Link href="/login" className="btn-quiet">
            Sign in
          </Link>
        </nav>

        <h1 className="t-display mt-10 max-w-[22ch]">Proposal to paid, on one thread.</h1>
        <p className="t-body mt-4 max-w-[46ch]" style={{ color: "var(--color-text-2)" }}>
          Write the proposal. When your client accepts it, the contract is already drafted from the
          same words and prices. When they sign it, the deposit invoice is already in their inbox.
        </p>

        <div className="mt-8">
          <HeroChain />
        </div>
        <p className="t-secondary mt-3">
          A demo engagement, built in PaperTrail. Figures are the product's own arithmetic.
        </p>

        <Link href="/signup" className="btn btn-primary btn-full mt-8">
          {CTA}
        </Link>
        <p className="t-secondary mt-3 text-center">No card. Your first proposal takes a coffee.</p>
      </header>

      {/* ---- The enemy ---------------------------------------------------- */}
      <section className="screen pt-16" style={{ paddingBottom: 0 }}>
        <h2 className="t-h2 max-w-[26ch]">The money leaks between the documents.</h2>
        <div className="mt-6 flex flex-col">
          {[
            [
              "“I'll send the paperwork later.”",
              "The proposal was accepted on Tuesday. The contract is still a Google Doc on Friday, and the work has started anyway — no deposit, no protection.",
            ],
            [
              "The deposit nobody asked for",
              "Asking for money up front feels awkward, so it gets skipped. That is the single most expensive habit in freelancing.",
            ],
            [
              "The invoice nobody chased",
              "Net 14 became net 40 because following up felt rude. Freelancers write off billable amounts every year out of pure awkwardness.",
            ],
          ].map(([title, body]) => (
            <div key={title} className="hairline-b py-4">
              <h3 className="t-title">{title}</h3>
              <p className="t-secondary mt-1 max-w-[48ch]">{body}</p>
            </div>
          ))}
        </div>
        <p className="t-body mt-6 max-w-[46ch]">
          PaperTrail closes all three gaps by making them one object. There is no handoff to forget,
          because there is no handoff.
        </p>
      </section>

      {/* ---- The math ----------------------------------------------------- */}
      <section className="screen pt-16" style={{ paddingBottom: 0 }}>
        <h2 className="t-h2">The arithmetic on one $4,800 job</h2>
        <div className="paper mt-6">
          <table className="w-full border-collapse">
            <tbody>
              {[
                ["Signed total", "$4,800.00"],
                ["Deposit invoiced on signature (30%)", "$1,440.00"],
                ["Balance invoiced on completion", "$3,360.00"],
                ["Retyped between documents", "nothing"],
              ].map(([label, value]) => (
                <tr key={label} className="hairline-b">
                  <td className="t-doc py-3 pr-3">{label}</td>
                  <td className="t-doc-money py-3 text-right whitespace-nowrap">{value}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="t-label pt-4">Deposit collected before work starts</td>
                <td className="t-doc-money pt-4 text-right" style={{ fontSize: 22 }}>
                  $1,440.00
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="t-secondary mt-3">
          Three of those four lines happen without you doing anything. The deposit percentage and the
          payment terms are yours to set.
        </p>
      </section>

      {/* ---- Objection killer: is an e-signature real? -------------------- */}
      <section className="screen pt-16" style={{ paddingBottom: 0 }}>
        <h2 className="t-h2 max-w-[24ch]">“Does a typed signature actually hold?”</h2>
        <p className="t-body mt-4 max-w-[46ch]">
          What makes an electronic signature stand up is the record around it. Every signature in
          PaperTrail stores the consent your client ticked — verbatim — with who signed, when, from
          where, and how. It prints on the agreement, in the client's copy and yours.
        </p>
        <div className="paper mt-6">
          <div className="t-label">Signature of the Client</div>
          <div
            className="mt-3"
            style={{
              borderBottom: "1px solid var(--color-ink)",
              paddingBottom: 8,
              fontFamily: "var(--font-display)",
              fontSize: 28,
              fontStyle: "italic",
            }}
          >
            Rosa Álvarez
          </div>
          <ul className="mt-3 list-none p-0">
            {[
              "Signed by Rosa Álvarez (rosa@meridiancoffee.example)",
              "Jul 14, 2026 · 14:32 UTC",
              "Method: typed signature",
              "IP 189.14.2.20",
              "Safari on iPhone",
              "Consent: “I agree to sign this document electronically…”",
            ].map((line) => (
              <li key={line} className="t-meta">
                {line}
              </li>
            ))}
          </ul>
          <p className="t-secondary mt-3">From a staged demo contract, not a real client.</p>
        </div>
        <p className="t-body mt-6 max-w-[46ch]">
          And your client never makes an account. They get a link, they read a page, they sign with a
          finger. That is the whole experience.
        </p>
      </section>

      {/* ---- What you get ------------------------------------------------- */}
      <section className="screen pt-16" style={{ paddingBottom: 0 }}>
        <h2 className="t-h2">What's in it</h2>
        <ul className="mt-4 list-none p-0">
          {[
            "Proposal builder with optional add-ons your client can tick — the total updates as they do",
            "One-click proposal → contract, with the accepted scope and prices copied in, not referenced",
            "E-signature, typed or drawn, with a full audit trail on the document",
            "Deposit invoice raised and emailed the moment the contract is signed",
            "Stripe payment links on every invoice — card and US bank transfer — plus part payments",
            "A three-step reminder sequence that stops the second an invoice is paid",
            "Paid, outstanding and overdue on one screen, and a CSV your accountant will accept",
          ].map((line) => (
            <li key={line} className="t-body flex items-start gap-3 py-2">
              <span style={{ color: "var(--color-wax)", flex: "none" }} aria-hidden="true">
                <IconCheck size={18} />
              </span>
              {line}
            </li>
          ))}
        </ul>
      </section>

      {/* ---- Pricing, anchored ------------------------------------------- */}
      <section className="screen pt-16" style={{ paddingBottom: 0 }}>
        <h2 className="t-h2">Priced for the job, not the suite</h2>
        <p className="t-secondary mt-2">
          Bonsai starts at $25/mo and HoneyBook at $36/mo, both selling a business-management suite.
          Wave is free and has no proposals, contracts, or e-signature at all.
        </p>

        <div className="mt-8 flex flex-col gap-8">
          {(["free", "solo", "studio"] as const).map((id) => {
            const p = PLANS[id];
            return (
              <div key={id} className="hairline-t pt-6">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="t-h2">{p.name}</h3>
                  <span className="t-money">
                    {p.priceMonthly === 0 ? "$0" : `$${p.priceMonthly}/mo`}
                  </span>
                </div>
                <p className="t-secondary mt-1">
                  {id === "free"
                    ? "3 new documents a month, e-signature with the full audit trail, CSV export. PaperTrail's line at the foot of the page."
                    : id === "solo"
                      ? `Unlimited documents, deposit-on-signature, automatic reminders, your logo and sender domain. $${p.priceYearly}/year if you'd rather pay once.`
                      : `Three brands and three seats for a micro-studio. $${p.priceYearly}/year.`}
                </p>
              </div>
            );
          })}
        </div>

        <p className="t-body mt-8 max-w-[46ch]">
          One collected deposit pays for a year of Solo. That is the entire pitch.
        </p>

        <Link href="/signup" className="btn btn-primary btn-full mt-8">
          {CTA}
        </Link>
      </section>

      {/* ---- Final CTA --------------------------------------------------- */}
      <section className="screen pt-16">
        <h2 className="t-display max-w-[20ch]">Send the proposal. The rest is already written.</h2>
        <Link href="/signup" className="btn btn-primary btn-full mt-8">
          {CTA}
        </Link>
        <p className="t-secondary mt-4">
          PaperTrail is pre-launch and built in the open: no invented testimonials, no logo wall, no
          usage numbers we haven't earned. Everything shown above is the product's own output.
        </p>
        <footer className="hairline-t mt-10 pt-4">
          <p className="t-secondary">
            <Link href="/login" style={{ color: "var(--color-fountain)" }}>
              Sign in
            </Link>{" "}
            · Contract templates are a starting point, not legal advice.
          </p>
        </footer>
      </section>

      {/* Sticky mobile CTA — same words, every time. */}
      <Link href="/signup" className="thumb-cta btn btn-primary btn-full lg:hidden" style={{ bottom: 16 }}>
        {CTA}
      </Link>
    </div>
  );
}
