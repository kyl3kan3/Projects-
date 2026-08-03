/**
 * The hero device: a bill resolving into a figure with its factor attached, then into the
 * questionnaire answer that figure fills in.
 *
 * Two of the page's four animated beats live here and both are pure CSS keyframes with
 * staged delays — no JS timers, no canvas, nothing on the critical path. Under
 * `prefers-reduced-motion` every beat lands instantly and the content is identical, which
 * is the rule: the hero has to read as a finished artefact even with all motion off.
 *
 * The figures are from a staged demo inventory and the page says so, in words, next to
 * them. Nothing here is presented as a customer's real data.
 */

import { IconThread } from "@/components/icons";

const BILL_LINES = [
  { label: "Consolidated Edison Company of New York", mono: false },
  { label: "Service Address: 118 Meserole Ave, Brooklyn NY", mono: false },
  { label: "Service Period: Mar 1, 2025 – Mar 31, 2025", mono: true },
  { label: "Total kWh used 4,182", mono: true },
];

export function HeroDemo() {
  return (
    <div className="panel p-4" style={{ maxWidth: 460 }}>
      <p className="t-label">One bill in</p>

      <div className="mt-3" style={{ borderLeft: "1px solid var(--color-line)", paddingLeft: 12 }}>
        {BILL_LINES.map((line, i) => (
          <p
            key={line.label}
            className={`beat ${line.mono ? "t-data" : "t-secondary"}`}
            data-i={Math.min(i, 3)}
            style={{ marginTop: i === 0 ? 0 : 6 }}
          >
            {line.label}
          </p>
        ))}
      </div>

      <div className="beat mt-5" data-i="2">
        <p className="t-label">Scope 2, location-based</p>
        <p className="t-mono mt-1" style={{ fontSize: 34, fontWeight: 500, lineHeight: 1 }}>
          1.39 <span style={{ fontSize: 14 }}>tCO2e</span>
        </p>
      </div>

      <span className="hero-thread thread" aria-hidden="true" />

      <div className="beat mt-1" data-i="3">
        <div className="flex items-start gap-2">
          <span style={{ color: "var(--color-moss)", marginTop: 2 }}>
            <IconThread size={16} />
          </span>
          <div>
            <p className="t-data">4,182 kWh × 0.332 kgCO2e/kWh = 1.389 tCO2e</p>
            <p className="t-data mt-1" style={{ color: "var(--color-accent-text)" }}>
              eGRID NYCW · eGRID2022 (published 2024)
            </p>
            <p className="report-note mt-2" style={{ maxWidth: "44ch" }}>
              US EPA eGRID2022, subregion NYCW, total output CO2e rate 733 lb/MWh, converted
              at 0.45359237 kg/lb.
            </p>
          </div>
        </div>
      </div>

      <p className="t-secondary mt-4" style={{ maxWidth: "42ch" }}>
        Staged demo. The bill is fictional; the factor, the citation and the arithmetic are
        the ones the product ships with.
      </p>
    </div>
  );
}
