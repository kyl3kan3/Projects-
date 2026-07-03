"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// The WebGL scene never runs on the server and lazy-loads after first paint.
const RibbonScene = dynamic(() => import("./RibbonScene"), {
  ssr: false,
  loading: () => <RibbonPoster />,
});

/** Static fallback: a stylized film-strip burst for reduced-motion / no-WebGL / SSR. */
function RibbonPoster() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 45%, rgba(109,94,252,0.28), transparent 70%)",
        }}
      />
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 gap-3 opacity-70">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-40 w-24 rounded-md border border-[var(--color-line)]"
            style={{
              transform: `rotate(${(i - 2) * 6}deg) translateY(${Math.abs(i - 2) * 8}px)`,
              background:
                "linear-gradient(160deg, rgba(167,139,250,0.18), rgba(34,211,238,0.1))",
              boxShadow: "0 20px 60px -30px rgba(109,94,252,0.8)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function RibbonHero() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let webgl = false;
    try {
      const canvas = document.createElement("canvas");
      webgl = !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    } catch {
      webgl = false;
    }
    setEnabled(webgl && !reduce);
  }, []);

  return (
    <div className="absolute inset-0">
      {enabled ? <RibbonScene /> : <RibbonPoster />}
    </div>
  );
}
