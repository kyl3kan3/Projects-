"use client";

/**
 * "One draw per session; the restraint is the clinical credibility."
 *
 * The chart inside is rendered on the server, complete, with its animation
 * classes already on it — and this wrapper starts with `no-draw`, which overrides
 * every one of those animations to their finished state. So the server HTML, a
 * reader with JavaScript off, and a reader with `prefers-reduced-motion` all get
 * the whole chart immediately.
 *
 * On the first view of a session the class is removed in a *layout* effect, which
 * runs before the browser paints, so the animation starts from its first frame
 * with no flash of the finished line. On every later view the class stays and the
 * chart is simply already drawn.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function DrawOnce({
  sessionKey,
  children,
  className,
}: {
  sessionKey: string;
  children: ReactNode;
  className?: string;
}) {
  const [draw, setDraw] = useState(false);
  const decided = useRef(false);

  useIsomorphicLayoutEffect(() => {
    if (decided.current) return;
    decided.current = true;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const key = `tradelog:drawn:${sessionKey}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      return; // private mode: show it drawn, skip the flourish
    }
    setDraw(true);
  }, [sessionKey]);

  return <div className={`${draw ? "" : "no-draw"} ${className ?? ""}`.trim()}>{children}</div>;
}
