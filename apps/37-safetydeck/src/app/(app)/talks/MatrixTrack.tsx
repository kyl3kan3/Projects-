"use client";

import { useEffect, useRef } from "react";

/**
 * The matrix scrolls to its newest week on mount.
 *
 * Weeks read left-to-right chronologically, which is right for a record — but the
 * column anyone opens this screen to look at is *this* week, and it is the one off
 * the right edge of a phone. Scrolling there is the difference between a grid you
 * read and a grid you have to operate.
 */
export function MatrixTrack({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);
  return (
    <div className="matrix-track" ref={ref}>
      {children}
    </div>
  );
}
