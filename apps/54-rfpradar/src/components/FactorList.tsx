/**
 * FactorList — the reasons behind a score, rendered verbatim.
 *
 * "No score without reasons" is the product's central rule, so this component is
 * the only way a score reaches a screen. `assertHasReasons` throws rather than
 * render a bare number, which turns the rule into something a build can fail on
 * instead of a convention someone can forget.
 *
 * The expansion is a `<details>` element: the full list is one tap away with no
 * client JavaScript at all, it works with the keyboard for free, and it is in the
 * DOM for a screen reader whether or not it is open.
 */

import { assertHasReasons, topReasons, type ScoreFactor } from "@/lib/scoring";
import { Check, Cross } from "@/components/icons";

export function FactorRows({ factors }: { factors: ScoreFactor[] }) {
  return (
    <ul className="rows list-none p-0 m-0">
      {factors.map((factor, index) => (
        <li key={`${factor.key}-${index}`} className="flex gap-2 py-3">
          <span
            className="mt-[2px] shrink-0"
            style={{ color: factor.matched ? "var(--color-green-text)" : "var(--color-ink-3)" }}
          >
            {factor.matched ? <Check size={18} /> : <Cross size={18} />}
          </span>
          <span
            className="text-[0.8125rem] leading-[1.45]"
            style={{ color: factor.matched ? "var(--color-ink)" : "var(--color-ink-3)" }}
          >
            {factor.reason}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function FactorList({
  score,
  factors,
  visible = 2,
  animate = false,
}: {
  score: number;
  factors: ScoreFactor[];
  visible?: number;
  animate?: boolean;
}) {
  const checked = assertHasReasons(score, factors);
  const top = topReasons(checked, visible);
  const rest = checked.filter((factor) => !top.includes(factor));

  return (
    <div>
      <ul className="list-none p-0 m-0 flex flex-col gap-1">
        {top.map((factor, index) => (
          <li
            key={`${factor.key}-${index}`}
            className={`t-secondary ${animate ? "beat-reason" : ""}`}
            style={
              animate
                ? { animationDelay: `${240 + index * 40}ms`, color: "var(--color-ink-2)" }
                : undefined
            }
          >
            {factor.reason}
          </li>
        ))}
      </ul>

      {rest.length > 0 && (
        <details className="mt-2 group">
          <summary className="btn-quiet cursor-pointer list-none">
            <span className="group-open:hidden">+{rest.length} more</span>
            <span className="hidden group-open:inline">Hide reasons</span>
          </summary>
          <div className="mt-2 hair-t">
            <FactorRows factors={checked} />
          </div>
        </details>
      )}
    </div>
  );
}
