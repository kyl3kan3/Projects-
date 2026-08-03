import type { ApplicationStatus } from "@/db/schema";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/statuses";

/**
 * The status pill from DESIGN.md: 28px tall, radius 8, a 6px dot and an 11px
 * label. Stop-work is the only bordered pill, because it is the only status that
 * means a crew is standing around.
 */
export function StatusPill({ status }: { status: ApplicationStatus }) {
  const tone = STATUS_TONE[status];
  return (
    <span className={`pill pill-${tone}`}>
      <span className="pill-dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export type CoverageTone = "curated" | "partial" | "requested";

const COVERAGE_LABEL: Record<CoverageTone, string> = {
  curated: "Curated",
  partial: "Partial",
  requested: "Requested",
};

/** Coverage honesty, on the jurisdiction index: a map, not a promise. */
export function CoveragePill({ coverage }: { coverage: CoverageTone }) {
  const tone = coverage === "curated" ? "issued" : coverage === "partial" ? "pending" : "neutral";
  return (
    <span className={`pill pill-${tone}`}>
      <span className="pill-dot" />
      {COVERAGE_LABEL[coverage]}
    </span>
  );
}
