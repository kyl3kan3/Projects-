"use client";

/**
 * "Every stat odometers once on first view, then never again that session."
 *
 * The final value is what the server rendered, so the number is correct and
 * readable with JavaScript disabled and for a screen reader. The count-up is a
 * decoration layered on afterwards, remembered per session in `sessionStorage`
 * so navigating back to the dashboard does not replay it.
 *
 * `prefers-reduced-motion` skips straight to the value.
 */

import { useEffect, useRef, useState } from "react";
import { formatCents, formatPercent, formatRatio } from "@/lib/money";

export type OdometerKind = "money" | "money-compact" | "percent" | "ratio";

const DURATION_MS = 320; // dur-emphasis

function format(kind: OdometerKind, value: number): string {
  const rounded = BigInt(Math.round(value));
  switch (kind) {
    case "money":
      return formatCents(rounded);
    case "money-compact":
      return formatCents(rounded, { compact: true });
    case "percent":
      return formatPercent(rounded);
    case "ratio":
      return formatRatio(rounded);
  }
}

export function Odometer({
  value,
  kind,
  sessionKey,
  className = "",
}: {
  /** The scaled integer the formatter expects (cents, 1e2 percent, 1e4 ratio). */
  value: number;
  kind: OdometerKind;
  sessionKey: string;
  className?: string;
}) {
  const final = format(kind, value);
  const [shown, setShown] = useState(final);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const storeKey = `tradelog:odometer:${sessionKey}`;
    try {
      if (sessionStorage.getItem(storeKey)) return;
      sessionStorage.setItem(storeKey, "1");
    } catch {
      return; // private mode: show the value, skip the flourish
    }

    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      // ease-out-quart, matching the CSS token
      const eased = 1 - Math.pow(1 - t, 4);
      setShown(format(kind, value * eased));
      if (t < 1) frame.current = requestAnimationFrame(step);
      else setShown(format(kind, value));
    };
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [value, kind, sessionKey]);

  return (
    <span className={className} suppressHydrationWarning>
      {shown}
    </span>
  );
}
