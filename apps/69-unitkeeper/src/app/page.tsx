/**
 * The landing page, to MARKETING_PLAYBOOK.md.
 *
 * Message architecture, written before the pixels:
 *
 *   Enemy      — the lien deadline computed on a napkin.
 *   Sentence   — the one process with legal teeth should not run on memory.
 *   Arc        — hook (the device running) → tension (what a botched sequence
 *                costs) → proof (a real generated notice, a real citation, the
 *                arithmetic) → offer (flat price, 14 days, no card).
 *   Device     — the lien clock that runs itself, used in the hero, the pricing
 *                and the final CTA.
 *   CTA        — "Start free — 14 days", verbatim, at every placement.
 *
 * Everything numeric on this page is the output of the seeded demo yard and is
 * labelled as a demo. There are no testimonials, no logos and no usage numbers,
 * because this product is pre-launch and inventing them would be a debt it never
 * pays off.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { MapToRail } from "@/components/marketing/MapToRail";
import { PLANS } from "@/lib/plans";
import { REVIEWED_STATES } from "@/lib/lien-rules";

export const metadata: Metadata = {
  title: "UnitKeeper — the lien clock that runs itself",
  description:
    "Self-storage management for one-owner facilities: a live unit map, ten-minute move-ins, autopay with a late ladder, and a statutory lien timeline with citations and hard stops.",
};

const CTA = "Start free — 14 days";

function Cta({ variant = "primary" }: { variant?: "primary" | "secondary" }) {
  return (
    <Link
      href="/signup"
      className={`btn ${variant === "primary" ? "btn-primary" : "btn-secondary"}`}
    >
      {CTA}
    </Link>
  );
}

export default function LandingPage() {
  return (
    <div>
      <header
        className="hairline-b"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "16px 20px",
          maxWidth: 1080,
          margin: "0 auto",
        }}
      >
        <span className="t-label">UnitKeeper</span>
        <nav style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Link href="/login" className="btn-quiet">
            Sign in
          </Link>
        </nav>
      </header>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "0 20px 96px" }}>
        {/* ---- Hero: the machine running, above everything else ------------- */}
        <section style={{ paddingTop: 32 }}>
          <p className="t-placard" style={{ color: "var(--color-rolldoor-strong)" }}>
            The lien clock that runs itself
          </p>
          <h1 className="t-display" style={{ marginTop: 12, maxWidth: "22ch" }}>
            The lien deadline, off the napkin.
          </h1>
          <p className="t-body" style={{ marginTop: 12, maxWidth: "56ch" }}>
            Storage management for one-owner facilities: a live unit map, ten-minute move-ins,
            autopay with a late ladder, and the statutory lien sequence counted the way a court
            counts it — with the citation under every date.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
            <Cta />
            <Link href="#device" className="btn btn-secondary">
              Watch the clock run
            </Link>
          </div>
          <p className="t-secondary" style={{ marginTop: 12 }}>
            No card. 50–400 units. Flat price you can predict.
          </p>

          <div id="device" style={{ marginTop: 32 }}>
            <MapToRail />
            <p className="t-secondary" style={{ marginTop: 12 }}>
              Demo data from our own seeded yard — 160 units, 138 rented. Every date above is
              computed by the same engine the product ships, from the Texas rule pack.
            </p>
          </div>
        </section>

        {/* ---- The enemy, named --------------------------------------------- */}
        <section className="hairline-t" style={{ marginTop: 56, paddingTop: 32 }}>
          <h2 className="t-h2" style={{ maxWidth: "30ch" }}>
            The index-card box is fine. The napkin is not.
          </h2>
          <p className="t-body" style={{ marginTop: 12, maxWidth: "62ch" }}>
            A paper map and a cash ledger will run a 160-unit yard for years. The one process that
            will not survive memory is the lien sale: a statutory notice sequence, a waiting period,
            a publication requirement, and a sale date that is unlawful by a single day if the
            arithmetic is wrong. Get it wrong and the sale is void — and the tenant whose contents you
            sold has a claim against you, not against your spreadsheet.
          </p>
          <p className="t-body" style={{ marginTop: 12, maxWidth: "62ch" }}>
            The facility software built for REITs does this inside a module you buy after an
            onboarding call. The notebook cannot do it at all. That gap is the whole product.
          </p>
        </section>

        {/* ---- Receipts: a real citation and a real notice ------------------ */}
        <section className="hairline-t" style={{ marginTop: 40, paddingTop: 32 }}>
          <h2 className="t-h2">Receipts, not adjectives</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 24,
              marginTop: 24,
            }}
          >
            <div>
              <p className="t-label">Every date carries its citation</p>
              <p className="t-mono" style={{ marginTop: 8 }}>
                2026-06-01 · Tex. Prop. Code § 59.042
                <br />
                2026-06-15 · Tex. Prop. Code § 59.043
                <br />
                2026-06-22 · Tex. Prop. Code § 59.044
                <br />
                2026-06-29 · Tex. Prop. Code § 59.044
              </p>
              <p className="t-secondary" style={{ marginTop: 8 }}>
                Reviewed rule packs ship for {REVIEWED_STATES.join(", ")}, each dated. A state
                without one says so plainly and hands you the manual checklist — UnitKeeper never
                invents a waiting period.
              </p>
            </div>
            <div>
              <p className="t-label">A generated notice, from the demo yard</p>
              <p className="t-mono" style={{ marginTop: 8 }}>
                SEND BY CERTIFIED MAIL — RETURN RECEIPT REQUESTED
                <br />
                <br />
                To: Dwayne Petrillo
                <br />
                1218 Kestrel Ridge, Cedar Park, TX 78613
                <br />
                <br />
                unit: B-18 (5x10)
                <br />
                balance due: $257.00
                <br />
                earliest sale: 2026-06-29
              </p>
              <p className="t-secondary" style={{ marginTop: 8 }}>
                Addressed from the legal notice address on the lease, priced from the ledger rows,
                printed certified-mail-ready. The lien packet binds every notice you actually mailed
                to the full ledger, in one PDF.
              </p>
            </div>
            <div>
              <p className="t-label">The ladder fires once and reverses</p>
              <p className="t-mono" style={{ marginTop: 8 }}>
                day 3 retry · day 6 fee · day 11 overlock
                <br />
                payment lands →
                <br />
                4 steps reversed · overlock lifted
                <br />
                lien case resolved (paid)
              </p>
              <p className="t-secondary" style={{ marginTop: 8 }}>
                One row per step, keyed by a unique index, so a job that runs twice does not charge
                a second late fee. Paying in full undoes the whole ladder in one action, and the
                record of what happened stays.
              </p>
            </div>
          </div>
        </section>

        {/* ---- The math: the buyer's economics ----------------------------- */}
        <section className="hairline-t" style={{ marginTop: 40, paddingTop: 32 }}>
          <h2 className="t-h2">The arithmetic, on a 160-unit yard</h2>
          <div className="ledger-wrap" style={{ marginTop: 20 }}>
            <table className="ledger" style={{ maxWidth: 620 }}>
              <tbody>
                <tr>
                  <td>Ten minutes per move-in instead of forty</td>
                  <td className="num">6 move-ins/mo → 3 hours back</td>
                </tr>
                <tr>
                  <td>One late fee assessed on schedule, not when you remember</td>
                  <td className="num">7 late units × $20 = $140/mo</td>
                </tr>
                <tr>
                  <td>One lien sale not voided by a miscounted waiting period</td>
                  <td className="num">the whole reason</td>
                </tr>
                <tr>
                  <td className="t-title">UnitKeeper, Yard tier</td>
                  <td className="num t-mono-lg">${PLANS.yard.priceMonthly}/mo</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="t-secondary" style={{ marginTop: 12, maxWidth: "62ch" }}>
            Per-unit pricing at 250 units costs more than this at every competitor we could price.
            Flat is the point: an owner should be able to predict the bill without counting doors.
          </p>
        </section>

        {/* ---- Objection killer -------------------------------------------- */}
        <section className="hairline-t" style={{ marginTop: 40, paddingTop: 32 }}>
          <h2 className="t-h2">What UnitKeeper will not do</h2>
          <dl style={{ marginTop: 20, maxWidth: "68ch" }}>
            <dt className="t-title" style={{ marginTop: 20 }}>
              It is not your lawyer.
            </dt>
            <dd className="t-body" style={{ margin: "6px 0 0" }}>
              The engine computes dates from statute data we read and dated, prints the documents,
              and refuses to let you take a step early. It does not give legal advice and it does not
              file anything. Before your first sale, have counsel read one packet.
            </dd>

            <dt className="t-title" style={{ marginTop: 20 }}>
              It does not talk to your gate hardware. Not in v1.
            </dt>
            <dd className="t-body" style={{ margin: "6px 0 0" }}>
              Codes are issued, tracked, overlocked and revoked here, and exported as a CSV your
              keypad software imports. PTI and DoorKing integrations are on the roadmap; until they
              ship, the CSV is the handoff and we say so on the export screen.
            </dd>

            <dt className="t-title" style={{ marginTop: 20 }}>
              It never executes a lien step for you.
            </dt>
            <dd className="t-body" style={{ margin: "6px 0 0" }}>
              Nothing is mailed automatically, nothing is published automatically, and no sale is
              ever marked done by a background job. The engine counts and documents; the owner acts.
            </dd>

            <dt className="t-title" style={{ marginTop: 20 }}>
              It does not hold your rent.
            </dt>
            <dd className="t-body" style={{ margin: "6px 0 0" }}>
              Tenant payments ride your own Stripe account through Connect, so the money lands in
              your bank. Push ACH: 0.8% capped at $5 beats 2.9% + 30¢ on a $129 unit, every month,
              on every unit.
            </dd>
          </dl>
        </section>

        {/* ---- Pricing ------------------------------------------------------ */}
        <section className="hairline-t" style={{ marginTop: 40, paddingTop: 32 }}>
          <h2 className="t-h2">Flat pricing, per facility</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 24,
              marginTop: 24,
            }}
          >
            {(["keeper", "yard", "depot"] as const).map((id) => {
              const plan = PLANS[id];
              return (
                <div key={id} className="panel" style={{ padding: 20 }}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="t-title">{plan.name}</p>
                    <p className="t-mono-lg">${plan.priceMonthly}/mo</p>
                  </div>
                  <p className="t-secondary" style={{ marginTop: 8 }}>
                    {plan.blurb}
                  </p>
                  <p className="t-mono" style={{ marginTop: 12, color: "var(--color-dim)" }}>
                    ${(plan.priceMonthly / plan.units).toFixed(2)} per unit at the cap
                  </p>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 24 }}>
            <Cta />
          </div>
          <p className="t-secondary" style={{ marginTop: 12 }}>
            14 days, no card. Your yard, your ledgers and your lien files stay readable whatever
            happens to the subscription.
          </p>
        </section>

        {/* ---- Final CTA: the claim as an imperative ------------------------ */}
        <section className="hairline-t" style={{ marginTop: 40, paddingTop: 32 }}>
          <h2 className="t-display" style={{ maxWidth: "26ch" }}>
            Put the lien clock somewhere it cannot be forgotten.
          </h2>
          <p className="t-body" style={{ marginTop: 12, maxWidth: "56ch" }}>
            Draw your rows, move a tenant in, and let the ladder and the timeline count the days.
            The first thing you will see is your own yard, painted by status.
          </p>
          <div style={{ marginTop: 24 }}>
            <Cta />
          </div>
        </section>
      </main>

      <footer className="hairline-t" style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 20px 40px" }}>
        <p className="t-secondary">
          UnitKeeper · management for small self-storage facilities. Lien rule content is reviewed
          and dated per state and is not legal advice.
        </p>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          <Link href="/signup">{CTA}</Link> · <Link href="/login">Sign in</Link>
        </p>
      </footer>

      {/* Sticky CTA on a phone: mobile is most of the traffic. */}
      <div
        className="no-print"
        style={{
          position: "sticky",
          bottom: 0,
          padding: "12px 20px calc(12px + env(safe-area-inset-bottom))",
          background: "var(--color-slab)",
          borderTop: "1px solid var(--color-line)",
        }}
      >
        <Link href="/signup" className="btn btn-primary btn-full">
          {CTA}
        </Link>
      </div>
    </div>
  );
}
