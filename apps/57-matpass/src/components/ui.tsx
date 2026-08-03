/**
 * Presentational pieces shared across screens.
 *
 * Deliberately pure: no database import and no server-only module, so a client
 * component can use any of these without pulling `postgres` into the browser
 * bundle. Anything that needs data takes it as a prop.
 */

import Link from "next/link";
import { IconChevronRight, IconWarning } from "@/components/icons";
import { requirementMath } from "@/lib/belt";
import { formatMoney } from "@/lib/plans";

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
    <header className="flex items-start justify-between gap-4" style={{ paddingTop: 24, paddingBottom: 16 }}>
      <div>
        {eyebrow ? <p className="t-label">{eyebrow}</p> : null}
        <h1 className="t-h2" style={{ marginTop: eyebrow ? 4 : 0 }}>
          {title}
        </h1>
      </div>
      {action}
    </header>
  );
}

/** A section head: a label with space above it, never a boxed header. */
export function SectionHead({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-3"
      style={{ paddingTop: 32, paddingBottom: 8 }}
    >
      <p className="t-label">{children}</p>
      {right}
    </div>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <p className="t-label">{children}</p>;
}

export function Money({ cents }: { cents: number }) {
  return <span className="t-data">{formatMoney(cents)}</span>;
}

export type PillTone = "eligible" | "warn" | "ok" | "alarm" | "quiet";

export function Pill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

/** The requirement math, always mono: met figures in ink, deltas in amber. */
export function RequirementMath({
  eligibility,
}: {
  eligibility: {
    classesDone: number;
    classesRequired: number;
    daysDone: number;
    daysRequired: number;
    signoffRequired: boolean;
    signoffDone: boolean;
    missing: string[];
  };
}) {
  return (
    <div>
      <p className="t-data fg-2">{requirementMath(eligibility)}</p>
      {eligibility.missing.length > 0 ? (
        <p className="t-data amber" style={{ marginTop: 4 }}>
          {eligibility.missing.join(" · ")}
        </p>
      ) : (
        <p className="t-data crimson" style={{ marginTop: 4 }}>
          requirements met
        </p>
      )}
    </div>
  );
}

/**
 * An empty state that says something true and offers the next move. No grey
 * placeholder bars, and no emoji — DESIGN_LANGUAGE rules 1 and 8.
 */
export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ paddingTop: 40, paddingBottom: 40, maxWidth: "48ch" }}>
      <p className="t-title">{title}</p>
      <p className="t-secondary" style={{ marginTop: 8 }}>
        {body}
      </p>
      {action ? <div style={{ marginTop: 20 }}>{action}</div> : null}
    </div>
  );
}

/** A quiet inline notice — the plan-limit nudge, the simulated-Stripe warning. */
export function Notice({
  tone = "quiet",
  children,
}: {
  tone?: "quiet" | "warn" | "alarm";
  children: React.ReactNode;
}) {
  const color = tone === "warn" ? "var(--warn)" : tone === "alarm" ? "var(--alarm)" : "var(--fg-2)";
  return (
    <div
      className="card"
      style={{ padding: 16, display: "flex", gap: 12, alignItems: "flex-start" }}
      role={tone === "quiet" ? undefined : "alert"}
    >
      <span style={{ color, flex: "none", marginTop: 1 }}>
        <IconWarning size={18} />
      </span>
      <div className="t-secondary" style={{ color: "var(--fg)" }}>
        {children}
      </div>
    </div>
  );
}

/** A hairline row that navigates. The whole row is the target. */
export function LinkRow({
  href,
  title,
  secondary,
  right,
}: {
  href: string;
  title: string;
  secondary?: string;
  right?: React.ReactNode;
}) {
  return (
    <Link href={href} className="row">
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="t-title">{title}</p>
        {secondary ? (
          <p className="t-secondary" style={{ marginTop: 2 }}>
            {secondary}
          </p>
        ) : null}
      </div>
      {right}
      <span className="fg-3" style={{ flex: "none" }}>
        <IconChevronRight size={18} />
      </span>
    </Link>
  );
}

/** The 12-week attendance sparkline. Bars, not a canvas — mobile LCP matters. */
export function Sparkline({ weeks }: { weeks: number[] }) {
  const peak = Math.max(1, ...weeks);
  return (
    <div
      className="spark"
      role="img"
      aria-label={`Attendance over the last 12 weeks: ${weeks.join(", ")} check-ins per week`}
    >
      {weeks.map((n, i) => (
        <span
          key={i}
          data-recent={i >= weeks.length - 3 ? "true" : undefined}
          data-zero={n === 0 ? "true" : undefined}
          style={{ height: `${Math.max(6, (n / peak) * 100)}%` }}
        />
      ))}
    </div>
  );
}

export function Stat({
  value,
  label,
  secondary,
  tick,
}: {
  value: string | number;
  label: string;
  secondary?: string;
  tick?: boolean;
}) {
  return (
    <div>
      <p className="t-label">{label}</p>
      <p className="t-stat" style={{ marginTop: 4 }}>
        <span className={tick ? "tick" : undefined}>{value}</span>
      </p>
      {secondary ? (
        <p className="t-secondary" style={{ marginTop: 4 }}>
          {secondary}
        </p>
      ) : null}
    </div>
  );
}

export function billingPill(state: "paid" | "past_due" | "paused" | "none"): {
  tone: PillTone;
  label: string;
} | null {
  switch (state) {
    case "past_due":
      return { tone: "warn", label: "Past due" };
    case "paused":
      return { tone: "warn", label: "Paused" };
    case "paid":
      return { tone: "ok", label: "Paid" };
    default:
      return null;
  }
}
