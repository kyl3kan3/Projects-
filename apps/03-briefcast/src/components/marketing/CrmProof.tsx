"use client";

/**
 * The landing device: the meeting that ends with the CRM already updated.
 * A brief resolves (printing skeleton → sentences), then its field changes
 * split-flap to green "Synced" — the whole promise in one loop.
 */

import { useEffect, useState } from "react";
import { IconArrowRight, IconCheck, IconSync } from "@/components/icons";

const CHANGES = [
  { label: "DEAL STAGE", old: "Discovery", next: "Proposal" },
  { label: "NEXT STEP", old: null, next: "Send revised SOW; book CFO call" },
  { label: "CLOSE DATE", old: "Sep 30", next: "Aug 30" },
];

type Phase = "typesetting" | "brief" | "syncing" | "synced";

export function CrmProof() {
  const [phase, setPhase] = useState<Phase>("typesetting");
  const [syncedCount, setSyncedCount] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setPhase("synced");
      setSyncedCount(CHANGES.length);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    function loop() {
      setPhase("typesetting");
      setSyncedCount(0);
      at(1400, () => setPhase("brief"));
      at(2600, () => setPhase("syncing"));
      CHANGES.forEach((_, i) => at(2900 + i * 500, () => setSyncedCount(i + 1)));
      at(2900 + CHANGES.length * 500 + 200, () => setPhase("synced"));
      at(2900 + CHANGES.length * 500 + 3600, loop);
    }
    loop();
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="card overflow-hidden" aria-label="Demo: a meeting updating the CRM">
      <div className="border-b border-[var(--color-line)] p-4">
        <p className="mono text-[var(--color-stone)]">Jun 4 · 41 min · Zoom</p>
        <h3 className="mt-1" style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: 19 }}>
          Acme Corp — discovery call
        </h3>
      </div>

      <div className="p-4">
        {phase === "typesetting" ? (
          <div>
            {["94%", "80%", "58%"].map((w, i) => (
              <div key={i} className="skeleton-line" style={{ width: w }} />
            ))}
            <p className="mono mt-3 text-[var(--color-stone)]">Typesetting the brief…</p>
          </div>
        ) : (
          <p className="brief-para t-body text-[15px] measure">
            Budget&apos;s approved; the blocker is a CFO pricing sign-off, which Sarah offered to arrange.
            Incumbent contract runs through Q3 — timing beats price.
          </p>
        )}

        <div className="mt-4 border-t border-[var(--color-line)] pt-4">
          <p className="t-label mb-2">Keep the CRM honest</p>
          <div className="rowlist">
            {CHANGES.map((c, i) => {
              const synced = (phase === "syncing" || phase === "synced") && i < syncedCount;
              return (
                <div key={c.label} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="t-label">{c.label}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[13px]">
                      {c.old ? <span className="field-old">{c.old}</span> : <span className="text-[var(--color-stone-2)]">empty</span>}
                      <IconArrowRight size={13} className="text-[var(--color-stone-2)]" />
                      <span className="min-w-0 truncate font-medium">{c.next}</span>
                    </p>
                  </div>
                  {synced ? (
                    <span className="pill pill-green flap"><IconCheck size={12} /> Synced</span>
                  ) : (
                    <span className="pill">{phase === "brief" ? "Ready" : "…"}</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-2 text-[13px] text-[var(--color-stone)]">
            <IconSync size={15} className={phase === "syncing" ? "text-[var(--color-blue)]" : ""} />
            {phase === "synced" ? (
              <span className="text-[var(--color-green)]">Synced · 3 fields to HubSpot</span>
            ) : phase === "syncing" ? (
              "Writing to HubSpot…"
            ) : (
              "3 field updates proposed"
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
