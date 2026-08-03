"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The marketing page gets exactly four animated moments (MARKETING_PLAYBOOK law
 * 6): the demo running, the device landing, the proof revealing, and the offer
 * maths writing itself out. This is the mechanism for the last three — a single
 * 16px rise and fade, once, when the section is actually read.
 *
 * Under `prefers-reduced-motion` the content is rendered in its final state
 * immediately and nothing moves.
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

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(16px)",
        transition: `opacity 320ms var(--ease-out-quart) ${delayMs}ms, transform 320ms var(--ease-out-quart) ${delayMs}ms`,
      }}
    >
      {children}
    </div>
  );
}
