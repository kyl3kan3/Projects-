"use client";

/**
 * "One draw per session; the restraint is the clinical credibility."
 *
 * Renders its children static on the server and on a repeat visit, and animated
 * exactly once per browser session per key. Because the static form is the
 * default, a reader with JavaScript off or reduced motion on still gets the whole
 * chart — it simply does not draw itself.
 */

import { useEffect, useState, type ReactNode } from "react";

export function DrawOnce({
  sessionKey,
  children,
}: {
  sessionKey: string;
  children: (animate: boolean) => ReactNode;
}) {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const key = `tradelog:drawn:${sessionKey}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      return;
    }
    setAnimate(true);
  }, [sessionKey]);

  return <>{children(animate)}</>;
}
