/**
 * Money, typeset. Mono, tabular, right-aligned in rows — always.
 *
 * The hero variant splits the currency mark and the cents so the running total
 * reads the way DESIGN.md specifies: hi-vis `$`, full-size dollars, cents at 60%.
 * It is a server component and imports nothing but the formatter, so it can be
 * used inside client components without pulling the database client into the
 * browser bundle.
 */

import { formatMoney } from "@/lib/money";

export function Amount({
  cents,
  className,
  style,
}: {
  cents: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={`t-data ${className ?? ""}`} style={style}>
      {formatMoney(cents)}
    </span>
  );
}

/** The running total: "$" in hi-vis, dollars full size, cents at 60%. */
export function HeroAmount({
  cents,
  /** Set while the total is still ticking upward, for the odometer roll. */
  rolling = false,
  ariaLabel,
}: {
  cents: number;
  rolling?: boolean;
  ariaLabel?: string;
}) {
  const formatted = formatMoney(cents);
  const [dollars, decimals] = formatted.replace("$", "").split(".");
  return (
    <p className="t-stat" aria-label={ariaLabel ?? formatted}>
      <span className="currency">$</span>
      <span className={rolling ? "odometer" : undefined}>{dollars}</span>
      <span className="cents">.{decimals}</span>
    </p>
  );
}
