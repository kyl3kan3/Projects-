/**
 * PacketCheck — the bounce-killer, rendered.
 *
 * Before "Build packet": one row per rule, each with its state. A failing row
 * names the fix in the driver's own terms ("No POD yet — photograph the signed
 * BOL from the cab"), because "incomplete" is not an instruction. A passing row
 * shows its receipt: the filename, the amount, the delivery date.
 *
 * Hairline-divided rows, not a stack of boxes (DESIGN_LANGUAGE rule 4).
 */

import { AlertIcon, CheckIcon } from "@/components/icons";
import type { CompletenessCheck } from "@/lib/packets";

export interface PacketCheckProps {
  checks: CompletenessCheck[];
}

export function PacketCheck({ checks }: PacketCheckProps) {
  return (
    <ul className="list-none m-0 p-0">
      {checks.map((check, index) => (
        <li
          key={check.label}
          className={`flex gap-3 py-3 ${index === 0 ? "" : "rule-t"}`}
        >
          <span
            className="flex-none mt-px"
            style={{ color: check.ok ? "var(--good)" : "var(--accent)" }}
          >
            {check.ok ? <CheckIcon size={16} /> : <AlertIcon size={16} />}
          </span>
          <div className="min-w-0">
            <p className="t-body" style={{ fontSize: "0.9375rem" }}>
              {check.label}
            </p>
            {check.ok ? (
              check.detail ? (
                <p className="t-mono truncate" style={{ color: "var(--fg-3)" }}>
                  {check.detail}
                </p>
              ) : null
            ) : (
              <p className="t-secondary" style={{ color: "var(--fg-2)" }}>
                {check.fix}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
