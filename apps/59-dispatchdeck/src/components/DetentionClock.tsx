"use client";

/**
 * The detention clock, ticking.
 *
 * Imports only `detention-clock.ts`, which is pure — nothing here can drag the
 * database client into the browser bundle. The figure it shows is the same
 * arithmetic the sweep uses server-side, so what the driver watches climb is
 * exactly what gets drafted onto the invoice.
 *
 * `prefers-reduced-motion` is respected by not animating anything: the digits
 * change, and that is the whole of it.
 */

import { useEffect, useState } from "react";
import { formatClockSpan, formatDuration } from "@/lib/format";
import { formatCents } from "@/lib/money";
import { detentionState, type DetentionConfig } from "@/lib/detention-clock";

export function DetentionClock({
  arrivedAt,
  departedAt,
  config,
  facility,
}: {
  arrivedAt: string;
  departedAt: string | null;
  config: DetentionConfig;
  facility: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (departedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [departedAt]);

  const state = detentionState({ arrivedAt, departedAt }, config, new Date(now));
  const amber = state.overdue;

  return (
    <section
      className="panel p-4 mt-4"
      style={amber ? { borderColor: "var(--accent)" } : undefined}
      aria-live="polite"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="t-placard">On the dock</p>
        <p className="t-placard" style={{ color: amber ? "var(--accent)" : "var(--fg-3)" }}>
          {amber ? "Detention running" : `${config.detentionFreeHours}h free`}
        </p>
      </div>

      <p
        className="t-figure mt-2"
        style={{ color: amber ? "var(--accent)" : "var(--fg)" }}
        suppressHydrationWarning
      >
        {formatClockSpan(state.elapsedMs)}
      </p>

      <p className="t-secondary mt-1">{facility}</p>

      {amber ? (
        <p className="t-mono-lg mt-3" style={{ color: "var(--accent)" }}>
          {formatDuration(state.overMs)} over · {state.billableHours}h billable ·{" "}
          {formatCents(state.accruedCents)}
        </p>
      ) : (
        <p className="t-secondary mt-3">
          Past {config.detentionFreeHours}h this drafts a detention line at{" "}
          {formatCents(config.detentionRateCents)}/hr with both timestamps as evidence. You confirm
          it before it ever reaches a broker.
        </p>
      )}
    </section>
  );
}
