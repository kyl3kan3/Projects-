/**
 * src/components/ui.tsx
 *
 * The shared display pieces, built from `globals.css`'s tokens: screen headers, the
 * protected-money stat, status pills, ledger lines, empty states.
 *
 * Server components with pure props. They import only from `@/lib` and `@/components`,
 * never from `@/server` or `@/db`, so no part of the database client can reach the
 * browser bundle through them.
 */

import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { money, moneyParts } from "@/lib/format";
import {
  feeTotalCents,
  ledgerKindLabel,
  type LedgerRow,
} from "@/lib/ledger";
import { formatDayShort } from "@/lib/dates";
import type { DerivedState, StateTone } from "@/lib/appointments";
import { stateLabel, stateTone } from "@/lib/appointments";

export function ScreenHeader({
  label,
  title,
  action,
}: {
  label: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 16,
        paddingTop: 24,
        paddingBottom: 16,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p className="t-label" style={{ margin: 0 }}>
          {label}
        </p>
        <h1 className="t-h2" style={{ margin: "4px 0 0" }}>
          {title}
        </h1>
      </div>
      {action}
    </header>
  );
}

/**
 * The hero stat: money kept because the policy existed.
 *
 * Mono tabular with the cents at 60%, per DESIGN.md's hero-stat role. `settle` gives it
 * beat four of the signature when the page arrives after a fee resolves.
 */
export function ProtectedStat({
  cents,
  hint,
  settle,
}: {
  cents: number;
  hint: string;
  settle?: boolean;
}) {
  const parts = moneyParts(cents);
  return (
    <div>
      <p className={`t-stat${settle ? " counter-settle" : ""}`} style={{ margin: 0 }}>
        {parts.whole}
        <span className="t-cents">{parts.fraction}</span>
      </p>
      <p className="t-secondary" style={{ margin: "4px 0 0" }}>
        {hint}
      </p>
    </div>
  );
}

export type PillTone = "green" | "amber" | "red" | "cobalt" | "quiet";

export function Pill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

const TONE_TO_PILL: Record<StateTone, PillTone> = {
  green: "green",
  amber: "amber",
  red: "red",
  cobalt: "cobalt",
  quiet: "quiet",
};

export function StatePill({ state }: { state: DerivedState }) {
  return <Pill tone={TONE_TO_PILL[stateTone(state)]}>{stateLabel(state)}</Pill>;
}

/** The card-on-file mark: the one place cobalt appears in a list row. */
export function CardOnFile({ last4 }: { last4: string | null }) {
  return (
    <span
      style={{ color: "var(--color-cobalt)", display: "inline-flex", alignItems: "center", gap: 4 }}
      title={last4 ? `Card on file ending ${last4}` : "Card on file"}
    >
      <Icon name="shield-card" size={18} />
      <span className="sr-only">{last4 ? `Card on file ending ${last4}` : "Card on file"}</span>
    </span>
  );
}

/**
 * One ledger row.
 *
 * DESIGN.md is exact about this: one mono line, hairline above, kind + policy reference +
 * signed amount, the amount in cobalt. A waived amount is struck through and labelled
 * rather than removed.
 */
export function LedgerLine({ row, land }: { row: LedgerRow; land?: boolean }) {
  const waived = row.status === "waived";
  const failed = row.status === "failed" || row.status === "disputed";
  const shownAmount = waived
    ? feeTotalCents(row)
    : row.kind === "refund"
      ? -row.amountCents
      : row.amountCents;

  return (
    <div className={`ledger-line${land ? " ledger-land" : ""}`}>
      <span style={{ minWidth: 0 }}>
        {ledgerKindLabel(row.kind)}
        {row.depositAppliedCents > 0 && row.kind !== "deposit"
          ? ` · deposit kept ${money(row.depositAppliedCents)}`
          : ""}
        {" · "}
        <span style={{ color: "var(--color-ink-2)" }}>
          per policy agreed {formatDayShort(row.policyAgreedOn)}
        </span>
      </span>
      <span
        className={`ledger-amount${waived ? " ledger-amount-waived" : ""}`}
        style={failed ? { color: "var(--color-red)" } : undefined}
      >
        {shownAmount >= 0 && !waived && !failed ? "+" : ""}
        {money(Math.abs(shownAmount))}
        {waived ? " waived" : failed ? " declined" : ""}
      </span>
    </div>
  );
}

/**
 * The empty state. Real content, never a grey box: a sentence saying what will be here
 * and the one action that fills it.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div
      className="card"
      style={{ padding: 24, display: "grid", gap: 8, justifyItems: "start", marginTop: 8 }}
    >
      <span style={{ color: "var(--color-cobalt)" }}>
        <Icon name={icon} size={22} />
      </span>
      <p className="t-title" style={{ margin: 0 }}>
        {title}
      </p>
      <p className="t-secondary" style={{ margin: 0, maxWidth: "48ch" }}>
        {body}
      </p>
      {action && (
        <Link href={action.href} className="btn btn-secondary" style={{ marginTop: 8 }}>
          {action.label}
          <Icon name="chevron-right" size={18} />
        </Link>
      )}
    </div>
  );
}

/** A labelled figure — mono value, uppercase label. Used in stat rows. */
export function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "cobalt" | "quiet" | "red" | "green";
}) {
  const color =
    tone === "cobalt"
      ? "var(--color-cobalt)"
      : tone === "red"
        ? "var(--color-red)"
        : tone === "green"
          ? "var(--color-green)"
          : "var(--color-ink)";
  return (
    <div>
      <p className="t-label" style={{ margin: 0 }}>
        {label}
      </p>
      <p className="t-mono" style={{ margin: "2px 0 0", fontSize: "1.0625rem", color }}>
        {value}
      </p>
    </div>
  );
}

/** A hairline-divided definition row, for receipts and fee arithmetic. */
export function DetailRow({
  term,
  children,
  strong,
}: {
  term: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        padding: "8px 0",
        borderBottom: "1px solid var(--color-hairline)",
      }}
    >
      <span className="t-secondary" style={strong ? { color: "var(--color-ink)" } : undefined}>
        {term}
      </span>
      <span
        className="t-mono"
        style={{ textAlign: "right", fontWeight: strong ? 700 : 500 }}
      >
        {children}
      </span>
    </div>
  );
}

export function Banner({
  tone,
  children,
}: {
  tone: "amber" | "red" | "cobalt";
  children: React.ReactNode;
}) {
  const color =
    tone === "red"
      ? "var(--color-red)"
      : tone === "amber"
        ? "var(--color-amber-text)"
        : "var(--color-cobalt)";
  return (
    <div
      role="status"
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        padding: "12px 0",
        borderTop: "1px solid var(--color-hairline)",
        borderBottom: "1px solid var(--color-hairline)",
        color,
      }}
    >
      <Icon
        name={tone === "cobalt" ? "shield-card" : "alert"}
        size={18}
        style={{ flex: "none", marginTop: 2 }}
      />
      <p className="t-secondary" style={{ margin: 0, color }}>
        {children}
      </p>
    </div>
  );
}

/** A form error, echoed back above the fields that produced it. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="t-secondary"
      style={{ color: "var(--color-red)", margin: "0 0 8px" }}
    >
      {message}
    </p>
  );
}
