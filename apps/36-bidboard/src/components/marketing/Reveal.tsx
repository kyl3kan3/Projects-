"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Beats 2–4: each narrative section reveals once, on entry, and never again.
 *
 * The important part is what happens when the reveal *doesn't* work. The section is
 * rendered **visible** by the server and only hidden in a layout effect — before
 * paint, so there is no flash — and only when the element is genuinely below the fold
 * with motion allowed. If JavaScript never runs, never hydrates, or the observer is
 * unavailable, three sections of the page's argument are simply there. An entrance
 * animation must never be the reason a paragraph cannot be read.
 */
export function Reveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<"static" | "pending" | "shown">("static");

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Only arm the animation for sections the reader has not reached yet.
    if (node.getBoundingClientRect().top < window.innerHeight * 0.9) return;
    setState("pending");
  }, []);

  useEffect(() => {
    if (state !== "pending") return;
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setState("shown");
            observer.disconnect();
          }
        }
      },
      { rootMargin: "-8% 0px" },
    );
    observer.observe(node);
    // Belt and braces: if the observer never fires (an odd viewport, a bfcache
    // restore), the section shows itself anyway rather than staying blank.
    const failsafe = setTimeout(() => setState("shown"), 3000);
    return () => {
      observer.disconnect();
      clearTimeout(failsafe);
    };
  }, [state]);

  return (
    <section
      ref={ref as React.Ref<HTMLElement>}
      className={className}
      data-reveal={state}
      style={
        state === "pending"
          ? { opacity: 0, transform: "translateY(12px)" }
          : {
              opacity: 1,
              transform: "none",
              transition:
                "opacity 320ms var(--ease-out-quart), transform 320ms var(--ease-out-quart)",
            }
      }
    >
      {children}
    </section>
  );
}
