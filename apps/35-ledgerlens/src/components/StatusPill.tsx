/**
 * The status pill: a 6px dot plus an 11px uppercase label, per DESIGN.md.
 *
 * A server component with no motion of its own. Every status the product can be in is
 * spelled out in words here, which is what makes the animated states in the inbox
 * non-load-bearing: an operator who cannot see the settle rule still reads
 * "CONFIRMED".
 */

import { STATUS_COPY, type DisplayStatus } from "@/lib/documents";

const STYLES: Record<DisplayStatus, { color: string; dot: string }> = {
  queued: { color: "var(--color-fg-2)", dot: "var(--color-fg-3)" },
  parked: { color: "var(--color-flag)", dot: "var(--color-flag)" },
  extracting: { color: "var(--color-fg-2)", dot: "var(--color-fg-3)" },
  needs_review: { color: "var(--color-flag)", dot: "var(--color-flag)" },
  confirmed: { color: "var(--color-ledger)", dot: "var(--color-ledger)" },
  rejected: { color: "var(--color-red)", dot: "var(--color-red)" },
  duplicate: { color: "var(--color-red)", dot: "var(--color-red)" },
};

export function StatusPill({ status }: { status: DisplayStatus }) {
  const style = STYLES[status];
  return (
    <span className="pill" style={{ color: style.color }}>
      <span
        aria-hidden="true"
        style={
          status === "confirmed"
            ? { width: 6, height: 1.5, background: style.dot }
            : { width: 6, height: 6, borderRadius: 999, background: style.dot }
        }
      />
      {STATUS_COPY[status]}
    </span>
  );
}

export function statusColor(status: DisplayStatus): string {
  return STYLES[status].color;
}

/**
 * A *period* is not a document, so it gets its own pill rather than borrowing
 * "CONFIRMED"/"QUEUED" from the document vocabulary — an accountant reading "QUEUED"
 * against July would reasonably wonder what is queued.
 */
export function PeriodPill({ status }: { status: "closed" | "closing" | "open" }) {
  const color = status === "closed" ? "var(--color-ledger)" : "var(--color-fg-2)";
  const label = status === "closed" ? "CLOSED" : status === "closing" ? "BUILDING" : "OPEN";
  return (
    <span className="pill" style={{ color }}>
      <span
        aria-hidden="true"
        style={
          status === "closed"
            ? { width: 6, height: 1.5, background: color }
            : { width: 6, height: 6, borderRadius: 999, background: "var(--color-fg-3)" }
        }
      />
      {label}
    </span>
  );
}
