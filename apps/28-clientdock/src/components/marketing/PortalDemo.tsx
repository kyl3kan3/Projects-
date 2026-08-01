"use client";

import { useEffect, useState } from "react";
import { IconBell, IconFolder, IconStamp, IconTimeline } from "@/components/icons";
import { Monogram } from "@/components/Monogram";

/**
 * The hero: the product visibly running inside a phone frame, before the first
 * scroll. The rows arrive one at a time on entry — the machine assembling a portal
 * — and then it stops. That is animated moment one of the playbook's four.
 *
 * It is HTML and CSS, no canvas, so the mobile LCP is the text.
 */
const ROWS = [
  { text: "Homepage v3 uploaded · Tue", bell: false },
  { text: "Approve Homepage v3?", bell: true },
  { text: "Invoice #0042 — $4,800 due Jul 15", bell: true },
  { text: "Build — 60% through · staging is up", bell: false },
] as const;

export function PortalDemo({ accent, band }: { accent: string; band: string }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(ROWS.length);
      return;
    }
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= ROWS.length) clearInterval(timer);
    }, 420);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="card"
      style={{ maxWidth: 340, overflow: "hidden", padding: 0, margin: "0 auto" }}
      aria-label="A ClientDock portal, as the client sees it"
      role="img"
    >
      <div style={{ background: band, color: "var(--color-ivory)", padding: "20px 16px" }}>
        <Monogram name="Meridian Roasters" />
        <p
          className="t-display mt-3"
          style={{ fontSize: 26, lineHeight: 1.12, color: "var(--color-ivory)" }}
        >
          Welcome, Meridian
        </p>
        <p className="band-secondary mt-1">Prepared by Northbeam Studio</p>
      </div>

      <div style={{ padding: 16 }}>
        <p className="t-label" style={{ marginBottom: 4 }}>
          Since your last visit
        </p>
        {ROWS.map((row, i) => (
          <div
            key={row.text}
            className="row"
            style={{
              minHeight: 44,
              opacity: i < shown ? 1 : 0,
              transform: i < shown ? "none" : "translateY(8px)",
              transition: "opacity 240ms var(--ease-out-quart), transform 240ms var(--ease-out-quart)",
            }}
          >
            {row.bell ? (
              <IconBell size={16} style={{ color: "var(--color-amber)", flex: "none" }} />
            ) : (
              <span style={{ width: 16, flex: "none" }} />
            )}
            <span className="t-secondary" style={{ color: "var(--color-ink)" }}>
              {row.text}
            </span>
          </div>
        ))}

        <div className="mt-4 flex gap-2">
          {[
            { Icon: IconTimeline, label: "Timeline" },
            { Icon: IconFolder, label: "Files" },
            { Icon: IconStamp, label: "Approvals" },
          ].map(({ Icon, label }) => (
            <span
              key={label}
              className="card"
              style={{
                flex: 1,
                padding: 10,
                display: "flex",
                flexDirection: "column",
                gap: 6,
                alignItems: "flex-start",
              }}
            >
              <Icon size={18} style={{ color: "var(--color-ink-2)" }} />
              <span className="t-label" style={{ color: "var(--color-ink-2)" }}>
                {label}
              </span>
            </span>
          ))}
        </div>

        <p
          className="btn btn-primary btn-full mt-4"
          style={{ pointerEvents: "none", height: 44 }}
          aria-hidden="true"
        >
          Review Homepage v3
        </p>
        <p className="t-label mt-3" style={{ fontSize: 11, color: accent }}>
          via Northbeam Studio
        </p>
      </div>
    </div>
  );
}
