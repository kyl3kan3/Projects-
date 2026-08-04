/**
 * src/components/marketing/SlotDevice.tsx
 *
 * The brand device (MARKETING_PLAYBOOK row 58): **the no-show that paid for itself.**
 *
 * A day-strip slot labelled "2:00 — Marcus, fade $45" flips to its NO-SHOW face, the policy
 * arithmetic writes itself beneath it, the ledger line lands, and the protected counter settles.
 * The same four beats the product runs when a fee resolves — same CSS classes, same durations,
 * because a marketing page showing a different animation from the product is a promise the
 * product then breaks.
 *
 * Pure CSS and pure HTML: no JavaScript, no canvas, and the hero is therefore the first thing
 * that paints. `prefers-reduced-motion` collapses all four beats to their finished state
 * (globals.css), which is the whole point of the device being a static composition that
 * animates rather than an animation that leaves nothing behind.
 */

import { Icon } from "@/components/icons";

export function SlotDevice({ animate = true }: { animate?: boolean }) {
  const beat = (name: string) => (animate ? name : "");

  return (
    <figure
      className="card"
      style={{ margin: 0, padding: 16, display: "grid", gap: 12 }}
      aria-label="A missed appointment becoming a collected fee"
    >
      <figcaption className="t-label" style={{ margin: 0 }}>
        Thursday, 6:12pm
      </figcaption>

      {/* Beat 1 — the slot flips to its NO-SHOW face. */}
      <div className={`slot ${beat("flip")}`} data-state="no_show">
        <span className="slot-time">2:00</span>
        <span style={{ minWidth: 0, display: "grid", gap: 2 }}>
          <span className="t-title">Marcus Ollet</span>
          <span className="pill pill-red">NO-SHOW</span>
        </span>
        <span className="slot-price">$45</span>
      </div>

      {/* Beat 2 — the policy arithmetic wipes in, left to right. */}
      <p className={`t-mono ${beat("math-wipe")}`} style={{ margin: 0, color: "var(--color-ink-2)" }}>
        50% of $45 · deposit kept $10.00
      </p>

      {/* Beat 3 — the finished ledger line rises into the ledger. */}
      <div className={`ledger-line ${beat("ledger-land")}`}>
        <span>
          no-show fee ·{" "}
          <span style={{ color: "var(--color-ink-2)" }}>per policy agreed Jun 12</span>
        </span>
        <span className="ledger-amount">+$12.50</span>
      </div>

      {/* Beat 4 — the protected counter settles, once. */}
      <div>
        <p className="t-label" style={{ margin: 0 }}>
          Protected this month
        </p>
        <p className={`t-stat ${beat("counter-settle")}`} style={{ margin: 0 }}>
          $212<span className="t-cents">.50</span>
        </p>
        <p className="t-secondary" style={{ margin: "4px 0 0" }}>
          3 fees · 2 deposits kept · 1 waived
        </p>
      </div>

      <p
        className="t-secondary"
        style={{
          margin: 0,
          paddingTop: 12,
          borderTop: "1px solid var(--color-hairline)",
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
        }}
      >
        <span style={{ color: "var(--color-cobalt)", flex: "none" }}>
          <Icon name="shield-card" size={18} />
        </span>
        The chair got paid anyway.
      </p>
    </figure>
  );
}
