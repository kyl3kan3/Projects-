/**
 * Shared money and state components: the PAID seal, status pills, the hero stat,
 * the collected-of-expected track, household rows.
 *
 * All of these are server components — none of them need interactivity, and a
 * ledger that renders on the server is a ledger the phone shows instantly.
 */

import Link from "next/link";
import { IconChevronRight } from "@/components/icons";
import { formatMoney, splitMoney } from "@/lib/money";
import type { AgingBucket } from "@/lib/dues";
import type { InvoiceStatus, IssueStatus } from "@/db/schema";

/* ------------------------------------------------------------- the seal --- */

/**
 * The association's rubber stamp. `stamp` runs the signature animation, which is
 * only true for invoices that settled in the last few minutes — a page full of
 * stamping seals would be spectacle, and DESIGN.md caps it at three.
 */
export function PaidSeal({ stamp = false, label = "Paid" }: { stamp?: boolean; label?: string }) {
  return (
    <span className="seal" data-stamp={stamp ? "true" : undefined}>
      <svg className="seal-ring" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="10" r="9.25" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="m6.4 10.3 2.3 2.3 4.9-5.2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="seal-label">{label}</span>
    </span>
  );
}

/* ------------------------------------------------------------- the pills --- */

const INVOICE_PILL: Record<InvoiceStatus, { text: string; tone: string }> = {
  draft: { text: "Draft", tone: "pill-quiet" },
  sent: { text: "Due", tone: "pill-quiet" },
  processing: { text: "Processing", tone: "pill-warn" },
  partial: { text: "Part paid", tone: "pill-warn" },
  paid: { text: "Paid", tone: "pill-good" },
  overdue: { text: "Past due", tone: "pill-bad" },
  written_off: { text: "Written off", tone: "pill-quiet" },
};

export function InvoicePill({ status }: { status: InvoiceStatus }) {
  const pill = INVOICE_PILL[status];
  return <span className={`pill ${pill.tone}`}>{pill.text}</span>;
}

const ISSUE_PILL: Record<IssueStatus, { text: string; tone: string }> = {
  open: { text: "Open", tone: "pill-bad" },
  in_progress: { text: "In progress", tone: "pill-warn" },
  resolved: { text: "Resolved", tone: "pill-good" },
  closed: { text: "Closed", tone: "pill-quiet" },
};

export function IssuePill({ status }: { status: IssueStatus }) {
  const pill = ISSUE_PILL[status];
  return <span className={`pill ${pill.tone}`}>{pill.text}</span>;
}

export function Pill({ tone, children }: { tone: "good" | "warn" | "bad" | "quiet"; children: React.ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

/* --------------------------------------------------------------- amounts --- */

/** Every amount on every screen goes through here. Mono, tabular, two decimals. */
export function Money({ cents, className = "" }: { cents: number; className?: string }) {
  return <span className={`t-data ${className}`}>{formatMoney(cents)}</span>;
}

/** The hero stat: whole dollars large, cents at 60% (DESIGN.md's type table). */
export function HeroAmount({ cents }: { cents: number }) {
  const { whole, cents: rest, negative } = splitMoney(cents);
  return (
    <p className="t-stat">
      {negative ? "-" : ""}
      {whole}
      <span className="t-stat-cents">.{rest}</span>
    </p>
  );
}

/**
 * Collected of expected. Money in flight is amber, not green: an ACH debit that
 * has not cleared is not collected, and the track says so.
 */
export function CollectedTrack({
  collectedCents,
  processingCents,
  expectedCents,
}: {
  collectedCents: number;
  processingCents: number;
  expectedCents: number;
}) {
  const total = Math.max(expectedCents, 1);
  const collected = Math.min(100, (collectedCents / total) * 100);
  const processing = Math.min(100 - collected, (processingCents / total) * 100);
  return (
    <div className="track" role="presentation">
      <span data-part="collected" style={{ width: `${collected}%` }} />
      {processing > 0 ? <span data-part="processing" style={{ width: `${processing}%` }} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ rows --- */

export function AgingDot({ bucket, hasBalance }: { bucket: AgingBucket; hasBalance: boolean }) {
  if (!hasBalance) return <span className="dot dot-current" aria-hidden="true" />;
  return <span className={`dot dot-${bucket}`} aria-hidden="true" />;
}

/**
 * A household row. No boxes: a hairline-divided full-bleed row, ≥56px, entirely
 * tappable, with the balance right-aligned in mono.
 */
export function HouseholdRow({
  href,
  unitLabel,
  personLine,
  statusLine,
  amountCents,
  bucket,
  hasBalance,
  trailing,
}: {
  href: string;
  unitLabel: string;
  personLine: string;
  statusLine: string;
  amountCents: number;
  bucket: AgingBucket;
  hasBalance: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <Link href={href} className="row">
      <AgingDot bucket={bucket} hasBalance={hasBalance} />
      <span className="min-w-0 flex-1">
        <span className="t-title block truncate">{unitLabel}</span>
        <span className="t-secondary block truncate">
          {personLine}
          {statusLine ? ` · ${statusLine}` : ""}
        </span>
      </span>
      <span className="flex flex-none items-center gap-2">
        {trailing ?? <Money cents={amountCents} />}
        <IconChevronRight size={18} className="ink-3" />
      </span>
    </Link>
  );
}

/** Label + value, the shape every detail block uses. */
export function DataRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="t-secondary">{label}</span>
      <span className="t-data text-right">{children}</span>
    </div>
  );
}

/** A quiet framed note — used for plan gates and honest caveats. */
export function Notice({
  tone = "quiet",
  children,
}: {
  tone?: "quiet" | "warn" | "bad";
  children: React.ReactNode;
}) {
  const color =
    tone === "warn" ? "var(--color-amber)" : tone === "bad" ? "var(--color-red)" : "var(--color-ink-2)";
  return (
    <div className="panel p-4" style={{ borderLeft: `2px solid ${color}` }}>
      <div className="t-secondary" style={{ color: "var(--color-ink-2)" }}>
        {children}
      </div>
    </div>
  );
}
