/**
 * DealLine — the signature element (DESIGN.md).
 *
 * One horizontal ruled line: date nodes as small squares (met = filled cedar,
 * upcoming = outlined ink, at-risk within 3 days = keybox), the today marker as
 * a thin keybox vertical, labels beneath in mono. Preview mode ghosts the moving
 * nodes at 40% with connector arrows — the diff drawn, not just listed.
 *
 * Rendered in the pipeline, the deal file, the portal miniature, and the landing
 * device. A server component: it takes data and does arithmetic, nothing else.
 *
 * The scale is linear in days across the span of the dates plus today, with a
 * small inset at each end so a node never sits on the rule's edge. Labels that
 * would collide stack into lanes (see `assignLanes`) rather than overlapping,
 * and the element grows to fit however many lanes that takes.
 */

import { daysBetween, formatShort, type DisplayDateStatus } from "@/lib/dates";

export interface DealLineDate {
  key: string;
  label: string;
  dueOn: string;
  status: DisplayDateStatus;
  /** Where this node is about to move to, for the diff preview. */
  previewDueOn?: string | null;
}

export interface DealLineProps {
  dates: readonly DealLineDate[];
  today: string;
  /** No labels, shorter rule — the pipeline's stacked wall. */
  compact?: boolean;
  /** Run the unfurl on mount. On by default for the full line. */
  unfurl?: boolean;
  /** Width in px of the drawn area. The caller decides whether it scrolls. */
  width?: number;
  /** Short caption under the rule when there is nothing to draw. */
  emptyNote?: string;
}

const INSET = 44;
/** Label box width; two labels closer than this would overlap. */
const LABEL_W = 80;
/**
 * Lane height. A sub-label like "Loan application" wraps to two lines at 80px,
 * so a 30px lane let a wrapped label run into the lane below it — visible only
 * in a screenshot of the real console, not in the CSS.
 */
const LANE_H = 46;
const MAX_LANES = 3;

/**
 * Stack colliding labels into lanes instead of letting them overlap.
 *
 * A residential file routinely has three deadlines inside four days — the
 * inspection window, the HOA docs and the objection date — and a fixed
 * alternating two-row layout still ran them into each other. Each label takes
 * the first lane whose last box ends before this one starts.
 */
function assignLanes(centres: readonly number[]): number[] {
  const lastRight: number[] = [];
  return centres.map((x) => {
    const left = x - LABEL_W / 2;
    for (let lane = 0; lane < MAX_LANES; lane += 1) {
      if (lastRight[lane] === undefined || left >= lastRight[lane]) {
        lastRight[lane] = x + LABEL_W / 2 + 4;
        return lane;
      }
    }
    // Everything is full: reuse the last lane rather than dropping the label.
    lastRight[MAX_LANES - 1] = x + LABEL_W / 2 + 4;
    return MAX_LANES - 1;
  });
}

export function DealLine({
  dates,
  today,
  compact = false,
  unfurl = !compact,
  width,
  emptyNote = "No computed dates yet.",
}: DealLineProps) {
  const rulesY = compact ? 17 : 34;
  const drawWidth = width ?? (compact ? 320 : 880);

  if (dates.length === 0) {
    return (
      <div className="dealline" style={{ ["--dealline-h" as string]: `${compact ? 34 : 72}px` }}>
        <div className="dealline-rule" style={{ ["--dealline-y" as string]: `${rulesY}px` }} />
        <p className="t-secondary absolute left-0" style={{ top: rulesY + 12 }}>
          {emptyNote}
        </p>
      </div>
    );
  }

  // The span covers every date, every preview position, and today, so the
  // marker is always on the rule rather than clipped off one end.
  const stops = [
    today,
    ...dates.map((d) => d.dueOn),
    ...dates.map((d) => d.previewDueOn).filter((d): d is string => Boolean(d)),
  ].sort();
  const first = stops[0];
  const last = stops[stops.length - 1];
  const span = Math.max(1, daysBetween(first, last));
  const usable = drawWidth - INSET * 2;
  const x = (iso: string) => INSET + (daysBetween(first, iso) / span) * usable;

  const sorted = [...dates].sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const lanes = compact
    ? sorted.map(() => 0)
    : assignLanes(sorted.map((d) => x(d.previewDueOn ?? d.dueOn)));
  const laneCount = compact ? 0 : Math.max(...lanes, 0) + 1;
  const height = compact ? 34 : rulesY + 12 + laneCount * LANE_H + 8;

  return (
    <div
      className="dealline"
      data-unfurl={unfurl ? "true" : "false"}
      style={{
        ["--dealline-h" as string]: `${height}px`,
        ["--dealline-y" as string]: `${rulesY}px`,
        width: drawWidth,
      }}
    >
      <div className="dealline-rule" />

      {/* The connector runs from the ghost to the new position. */}
      {sorted.map((d) =>
        d.previewDueOn && d.previewDueOn !== d.dueOn ? (
          <span
            key={`c-${d.key}`}
            className="dealline-connector"
            data-back={d.previewDueOn < d.dueOn ? "true" : "false"}
            style={{
              left: Math.min(x(d.dueOn), x(d.previewDueOn)),
              width: Math.abs(x(d.previewDueOn) - x(d.dueOn)),
            }}
          />
        ) : null,
      )}

      {/* The ghost: where the node is now, before the recompute is applied. */}
      {sorted.map((d) =>
        d.previewDueOn && d.previewDueOn !== d.dueOn ? (
          <span
            key={`g-${d.key}`}
            className="dealline-node"
            data-ghost="true"
            style={{ left: x(d.dueOn) }}
            title={`${d.label} — currently ${formatShort(d.dueOn)}`}
          />
        ) : null,
      )}

      {sorted.map((d, i) => {
        const at = d.previewDueOn ?? d.dueOn;
        return (
          <span
            key={d.key}
            className="dealline-node"
            data-status={d.status}
            style={{ left: x(at), ["--i" as string]: i }}
            title={`${d.label} — ${formatShort(at)}`}
          />
        );
      })}

      <span className="dealline-today" style={{ left: x(today) }} aria-hidden="true" />
      {!compact ? (
        <span className="dealline-today-cap" style={{ left: x(today) }}>
          TODAY
        </span>
      ) : null}

      {!compact
        ? sorted.map((d, i) => {
            const at = d.previewDueOn ?? d.dueOn;
            const drop = lanes[i] * LANE_H;
            return (
              <span
                key={`l-${d.key}`}
                className="dealline-label"
                style={{ left: x(at), top: rulesY + 12 + drop, ["--i" as string]: i }}
              >
                {formatShort(at)}
                <span className="dealline-label-sub">{shorten(d.label)}</span>
              </span>
            );
          })
        : null}
    </div>
  );
}

/** Node labels are two short words at most; the full label is on the row. */
function shorten(label: string): string {
  const cleaned = label
    .replace(/ deadline$/i, "")
    .replace(/ delivered$/i, "")
    .replace(/ received$/i, "")
    .replace(/ submitted$/i, "")
    .replace(/ completed$/i, "");
  return cleaned.length > 22 ? `${cleaned.slice(0, 21)}…` : cleaned;
}
