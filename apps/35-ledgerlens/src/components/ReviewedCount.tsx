"use client";

/**
 * The counter that ticks up one when an entry settles — the second half of the
 * signature. A single digit roll, under 300ms, and only when a confirm actually just
 * happened; otherwise it renders the number and stays still.
 *
 * `prefers-reduced-motion` gets a direct number swap, which is what the roll is worth
 * anyway.
 */

import { useEffect, useState } from "react";

export function ReviewedCount({ value, ticked }: { value: number; ticked: boolean }) {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [display, setDisplay] = useState(ticked && !reduced ? Math.max(0, value - 1) : value);

  useEffect(() => {
    if (!ticked || reduced) {
      setDisplay(value);
      return;
    }
    const id = setTimeout(() => setDisplay(value), 90);
    return () => clearTimeout(id);
  }, [value, ticked, reduced]);

  return (
    <span
      className="t-mono"
      style={{
        display: "inline-block",
        transition: "transform 220ms cubic-bezier(0.25,1,0.5,1)",
        transform: display === value ? "none" : "translateY(2px)",
      }}
    >
      {display}
    </span>
  );
}
