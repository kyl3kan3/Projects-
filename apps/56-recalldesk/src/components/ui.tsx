/**
 * src/components/ui.tsx
 *
 * The small shared display pieces, built from globals.css's tokens: screen
 * headers, the money stat, status pills, empty states, and the consent glyph
 * cluster that appears at the end of every patient row.
 *
 * Server components (no "use client") and pure props — they import only from
 * `@/lib`, never from `@/server` or `@/db`.
 */

import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { money } from "@/lib/format";
import { bucketLabel, type OverdueBucket } from "@/lib/recall";

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
      <div>
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
 * The hero stat. Money is mono tabular, and cents render at 60% — DESIGN.md's
 * hero-stat role. Whole dollars only above $1,000, because a recovered-production
 * figure to the cent reads as a machine's number rather than a practice's.
 */
export function MoneyStat({ cents, hint }: { cents: number; hint?: string }) {
  return (
    <div>
      <p className="t-stat" style={{ margin: 0 }}>
        {money(cents)}
      </p>
      {hint && (
        <p className="t-secondary" style={{ margin: "4px 0 0" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

export type PillTone = "green" | "amber" | "red" | "aqua" | "quiet";

export function Pill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function BucketDot({ bucket }: { bucket: OverdueBucket }) {
  const tone =
    bucket === "m24_plus"
      ? "dot-red"
      : bucket === "m6_12" || bucket === "m12_24"
        ? "dot-amber"
        : "dot-quiet";
  return <span className={`dot ${tone}`} aria-hidden="true" />;
}

export function BucketBadge({ bucket }: { bucket: OverdueBucket }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <BucketDot bucket={bucket} />
      <span className="t-secondary">{bucketLabel(bucket)}</span>
    </span>
  );
}

/**
 * The consent cluster at the end of a patient row: an envelope and a message
 * bubble, each in ink-2 when reachable, red when suppressed, and ink-3 when there
 * is simply no address or number. Every state is also in the row's text — nothing
 * in RecallDesk is colour-only.
 */
export function ConsentGlyphs({
  patient,
}: {
  patient: {
    email: string | null;
    phone: string | null;
    emailConsent: boolean;
    smsConsent: boolean;
    emailOptedOutAt: Date | null;
    smsOptedOutAt: Date | null;
    emailBouncedAt: Date | null;
    phoneFailedAt: Date | null;
  };
}) {
  const emailState = !patient.email
    ? "none"
    : patient.emailOptedOutAt
      ? "opted_out"
      : patient.emailBouncedAt
        ? "bounced"
        : patient.emailConsent
          ? "ok"
          : "no_consent";
  const smsState = !patient.phone
    ? "none"
    : patient.smsOptedOutAt
      ? "opted_out"
      : patient.phoneFailedAt
        ? "bounced"
        : patient.smsConsent
          ? "ok"
          : "no_consent";

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <ConsentGlyph icon="mail" state={emailState} channel="Email" />
      <ConsentGlyph icon="message" state={smsState} channel="Text" />
    </span>
  );
}

type ConsentState = "ok" | "no_consent" | "bounced" | "opted_out" | "none";

function ConsentGlyph({
  icon,
  state,
  channel,
}: {
  icon: IconName;
  state: ConsentState;
  channel: string;
}) {
  const color =
    state === "ok"
      ? "var(--color-green)"
      : state === "opted_out" || state === "bounced"
        ? "var(--color-red)"
        : "var(--color-ink-3)";
  const label =
    state === "ok"
      ? `${channel}: reachable`
      : state === "opted_out"
        ? `${channel}: opted out`
        : state === "bounced"
          ? `${channel}: delivery failed`
          : state === "no_consent"
            ? `${channel}: no consent on file`
            : `${channel}: nothing on file`;

  return (
    <span
      title={label}
      style={{ color, display: "inline-flex", position: "relative", lineHeight: 0 }}
    >
      <Icon name={icon} size={16} />
      <span className="sr-only" style={srOnly}>
        {label}
      </span>
      {(state === "opted_out" || state === "bounced") && (
        <svg
          viewBox="0 0 20 20"
          width={16}
          height={16}
          style={{ position: "absolute", inset: 0 }}
          aria-hidden="true"
        >
          <path d="M3 17 17 3" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}

export const srOnly: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

/**
 * The empty state. Real content, never a grey box: a sentence that says what the
 * screen will hold and the one action that fills it.
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
      <span style={{ color: "var(--color-aqua)" }}>
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
  tone?: "aqua" | "quiet";
}) {
  return (
    <div>
      <p className="t-label" style={{ margin: 0 }}>
        {label}
      </p>
      <p
        className="t-mono"
        style={{
          margin: "2px 0 0",
          fontSize: "1.0625rem",
          color: tone === "aqua" ? "var(--color-aqua-text)" : "var(--color-ink)",
        }}
      >
        {value}
      </p>
    </div>
  );
}

/** A hairline-divided definition row, for receipts and settings summaries. */
export function DetailRow({ term, children }: { term: string; children: React.ReactNode }) {
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
      <span className="t-secondary">{term}</span>
      <span className="t-mono" style={{ textAlign: "right" }}>
        {children}
      </span>
    </div>
  );
}

export function Banner({
  tone,
  children,
}: {
  tone: "amber" | "red" | "aqua";
  children: React.ReactNode;
}) {
  const color =
    tone === "red"
      ? "var(--color-red)"
      : tone === "amber"
        ? "var(--color-amber-text)"
        : "var(--color-aqua-text)";
  return (
    <div
      role="status"
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "12px 0",
        borderTop: "1px solid var(--color-hairline)",
        borderBottom: "1px solid var(--color-hairline)",
        color,
      }}
    >
      <Icon name={tone === "aqua" ? "shield-line" : "alert"} size={18} style={{ flex: "none", marginTop: 2 }} />
      <p className="t-secondary" style={{ margin: 0, color }}>
        {children}
      </p>
    </div>
  );
}
