/**
 * The coverage meter: 12 cells at 12px in a hairline track, ink at 85% for a complete
 * month, amber for partial, `#EDEAE0` for empty — per DESIGN.md, with a mono caption.
 *
 * A server component: it holds no state and reads no clock. The tooltip text is a
 * `title` plus visible prose below the track, because a hover tooltip on a phone is not
 * an affordance.
 */

import type { Coverage } from "@/lib/coverage";
import { shortMonth } from "@/lib/documents";

export function CoverageMeter({ coverage, year }: { coverage: Coverage; year: number }) {
  const noSources = coverage.sources.length === 0;
  const firstGap = coverage.months.find((m) => m.state !== "complete" && m.missing.length > 0);

  return (
    <section className="mt-6" aria-label="Data coverage">
      <div className="flex items-baseline justify-between">
        <h2 className="t-label">Data coverage · {year}</h2>
        <p className="t-data" style={{ color: "var(--color-fg-2)" }}>
          {coverage.monthsComplete} OF 12 MONTHS COMPLETE
        </p>
      </div>

      <div className="coverage-track mt-2" role="img" aria-label={ariaLabel(coverage)}>
        {coverage.months.map((m) => (
          <span
            key={m.key}
            className="coverage-cell"
            data-state={m.state}
            title={`${shortMonth(m.month - 1)} — ${m.present} of ${m.expected} sources`}
          />
        ))}
      </div>

      <div className="mt-2 flex justify-between">
        <span className="t-data" style={{ color: "var(--color-fg-2)" }}>
          {shortMonth(0)}
        </span>
        <span className="t-data" style={{ color: "var(--color-fg-2)" }}>
          {shortMonth(11)}
        </span>
      </div>

      {noSources ? (
        <p className="t-secondary mt-3" style={{ maxWidth: "48ch" }}>
          Nothing uploaded yet, so there is nothing to count. The meter fills as bills are
          accepted.
        </p>
      ) : (
        <p className="t-secondary mt-3" style={{ maxWidth: "52ch" }}>
          Counting the {coverage.sources.length}{" "}
          {coverage.sources.length === 1 ? "source" : "sources"} you have uploaded at least
          once. A month is complete when every one of them covers it.
          {firstGap
            ? ` ${shortMonth(firstGap.month - 1)} is still missing ${firstGap.missing[0]}.`
            : ""}
        </p>
      )}
    </section>
  );
}

function ariaLabel(coverage: Coverage): string {
  const complete = coverage.months.filter((m) => m.state === "complete").length;
  const partial = coverage.months.filter((m) => m.state === "partial").length;
  return `${complete} months complete, ${partial} partial, ${12 - complete - partial} with no data.`;
}
