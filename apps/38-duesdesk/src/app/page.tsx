import type { Metadata } from "next";
import Link from "next/link";
import { PLANS, PLAN_ORDER } from "@/lib/plans";
import { formatMoney } from "@/lib/money";
import {
  IconBank,
  IconCheck,
  IconGavel,
  IconHorn,
  IconPeople,
  IconReceipt,
  IconRepeat,
} from "@/components/icons";
import { PaidSeal } from "@/components/ledger";

/**
 * The marketing page. Built last, to MARKETING_PLAYBOOK.md.
 *
 *  - **Enemy:** the volunteer treasurer chasing 40 checks a quarter.
 *  - **One sentence:** dues collect themselves, records keep themselves, and the
 *    next treasurer inherits a working system.
 *  - **Device:** 40 checks → zero chased.
 *  - **CTA phrase, verbatim four times:** "Set up your association".
 *
 * Four animated beats and no more (Law 6): the statement assembling in the hero,
 * the device landing, the proof revealing, the arithmetic writing itself out.
 * Everything else is typeset and static. The hero is HTML and CSS — no canvas, no
 * image — so the LCP is a paragraph of text.
 *
 * Law 5 is why there are no testimonials, no logos, and no usage numbers here:
 * DuesDesk is pre-launch, the demo statement below is staged and says so, and a
 * fabricated receipt is a debt the brand never pays off.
 */
export const metadata: Metadata = {
  title: "DuesDesk — 40 checks a quarter, zero chased",
  description:
    "Dues invoicing with autopay, a roster that survives board turnover, a violations and requests log with photo threads, and announcements you can prove arrived. Built for the self-managed HOA, club, or league — not for a management company.",
};

const CTA = "Set up your association";

export default function LandingPage() {
  return (
    <>
      <header className="screen-plain flex items-center justify-between pt-6">
        <span className="t-label">DuesDesk</span>
        <nav className="flex items-center gap-5">
          <Link href="/login" className="t-secondary" style={{ color: "var(--color-navy)" }}>
            Sign in
          </Link>
        </nav>
      </header>

      {/* ---------------------------------------------------------- hero --- */}
      <main>
        <section className="screen-plain pt-10 md:pt-16">
          <p className="t-label">For self-managed HOAs, clubs, and leagues</p>
          <h1 className="t-display mt-4" style={{ maxWidth: "22ch" }}>
            40 checks a quarter. Zero chased.
          </h1>
          <p className="t-body mt-5" style={{ maxWidth: "56ch" }}>
            Dues collect themselves, records keep themselves, and the next treasurer inherits a
            working system — not a shoebox and a spreadsheet with your name on it.
          </p>

          {/* Beat 1: the statement assembling, then the seal landing. */}
          <div className="beat1 panel mt-8 p-4" style={{ maxWidth: 420 }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="t-label">Maple Ridge Homeowners Association</p>
                <p className="t-title mt-1">Q2 2026 dues</p>
                <p className="t-data ink-3 mt-1">due Apr 1, 2026 · 204 Maple St</p>
              </div>
              <span className="beat1-seal">
                <PaidSeal stamp />
              </span>
            </div>
            <div className="mt-4">
              {[
                { label: "2026 Quarterly Dues — Q2 2026", cents: 18000 },
                { label: "Autopay · bank transfer", cents: 0 },
              ].map((line, i) => (
                <div
                  key={line.label}
                  className="beat1-line hairline-b flex items-baseline justify-between gap-3 py-2"
                  style={{ animationDelay: `${120 + i * 90}ms` }}
                >
                  <span className="t-secondary" style={{ color: "var(--color-ink)" }}>
                    {line.label}
                  </span>
                  <span className="t-data">
                    {line.cents === 0 ? "paid Apr 1" : formatMoney(line.cents)}
                  </span>
                </div>
              ))}
            </div>
            <div className="rule-ink mt-3 flex items-baseline justify-between gap-3 pt-3">
              <span className="t-title">Balance</span>
              <span className="t-data">{formatMoney(0)}</span>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/signup" className="btn btn-primary">
              {CTA}
            </Link>
            <p className="t-secondary">
              No card to start. Import your roster, run one cycle, decide after.
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------ device --- */}
        <section className="screen-plain mt-20">
          <p className="t-label">The arithmetic</p>
          <div className="beat2 mt-4 flex flex-wrap items-baseline gap-4">
            <span className="t-stat" style={{ color: "var(--color-ink-3)" }}>
              40
            </span>
            <span className="t-h2 ink-3">checks to chase</span>
            <span className="t-h2 ink-3">→</span>
            <span className="beat2-zero t-stat">0</span>
          </div>
          <p className="t-body mt-5" style={{ maxWidth: "58ch" }}>
            The number on the dues screen is households you still have to chase. Every autopay
            enrolment takes one off it permanently. Boards that get past about seven in ten enrolled
            describe the same thing: the quarterly evening at the kitchen table simply stops
            happening.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <Feature
              Icon={IconRepeat}
              title="Autopay, member-initiated"
              body="Households enrol from the payment link in their invoice email — no account, no password. Saving a bank account needs an emailed confirmation first, because that link could have been forwarded."
            />
            <Feature
              Icon={IconBank}
              title="Bank transfer, listed first"
              body="About 80 cents a payment against about 2.9% on a card. On $180 of quarterly dues that is $1.44 instead of $5.52, and it is the association's money either way."
            />
            <Feature
              Icon={IconReceipt}
              title="Checks still work"
              body="The holdouts are real. Recording a check is two taps from the household row, and the ledger never forks back to a spreadsheet."
            />
          </div>
        </section>

        {/* -------------------------------------------------------- proof --- */}
        <section className="screen-plain mt-20">
          <p className="t-label">What a cycle actually looks like</p>
          <h2 className="t-h2 mt-3" style={{ maxWidth: "30ch" }}>
            A staged demo, and we will say so every time.
          </h2>
          <p className="t-body mt-4" style={{ maxWidth: "58ch" }}>
            DuesDesk has not launched, so there are no customer logos on this page and no
            &ldquo;trusted by&rdquo; number. What follows is a quarter run against a demo
            association of 63 units, with the figures the software actually produced.
          </p>

          <div className="beat3 panel mt-8 p-5" style={{ maxWidth: 560 }}>
            <p className="t-label">Demo association · Q2 2026 · 63 units</p>
            <div className="mt-4">
              <ProofRow label="Invoices generated Apr 1" value="63" />
              <ProofRow label="Prorated for a mid-quarter closing" value="1" />
              <ProofRow label="Expected" value={formatMoney(1134000)} />
              <ProofRow label="Collected by Apr 3, on autopay" value={formatMoney(774000)} />
              <ProofRow label="Households still to chase on Apr 3" value="20" />
              <ProofRow label="Households still to chase on Apr 18" value="3" />
              <ProofRow label="Reminders sent, by rung" value="20 · 6 · 0" />
              <ProofRow label="Late fees applied, then waived by vote" value="2 · 1" />
            </div>
            <p className="t-secondary hairline-t mt-4 pt-4">
              Staged on demo data, not a customer&apos;s. When the first three real associations
              finish a cycle and agree to be named, their numbers replace these ones — and this
              paragraph goes away.
            </p>
          </div>
        </section>

        {/* --------------------------------------------- objection killer --- */}
        <section className="screen-plain mt-20">
          <p className="t-label">The objection every board raises</p>
          <h2 className="t-h2 mt-3" style={{ maxWidth: "30ch" }}>
            &ldquo;Half our members will never use software.&rdquo;
          </h2>
          <p className="t-body mt-4" style={{ maxWidth: "58ch" }}>
            Correct, and they do not have to. There is no member account in DuesDesk and no password
            to reset. Every invoice email carries a link to one page: what you owe, a button to pay
            it, your requests, and the association&apos;s documents. It works on a nine-year-old
            phone. It can be read out over the telephone. It expires and can be revoked by the board.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <Feature
              Icon={IconPeople}
              title="A roster that outlives the board"
              body="Join and leave dates, past owners kept, a CSV export any successor can open. A sold home closes one household and opens another — arrears never move onto a buyer."
            />
            <Feature
              Icon={IconGavel}
              title="Issues, numbered and dated"
              body="Violations and requests as threads with photos, member-visible entries separated from board-only notes, and a “we notified you on March 3” receipt that ends the argument."
            />
            <Feature
              Icon={IconHorn}
              title="Announcements you can prove arrived"
              body="Segment by unit or by aging bucket, email everyone, text the members who opted in themselves, and read the delivery report — which quietly fixes your roster."
            />
          </div>
        </section>

        {/* --------------------------------------------------------- math --- */}
        <section className="screen-plain mt-20">
          <p className="t-label">The math</p>
          <h2 className="t-h2 mt-3" style={{ maxWidth: "32ch" }}>
            Against a management company, this is a rounding error.
          </h2>
          <div className="beat4 panel mt-6 p-5" style={{ maxWidth: 520 }}>
            <MathRow label="A 60-unit association, professionally managed" value="$600–$1,500 / mo" />
            <MathRow label="DuesDesk, Block plan" value="$49 / mo" />
            <MathRow label="Per door, per month" value="$0.82" />
            <div className="rule-ink mt-3 pt-3">
              <MathRow
                label="Treasurer evenings returned per quarter"
                value="most of them"
                strong
              />
            </div>
            <p className="t-secondary mt-4">
              The comparison boards actually make is the second one: an unpaid neighbour&apos;s
              evenings, four times a year, for as long as they hold the office.
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------ pricing --- */}
        <section className="screen-plain mt-20">
          <p className="t-label">Pricing</p>
          <h2 className="t-h2 mt-3">By units. Board seats are free, always.</h2>
          <p className="t-body mt-4" style={{ maxWidth: "56ch" }}>
            Volunteer boards rotate. Charging per seat would punish an association for having people
            willing to serve, so we do not.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {PLAN_ORDER.map((id) => {
              const plan = PLANS[id];
              return (
                <article key={id} className="panel p-5">
                  <p className="t-label">{plan.name}</p>
                  <p className="t-stat mt-2" style={{ fontSize: 34 }}>
                    ${plan.priceMonthly}
                  </p>
                  <p className="t-secondary">
                    per month · up to {plan.units} units · ${(plan.priceMonthly / plan.units).toFixed(2)}{" "}
                    per door
                  </p>
                  <div className="hairline-t mt-4 pt-3">
                    {[
                      "Dues invoicing with autopay",
                      "Roster and household portal links",
                      "Violations and requests log",
                      "Email announcements",
                      "Delinquency view",
                      ...(plan.sms ? ["Text-message announcements"] : []),
                      ...(plan.lateFeeRules ? ["Late-fee rules and payment plans"] : []),
                      ...(plan.documentLibrary ? ["Document library"] : []),
                      ...(plan.exports ? ["Board roles and exports"] : []),
                      ...(plan.multiProperty ? ["Multiple properties and API export"] : []),
                    ].map((line) => (
                      <div key={line} className="flex items-start gap-2 py-1">
                        <IconCheck size={16} className="green" />
                        <span className="t-secondary" style={{ color: "var(--color-ink)" }}>
                          {line}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>

          <p className="t-secondary mt-6" style={{ maxWidth: "58ch" }}>
            Stripe&apos;s processing fees are the association&apos;s, at Stripe&apos;s rates, charged
            to the association&apos;s own Stripe account. DuesDesk takes nothing out of a dues
            payment. Annual billing is two months free, because boards approve annual budgets and
            question monthly line items.
          </p>

          <div className="mt-8">
            <Link href="/signup" className="btn btn-primary">
              {CTA}
            </Link>
          </div>
        </section>

        {/* ---------------------------------------------------- final CTA --- */}
        <section className="screen-plain mt-20 mb-28">
          <h2 className="t-display" style={{ maxWidth: "24ch" }}>
            Import the roster. Run one quarter. Stop chasing.
          </h2>
          <p className="t-body mt-5" style={{ maxWidth: "54ch" }}>
            Setup is an afternoon, not an implementation. If a cycle goes out and the checks do not
            stop, you have lost an afternoon — and you still keep the export.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/signup" className="btn btn-primary">
              {CTA}
            </Link>
            <Link href="/login" className="btn btn-secondary">
              Sign in
            </Link>
          </div>
        </section>
      </main>

      {/* Sticky mobile CTA — the same phrase, a fourth time. */}
      <div className="sticky-cta md:hidden">
        <Link href="/signup" className="btn btn-primary btn-full">
          {CTA}
        </Link>
      </div>

      <footer className="screen-plain hairline-t py-8">
        <p className="t-label">DuesDesk</p>
        <p className="t-secondary mt-2" style={{ maxWidth: "60ch" }}>
          Operations for small HOAs, clubs, and leagues. DuesDesk records and schedules; it does not
          give legal advice and never generates a legal notice or a fine schedule. Collection and
          violation process is governed by your state&apos;s statute and your association&apos;s own
          governing documents.
        </p>
      </footer>
    </>
  );
}

function Feature({
  Icon,
  title,
  body,
}: {
  Icon: (props: { size?: number; className?: string }) => React.ReactElement;
  title: string;
  body: string;
}) {
  return (
    <article>
      <Icon size={20} className="navy" />
      <h3 className="t-title mt-3">{title}</h3>
      <p className="t-secondary mt-2">{body}</p>
    </article>
  );
}

function ProofRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="hairline-b flex items-baseline justify-between gap-3 py-2">
      <span className="t-secondary" style={{ color: "var(--color-ink)" }}>
        {label}
      </span>
      <span className="t-data">{value}</span>
    </div>
  );
}

function MathRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className={strong ? "t-title" : "t-secondary"} style={{ color: "var(--color-ink)" }}>
        {label}
      </span>
      <span className="t-data">{value}</span>
    </div>
  );
}
