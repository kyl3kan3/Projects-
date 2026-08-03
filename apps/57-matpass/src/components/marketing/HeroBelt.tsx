/**
 * The brand device, running: a belt bar whose class counter ticks, whose progress
 * hairline fills to the requirement, and onto which a stripe then slides and
 * seats with a snap — after which the grading list adds the student's name by
 * itself.
 *
 * Pure CSS and pure HTML. No canvas, no JS, no library: the hero has to paint
 * inside 2 seconds on a mid Android over 4G, and this is a 12px bar and some
 * keyframes. Under `prefers-reduced-motion` every beat collapses to its end
 * state — the stripe is simply already seated, and the name is simply already on
 * the list, which is exactly what the product would show anyway.
 *
 * This is a staged demonstration with invented student names, and the page says
 * so in words next to it. MARKETING_PLAYBOOK law 5: no fabricated receipts.
 */

import { safeBeltHex, stripeColorFor } from "@/lib/belt";

export function HeroBelt() {
  const band = safeBeltHex("#2B4C7E"); // blue belt, from the curriculum
  const stripe = stripeColorFor(band);

  return (
    <div className="hero-device card" style={{ padding: 20 }}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="t-title">Marcus O.</p>
        <span className="pill pill-eligible hero-pill">Eligible</span>
      </div>

      <div style={{ marginTop: 12 }}>
        <div
          className="belt belt-lg"
          style={
            {
              "--belt-band": band,
              "--belt-stripe": stripe,
            } as React.CSSProperties
          }
          role="img"
          aria-label="Blue belt with two stripes, a third seating"
        >
          <span className="belt-stripe" />
          <span className="belt-stripe" />
          <span className="belt-stripe hero-stripe" />
          <span className="belt-stripe-empty" />
        </div>
        <div className="flex items-center gap-3" style={{ marginTop: 4 }}>
          <div className="progress" style={{ flex: 1 }}>
            <span className="hero-fill" />
          </div>
          <span className="t-data fg-2" style={{ flex: "none" }}>
            <span className="hero-count">
              <span data-n="17">17</span>
              <span data-n="18">18</span>
              <span data-n="19">19</span>
              <span data-n="20">20</span>
            </span>{" "}
            / 20
          </span>
        </div>
      </div>

      <p className="t-data fg-2 hero-ledger" style={{ marginTop: 16 }}>
        Blue · 3rd stripe · Jul 17 2026 · Prof. Reyes
      </p>

      <div className="hairline-t" style={{ marginTop: 16, paddingTop: 16 }}>
        <p className="t-label">Summer grading · candidates</p>
        <p className="t-secondary hero-row-1" style={{ marginTop: 8 }}>
          Amara O. <span className="fg-3">— White belt, 4th stripe</span>
        </p>
        <p className="t-secondary hero-row-2" style={{ marginTop: 4 }}>
          Tomas L. <span className="fg-3">— Blue belt</span>
        </p>
        <p className="t-secondary hero-row-3" style={{ marginTop: 4 }}>
          <span className="crimson">Marcus O.</span>{" "}
          <span className="fg-3">— Blue belt, 4th stripe · added by MatPass</span>
        </p>
      </div>
    </div>
  );
}
