/**
 * The brand device: **"Expired COIs caught before the claim."**
 *
 * Four beats, in reading order, animated once on entry with staggered CSS delays —
 * no JavaScript, no canvas, so it is on screen inside the first paint:
 *
 *   1. the ACORD form arrives
 *   2. it parses into coverage rows
 *   3. one row fails, in the named sentence
 *   4. the ladder fires, a replacement lands, and the seal presses
 *
 * Because every beat is in the DOM from the start, `prefers-reduced-motion` holds the
 * finished, sealed frame rather than showing a degraded placeholder. That is also
 * what a screen reader gets.
 *
 * The numbers are demo data and the panel says so — CertShield is pre-launch and has
 * no customers to quote.
 */

import { ComplianceSeal } from "@/components/ComplianceSeal";

const BEAT = 420; // ms between beats

function Beat({
  index,
  label,
  children,
}: {
  index: number;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="device-beat"
      style={{ animationDelay: `${index * BEAT}ms`, paddingTop: index === 0 ? 0 : 16 }}
    >
      <p className="t-label" style={{ marginBottom: 6 }}>
        {label}
      </p>
      {children}
    </div>
  );
}

export function ParseDevice() {
  return (
    <figure
      className="panel"
      style={{ margin: 0, padding: 16, overflow: "hidden" }}
      aria-label="How a certificate becomes a verdict"
    >
      {/* Beat 1 — the form arrives. */}
      <Beat index={0} label="1 · The ACORD 25 arrives">
        <div
          style={{
            border: "1px solid var(--color-line)",
            borderRadius: 2,
            padding: 10,
            background: "#fff",
          }}
        >
          <p className="t-mono" style={{ fontSize: 10, color: "var(--color-dim)" }}>
            ACORD 25 (2016/03) · CERTIFICATE OF LIABILITY INSURANCE
          </p>
          <p className="t-mono" style={{ fontSize: 10, marginTop: 4 }}>
            INSURED: Kestrel Roofing LLC
          </p>
          <p className="t-mono" style={{ fontSize: 10, color: "var(--color-dim)" }}>
            CERTIFICATE HOLDER: Harbor Ridge Management LLC
          </p>
          <div
            style={{ marginTop: 8, display: "grid", gap: 3 }}
            aria-hidden="true"
          >
            {[92, 74, 86, 61].map((width, i) => (
              <span
                key={i}
                style={{
                  display: "block",
                  height: 3,
                  width: `${width}%`,
                  background: "var(--color-line)",
                  borderRadius: 2,
                }}
              />
            ))}
          </div>
        </div>
      </Beat>

      {/* Beat 2 — parsed into coverage. */}
      <Beat index={1} label="2 · Parsed into coverage">
        <div className="matrix-wrap">
          <table className="matrix" style={{ minWidth: 0 }}>
            <thead>
              <tr>
                <th scope="col">Line</th>
                <th scope="col">Limit</th>
                <th scope="col">Expires</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>GL each occurrence</td>
                <td className="num" style={{ color: "var(--color-claim)" }}>
                  $500,000
                </td>
                <td className="num">Aug 20, 2026</td>
              </tr>
              <tr>
                <td>GL aggregate</td>
                <td className="num">$2,000,000</td>
                <td className="num">Aug 20, 2026</td>
              </tr>
              <tr>
                <td>Auto combined</td>
                <td className="num">$1,000,000</td>
                <td className="num">Aug 20, 2026</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Beat>

      {/* Beat 3 — the sentence. */}
      <Beat index={2} label="3 · One line fails, and says why">
        <p className="placard" data-tone="claim">
          Deficient
        </p>
        <p className="deficiency" style={{ marginTop: 6, animationDelay: `${2 * BEAT + 120}ms` }}>
          GL each occurrence $500,000 is below the required $1,000,000.
        </p>
      </Beat>

      {/* Beat 4 — chased, replaced, sealed. */}
      <Beat index={3} label="4 · Chased, then replaced">
        <div className="timeline-row" style={{ paddingTop: 0 }}>
          <span>Jul 21</span>
          <span className="timeline-verb">Renewal request — 30 days</span>
          <span>to vendor + agent</span>
        </div>
        <div className="timeline-row">
          <span>Aug 06</span>
          <span className="timeline-verb">Renewal request — 14 days</span>
          <span>to vendor + agent</span>
        </div>
        <div className="timeline-row">
          <span>Aug 11</span>
          <span className="timeline-verb">Replacement uploaded</span>
          <span>$1,000,000 / $2,000,000</span>
        </div>
        <div
          className="flex items-center"
          style={{ gap: 8, marginTop: 12, animationDelay: `${3 * BEAT + 240}ms` }}
        >
          <ComplianceSeal earned press size={24} />
          <span className="placard" data-tone="seal">
            Compliant through Aug 20, 2027
          </span>
        </div>
      </Beat>

      <figcaption className="t-secondary" style={{ marginTop: 16 }}>
        Demo data. Kestrel Roofing and Harbor Ridge Management are illustrative — CertShield is
        pre-launch and has no customers to quote.
      </figcaption>
    </figure>
  );
}
