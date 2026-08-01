/**
 * The hero device: the machine visibly running.
 *
 * Four ladder rungs on one invoice, then the settle rule ruling it off — the
 * product's actual signature detail, at the product's actual copy. HTML and CSS
 * only, no canvas and no JavaScript, so the LCP is a paint and reduced motion
 * collapses it to a static, complete state.
 */

import { formatMoney } from "@/lib/money";
import { stepCopy } from "@/lib/tone";

const RUNGS = [
  { label: "DUE −3D", level: 1 as const, date: "16 JUN" },
  { label: "DUE +3D", level: 2 as const, date: "22 JUN" },
  { label: "DUE +10D", level: 3 as const, date: "29 JUN" },
  { label: "DUE +21D", level: 4 as const, date: "10 JUL" },
];

function firstLine(level: 1 | 2 | 3 | 4): string {
  const copy = stepCopy("warm", level);
  const body = copy.body[1] ?? copy.body[0];
  return body
    .replace(/\{\{invoice_number\}\}/g, "INV-2041")
    .replace(/\{\{amount\}\}/g, "$12,400.00")
    .replace(/\{\{due_date\}\}/g, "19 Jun 2026")
    .replace(/\{\{days_overdue\}\}/g, "21")
    .replace(/\{\{days_until_due\}\}/g, "3")
    .replace(/\{\{contact_first_name\}\}/g, "Dana")
    .replace(/\{\{portal_link\}\}/g, "paidwell.app/portal/…")
    .replace(/\{\{signature\}\}/g, "Ana Reyes");
}

export function HeroLadder() {
  return (
    <div className="panel" style={{ padding: 20, background: "var(--color-sheet)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div>
          <p className="t-label">Meridian Co</p>
          <p className="t-title" style={{ marginTop: 4 }}>
            INV-2041
          </p>
        </div>
        <p className="t-data" style={{ fontSize: 15 }}>
          {formatMoney(1_240_000)}
        </p>
      </div>

      <ol style={{ position: "relative", listStyle: "none", paddingLeft: 24, marginTop: 20 }}>
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 5,
            top: 8,
            bottom: 24,
            width: 1,
            background: "var(--color-hairline)",
          }}
        />
        {RUNGS.map((rung, index) => (
          <li
            key={rung.label}
            className="row-enter"
            style={{ position: "relative", paddingBottom: 16, animationDelay: `${index * 220}ms` }}
          >
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                left: -24,
                top: 4,
                width: 11,
                height: 11,
                borderRadius: 999,
                background: "var(--color-ink)",
              }}
            />
            <p className="t-label">
              STEP {index + 1} · {rung.label}
            </p>
            <p className="t-secondary" style={{ marginTop: 2, color: "var(--color-ink)" }}>
              {firstLine(rung.level).slice(0, 96)}…
            </p>
            <p className="t-data" style={{ marginTop: 2, color: "var(--color-text-aa)" }}>
              sent {rung.date}
            </p>
          </li>
        ))}
      </ol>

      {/* The settle rule: the invoice is ruled off. */}
      <div
        className="row-enter"
        style={{ position: "relative", paddingTop: 12, animationDelay: "1080ms" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <p className="t-title">Paid in full</p>
          <p className="t-data settle-stamp" style={{ animationDelay: "1200ms", fontSize: 14 }}>
            PAID · 12 JUL
          </p>
        </div>
        <span className="settle-rule" style={{ animationDelay: "1120ms" }} />
      </div>
    </div>
  );
}
