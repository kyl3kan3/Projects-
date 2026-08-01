/**
 * Presentational pieces shared across screens.
 *
 * Deliberately pure: no database import, no server-only module, so a client
 * component can import any of these without dragging `postgres` into the browser
 * bundle. Anything that needs data takes it as a prop.
 */

import { IconCheck, IconPennant } from "@/components/icons";
import { conflictLabel } from "@/lib/conflicts";
import type { ConflictKind, ConflictSeverity } from "@/db/schema";
import { formatMoney } from "@/lib/money";
import { stateLabel, type PaymentState } from "@/lib/ledger";

export function ScreenTitle({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 pt-6 pb-4">
      <div>
        {eyebrow ? <p className="t-label">{eyebrow}</p> : null}
        <h1 className="t-h2 mt-1">{title}</h1>
      </div>
      {action}
    </header>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <p className="t-label">{children}</p>;
}

/** A section head: Label with generous space above it, never a boxed header. */
export function SectionHead({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 pt-8 pb-2">
      <p className="t-label">{children}</p>
      {right}
    </div>
  );
}

export function Money({ cents, className = "" }: { cents: number; className?: string }) {
  return <span className={`t-data ${className}`}>{formatMoney(cents)}</span>;
}

export function StatePill({ state }: { state: PaymentState }) {
  const tone =
    state === "paid"
      ? "pill-good"
      : state === "unpaid"
        ? "pill-bad"
        : state === "canceled"
          ? "pill-quiet"
          : "pill-warn";
  return <span className={`pill ${tone}`}>{stateLabel(state)}</span>;
}

/**
 * The registration progress block: Label over a mono count, a 4px hairline track
 * filled turf, and an amber tail segment for waitlist overflow.
 */
export function RegistrationProgress({
  registered,
  capacity,
  waitlisted,
}: {
  registered: number;
  capacity: number;
  waitlisted: number;
}) {
  const filledPct = capacity > 0 ? Math.min(100, (registered / capacity) * 100) : 0;
  const waitPct =
    capacity > 0 ? Math.min(100 - filledPct, (waitlisted / Math.max(capacity, 1)) * 100) : 0;
  return (
    <div>
      <p className="t-label">Registered</p>
      <p className="t-stat mt-1" style={{ color: "var(--color-chalk)" }}>
        {registered} <span style={{ color: "var(--fg-3)" }}>/</span> {capacity}
      </p>
      <div className="track mt-3" role="img" aria-label={`${registered} of ${capacity} places filled`}>
        <span data-part="filled" style={{ width: `${filledPct}%` }} />
        {waitPct > 0 ? <span data-part="waitlist" style={{ width: `${waitPct}%` }} /> : null}
      </div>
      {waitlisted > 0 ? (
        <p className="t-data mt-2" style={{ color: "var(--warn)" }}>
          +{waitlisted} WAITLIST
        </p>
      ) : null}
    </div>
  );
}

/**
 * The conflict pennant chip. `clear` renders the check instead of the pennant —
 * the reduced-motion end state of the signature animation, and the honest one
 * when there is nothing wrong.
 */
export function PennantChip({
  severity,
  kind,
  clearing = false,
}: {
  severity: ConflictSeverity | "clear";
  kind?: ConflictKind;
  clearing?: boolean;
}) {
  if (severity === "clear") {
    return (
      <span className="pennant" data-severity="clear">
        <IconCheck size={14} />
        All clear
      </span>
    );
  }
  return (
    <span
      className={`pennant ${clearing ? "pennant-clearing" : ""}`}
      data-severity={severity}
    >
      <IconPennant size={14} />
      {kind ? conflictLabel(kind) : severity === "hard" ? "HARD" : "SOFT"}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="py-8">
      <p className="t-title">{title}</p>
      <p className="t-secondary mt-2 max-w-[46ch]">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** A hairline row of label + mono value — the "needs attention" list shape. */
export function StatRow({
  label,
  value,
  tone = "default",
  href,
}: {
  label: string;
  value: string;
  tone?: "default" | "warn" | "bad" | "good";
  href?: string;
}) {
  const color =
    tone === "bad"
      ? "var(--bad)"
      : tone === "warn"
        ? "var(--warn)"
        : tone === "good"
          ? "var(--accent)"
          : "var(--fg)";
  const inner = (
    <>
      <span className="t-title flex-1" style={{ color }}>
        {label}
      </span>
      <span className="t-data" style={{ color: "var(--fg-2)" }}>
        {value}
      </span>
    </>
  );
  if (href) {
    return (
      <a href={href} className="row">
        {inner}
      </a>
    );
  }
  return <div className="row">{inner}</div>;
}
