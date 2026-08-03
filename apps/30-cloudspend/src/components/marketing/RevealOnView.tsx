"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The marketing page gets exactly four animated moments (MARKETING_PLAYBOOK law
 * 6): the demo running, the device landing, the proof revealing, and the offer
 * maths writing itself out. This is the mechanism for the last three — a single
 * 16px rise and fade, once, when the section is reached.
 *
 * Two robustness rules, because "invisible until an observer fires" is a way to
 * ship a blank page:
 *
 * - Anything already within a screen of the viewport on mount is shown at once,
 *   with no animation to wait for.
 * - A passive scroll listener backs the observer up. A programmatic jump (an
 *   anchor, a restored scroll position, a full-page screenshot) can move past a
 *   section without the observer ever seeing it intersect, and that section must
 *   not stay hidden.
 *
 * Under `prefers-reduced-motion` everything is rendered in its final state and
 * nothing moves.
 */
export function RevealOnView({
  children,
  delayMs = 0,
}: {
  children: React.ReactNode;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAnimate(false);
      setShown(true);
      return;
    }

    // Already on screen (or scrolled past): show it, no animation to wait for.
    if (node.getBoundingClientRect().top < window.innerHeight) {
      setAnimate(false);
      setShown(true);
      return;
    }

    let done = false;
    const reveal = (withAnimation: boolean) => {
      if (done) return;
      done = true;
      setAnimate(withAnimation);
      setShown(true);
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
    const onScroll = () => {
      if (node.getBoundingClientRect().top < window.innerHeight) reveal(true);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) reveal(true);
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div
      ref={ref}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(16px)",
        transition: animate
          ? `opacity 320ms var(--ease-out-quart) ${delayMs}ms, transform 320ms var(--ease-out-quart) ${delayMs}ms`
          : undefined,
      }}
    >
      {children}
    </div>
  );
}
