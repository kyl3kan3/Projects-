"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function StickyCTA({ href, label }: { href: string; label: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 560);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!visible) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-carbon)_94%,transparent)] p-3 backdrop-blur-md sm:hidden">
      <Link href={href} className="btn btn-primary btn-block">
        {label}
      </Link>
    </div>
  );
}
