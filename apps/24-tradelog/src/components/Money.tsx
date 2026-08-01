/**
 * Money, R-multiples, ratios and percentages, rendered to DESIGN.md's rules.
 *
 * The P/L colour law is enforced here rather than trusted to call sites:
 * `<Money>` colours by sign, and `<Stat>` will only paint a spark underline when
 * it is told the value is money. Win rate and profit factor go through `<Stat>`
 * with `money={false}` and come out in `text` — a green win rate is a build
 * failure.
 */

import { formatCents, formatPercent, formatR, formatRatio, type Cents } from "@/lib/money";

export function pnlClass(value: bigint | number): string {
  const n = typeof value === "bigint" ? value : BigInt(Math.round(value));
  if (n > 0n) return "v-profit";
  if (n < 0n) return "v-loss";
  return "";
}

export function Money({
  cents,
  signed = false,
  compact = false,
  colored = true,
  className = "",
}: {
  cents: Cents;
  signed?: boolean;
  compact?: boolean;
  colored?: boolean;
  className?: string;
}) {
  return (
    <span className={`t-mono ${colored ? pnlClass(cents) : ""} ${className}`.trim()}>
      {formatCents(cents, { signed, compact })}
    </span>
  );
}

export function RMultiple({ value, className = "" }: { value: bigint | null; className?: string }) {
  return (
    <span className={`t-mono ${value === null ? "" : pnlClass(value)} ${className}`.trim()}>
      {formatR(value)}
    </span>
  );
}

/** A dashboard stat: Label over a mono numeral, no box, hairlines between cells. */
export function Stat({
  label,
  value,
  /** Money gets a 24px spark underline in the P/L colour; ratios never do. */
  money,
  sparkFor,
  note,
}: {
  label: string;
  value: string;
  money?: boolean;
  sparkFor?: Cents;
  note?: string;
}) {
  const colour = money && sparkFor !== undefined ? pnlClass(sparkFor) : "";
  return (
    <div className="stat">
      <p className="t-label">{label}</p>
      <p className={`t-stat mt-2 ${colour}`}>{value}</p>
      {money && sparkFor !== undefined ? (
        <span
          className="spark"
          style={{
            background:
              sparkFor > 0n
                ? "var(--color-profit)"
                : sparkFor < 0n
                  ? "var(--color-loss)"
                  : "var(--color-hairline)",
          }}
        />
      ) : null}
      {note ? <p className="t-secondary mt-2">{note}</p> : null}
    </div>
  );
}

export const pct = (value: bigint | null) => formatPercent(value);
export const ratio = (value: bigint | null) => formatRatio(value);
