"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * The phone-only sticky CTA (playbook law 7: same words, thumb zone).
 *
 * It appears only once the hero's own button has scrolled away — two identical
 * buttons stacked on top of each other reads as a bug, not as persuasion.
 */
export function StickyCta({ label }: { label: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 520);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 p-4 sm:hidden"
      style={{
        background: "color-mix(in srgb, var(--ground) 92%, transparent)",
        backdropFilter: "blur(12px)",
        borderTop: "1px solid var(--line)",
        paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
        transform: visible ? "none" : "translateY(110%)",
        transition: "transform 200ms cubic-bezier(0.25, 1, 0.5, 1)",
        pointerEvents: visible ? "auto" : "none",
      }}
      aria-hidden={!visible}
    >
      <Link href="/signup" className="btn btn-primary btn-full">
        {label}
      </Link>
    </div>
  );
}
