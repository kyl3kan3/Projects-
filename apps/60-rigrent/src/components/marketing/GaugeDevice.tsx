/**
 * src/components/marketing/GaugeDevice.tsx
 *
 * The brand device, running: **"Double-booked never again."**
 *
 * Four beats, and only four — the whole marketing motion budget, spent here:
 *
 *   1. the quote line types in;
 *   2. the chalk gauge fills to 32/40 for that Saturday;
 *   3. the quantity ticks to 48 and the overrun *snaps* in rust, naming the
 *      order that holds the other 32 — a conflict should feel abrupt;
 *   4. it resolves at 40/40 and the order confirms. Hold there.
 *
 * It is CSS keyframes on a server component, so the hero ships no JavaScript and
 * the LCP is HTML. Reduced motion collapses every beat to its final frame, which
 * is why `globals.css` zeroes `animation-delay` as well as duration: with
 * `fill-mode: both` a delayed beat is pinned to `from` — width 0, opacity 0 — and
 * a reduced-motion visitor would see a blank device.
 *
 * The component is the same chalk gauge the product uses, at the same sizes, with
 * the same tokens. That is the point: the landing page is the product running,
 * not a picture of it.
 */

export function GaugeDevice() {
  return (
    <div className="panel" style={{ padding: 20 }} aria-label="A quote line blocking an overbooking">
      <div className="between" style={{ flexWrap: "wrap", gap: 4 }}>
        <span className="t-placard tone-dim">Quote #1046 · draft</span>
        <span className="t-mono tone-dim" style={{ whiteSpace: "nowrap" }}>
          SAT AUG 8 → SUN AUG 9
        </span>
      </div>

      {/* Beat 1: the line types in. */}
      <div style={{ marginTop: 16 }}>
        <p className="t-title">
          <span className="device-type">40 × White folding chair</span>
        </p>
      </div>

      {/* Beat 2: the gauge fills to 32/40. Beat 3: the overrun snaps in rust. */}
      <div className="gauge" style={{ marginTop: 12 }} data-overbooked="true">
        <div className="gauge-track">
          <div className="gauge-seg gauge-booked device-fill" />
          <div className="gauge-seg gauge-overrun device-overrun" style={{ left: "80%" }} />
        </div>
        <span className="gauge-fraction">48/40</span>
      </div>
      <p className="t-secondary" style={{ marginTop: 8 }}>
        32 of 40 chairs are already committed for that Saturday.
      </p>

      {/* Beat 3, continued: the block, inline, naming the conflicting order. */}
      <div className="overbooked beat-snap" style={{ marginTop: 12 }}>
        <strong className="t-placard">Overbooked</strong>
        <p style={{ marginTop: 6 }}>
          White folding chair: you have 40, 32 already committed for this window, so 48 is 8 over.
          Order #1043 (Stonewell Chapel) holds 32.
        </p>
      </div>

      {/* Beat 4: resolved at 40, confirmed. Hold here. */}
      <div className="beat beat-4" style={{ marginTop: 16 }}>
        <div className="hairline-t" style={{ paddingTop: 16 }}>
          <div className="between">
            <span className="t-title">40 × White folding chair</span>
            <span className="t-mono-lg">$100.00</span>
          </div>
          <div className="gauge" style={{ marginTop: 8 }}>
            <div className="gauge-track">
              <div className="gauge-seg gauge-booked" style={{ width: "80%" }} />
              <div
                className="gauge-seg gauge-requested"
                style={{ left: "80%", width: "20%" }}
              />
            </div>
            <span className="gauge-fraction">40/40</span>
          </div>
          <p className="t-secondary tone-good" style={{ marginTop: 8 }}>
            Fits exactly. Order #1046 confirmed · deposit hold $50.00 placed.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * The photo-pair receipt, art-directed rather than photographed.
 *
 * There are no real customer photographs to show — this product is pre-launch,
 * and MARKETING_PLAYBOOK law 5 forbids inventing receipts. So this is a labelled
 * staged pair drawn in the app's own palette: flat fills only, no gradients, the
 * rust scuff on the return frame exactly where the claim says it is. The caption
 * says it is demo data, because it is.
 */
export function PhotoPairReceipt() {
  return (
    <div>
      <div className="pair">
        <figure className="pair-side" style={{ margin: 0 }}>
          <span className="t-label">Out · load-out, 07:12</span>
          <span className="photo" style={{ marginTop: 8 }}>
            <StagedStill damaged={false} />
            <span className="photo-caption">OUT · 10 × 6ft banquet table</span>
          </span>
        </figure>
        <figure className="pair-side" style={{ margin: 0 }}>
          <span className="t-label">Back · check-in, 16:48</span>
          <span className="photo" style={{ marginTop: 8 }}>
            <StagedStill damaged />
            <span className="photo-caption">IN · 2 damaged</span>
          </span>
        </figure>
      </div>
      <div className="panel" style={{ marginTop: 16, padding: 16 }}>
        <div className="between">
          <span className="t-placard tone-warn">Damage · charged</span>
          <span className="t-mono-lg tone-warn">$36.00</span>
        </div>
        <p className="t-body" style={{ marginTop: 8 }}>
          2 × White linen — 120in round — wax or ink stain, down the centre fold. Priced from the fee
          schedule the customer signed. Captured from a $95.00 hold; $59.00 released the same hour.
        </p>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          Staged from our own seeded demo yard — labelled demo data, not a customer.
        </p>
      </div>
    </div>
  );
}

/**
 * A flat-fill duotone still. Not a wireframe rectangle and not a gradient: shapes
 * in the app's palette, arranged like a strapped stack under raking light.
 */
function StagedStill({ damaged }: { damaged: boolean }) {
  return (
    <svg
      viewBox="0 0 160 120"
      width="100%"
      height="100%"
      role="img"
      aria-label={
        damaged
          ? "Staged condition photo of a stack of banquet tables with a stain"
          : "Staged condition photo of a strapped stack of banquet tables"
      }
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="160" height="120" fill="var(--color-kraft)" />
      {/* the crate edge */}
      <rect x="0" y="0" width="10" height="120" fill="var(--color-ink)" />
      {/* the stack: five flat slabs */}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect
          key={i}
          x={22 + i * 2}
          y={30 + i * 12}
          width={116 - i * 4}
          height="9"
          fill={i % 2 === 0 ? "var(--color-line)" : "var(--color-faint)"}
        />
      ))}
      {/* the strap */}
      <rect x="60" y="24" width="6" height="72" fill="var(--color-canvas)" />
      <rect x="104" y="24" width="6" height="72" fill="var(--color-canvas)" />
      {/* floor shadow */}
      <rect x="10" y="96" width="150" height="24" fill="var(--color-line)" />
      <rect x="10" y="104" width="150" height="16" fill="var(--color-dim)" />
      {damaged ? (
        <>
          <rect x="76" y="54" width="26" height="9" fill="var(--color-rust)" />
          <rect x="80" y="66" width="14" height="9" fill="var(--color-rust)" />
        </>
      ) : null}
    </svg>
  );
}
