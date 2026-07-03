"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** Appears once the hero scrolls off — pins the primary action to the thumb zone. */
export function StickyCTA({ href, label }: { href: string; label: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 420);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`safe-b fixed inset-x-0 bottom-0 z-40 px-4 pb-3 pt-3 transition-transform duration-300 sm:hidden ${
        show ? "translate-y-0" : "translate-y-[130%]"
      }`}
      style={{ background: "linear-gradient(0deg, var(--color-ink) 60%, transparent)" }}
    >
      <Link href={href} className="btn btn-primary btn-block">
        {label}
      </Link>
    </div>
  );
}
