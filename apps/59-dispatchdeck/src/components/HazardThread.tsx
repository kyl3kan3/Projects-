/**
 * HazardThread — the signature element.
 *
 * One continuous 2px hazard line down the left of the stop list, advancing past
 * each stop as timestamps stamp in. Booked at the top, delivered at the bottom.
 * The same component renders in the cab card, the load detail and the landing
 * device, because the thread IS the lifecycle.
 *
 * A server component: pure props, no state, no db. The only motion is the
 * 160ms height transition declared in globals.css, which
 * `prefers-reduced-motion` collapses to the final state.
 */

import { detentionState, type DetentionConfig } from "@/lib/detention-clock";
import { formatDuration, formatStamp } from "@/lib/format";
import { formatCents } from "@/lib/money";
import type { ThreadStop } from "@/lib/lifecycle";

export type { ThreadStop };

export interface HazardThreadProps {
  stops: ThreadStop[];
  /** 0..1 from lifecycle.threadPosition. */
  progress: number;
  timeZone: string;
  /** Draw the detention register inline at an overdue open stop. */
  detention?: DetentionConfig;
  /** Board rows get a tighter version with no windows or stamps. */
  compact?: boolean;
  /** Render the row that says the load is dispatched, above the first stop. */
  showDispatch?: boolean;
  dispatchedAt?: Date | string | null;
}

function nodeState(stop: ThreadStop): "done" | "here" | "ahead" {
  if (stop.departedAt) return "done";
  if (stop.arrivedAt) return "here";
  return "ahead";
}

export function HazardThread({
  stops,
  progress,
  timeZone,
  detention,
  compact = false,
  showDispatch = false,
  dispatchedAt = null,
}: HazardThreadProps) {
  if (stops.length === 0) {
    return (
      <p className="t-secondary">
        No stops on this load yet. Add a pickup and a delivery and the thread has something to run
        down.
      </p>
    );
  }

  return (
    <ol
      className="thread list-none m-0 p-0 pl-6"
      style={{ ["--thread-progress" as string]: String(Math.max(0, Math.min(1, progress))) }}
    >
      {showDispatch ? (
        <li className="thread-node pb-4" data-state={dispatchedAt ? "done" : "ahead"}>
          <p className="t-placard">Dispatched</p>
          {dispatchedAt ? (
            <p className="t-mono stamp" style={{ color: "var(--fg-2)" }}>
              {formatStamp(dispatchedAt, timeZone)}
            </p>
          ) : (
            <p className="t-secondary">Not started</p>
          )}
        </li>
      ) : null}

      {stops.map((stop, index) => {
        const state = nodeState(stop);
        const clock = detention ? detentionState(stop, detention) : null;
        const showClock = Boolean(clock && clock.overdue && stop.arrivedAt);
        return (
          <li
            key={stop.id}
            className={`thread-node ${index === stops.length - 1 ? "" : compact ? "pb-3" : "pb-6"}`}
            data-state={state}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="t-placard">
                {stop.kind === "pickup" ? "Pickup" : "Delivery"} {index + 1}
              </p>
              {!compact && stop.windowStart ? (
                <p className="t-mono" style={{ color: "var(--fg-3)" }}>
                  {formatStamp(stop.windowStart, timeZone)}
                  {stop.windowEnd ? `–${formatStamp(stop.windowEnd, timeZone).split(", ")[1]}` : ""}
                </p>
              ) : null}
            </div>

            <p className="t-title mt-1">{stop.facility?.trim() || `${stop.city}, ${stop.state}`}</p>
            <p className="t-mono" style={{ color: "var(--fg-2)" }}>
              {stop.city.toUpperCase()} {stop.state.toUpperCase()}
            </p>

            {!compact ? (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {stop.arrivedAt ? (
                  <p className="t-mono stamp" style={{ color: "var(--fg-2)" }}>
                    In {formatStamp(stop.arrivedAt, timeZone)}
                  </p>
                ) : null}
                {stop.departedAt ? (
                  <p className="t-mono stamp" style={{ color: "var(--fg-2)" }}>
                    Out {formatStamp(stop.departedAt, timeZone)}
                  </p>
                ) : null}
                {stop.arrivedAt && !stop.departedAt && clock && !clock.overdue ? (
                  <p className="t-mono" style={{ color: "var(--fg-3)" }}>
                    {formatDuration(clock.elapsedMs)} on the dock
                  </p>
                ) : null}
              </div>
            ) : null}

            {showClock && clock ? (
              /* The thread's emergency register: the only other amber on screen. */
              <p
                className="chip t-mono mt-2"
                style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
              >
                <span className="dot" style={{ background: "var(--accent)" }} />
                Detention {formatDuration(clock.overMs)} over · {clock.billableHours}h ·{" "}
                {formatCents(clock.accruedCents)}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
