"use client";

import { useEffect, useState } from "react";
import { formatUsd } from "@/lib/money";
import { stampUtc } from "@/lib/dates";

/**
 * "$127 SINCE TUE 14:00" — the running cost of an open anomaly.
 *
 * It ticks from the rate, not from a stored total, so it is correct the moment
 * the page loads and stays correct while the tab is open. Under
 * `prefers-reduced-motion` the value steps once a minute instead of once a
 * second: DESIGN.md's fallback rule is "counter → stepwise", not "counter off".
 */
export function LiveCounter({
  startedAtIso,
  deltaPerDayMicros,
}: {
  startedAtIso: string;
  deltaPerDayMicros: number;
}) {
  const startedAt = new Date(startedAtIso);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const interval = window.setInterval(() => setNow(Date.now()), reduced ? 60_000 : 1_000);
    return () => window.clearInterval(interval);
  }, []);

  const hours = Math.max(0, (now - startedAt.getTime()) / 3_600_000);
  const micros = Math.round((deltaPerDayMicros / 24) * hours);

  return (
    <p className="t-data" style={{ color: "var(--color-amber)", margin: 0 }}>
      <span aria-live="off">{formatUsd(micros)}</span> SINCE{" "}
      {stampUtc(startedAt).toUpperCase()}
    </p>
  );
}
