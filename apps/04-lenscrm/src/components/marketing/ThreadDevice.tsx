"use client";
/**
 * The landing device: lead-to-gallery, one thread through the whole job. A
 * single brass thread advances through five stages — Inquiry → Booked →
 * Signed → Paid → Delivered — each lighting up in turn, then loops. The
 * "one tool, one thread" promise made literal.
 */
import { useEffect, useState } from "react";
import { IconCheck } from "@/components/icons";

const STAGES = [
  { key: "inquiry", label: "Inquiry", detail: "Lead form → your inbox" },
  { key: "booked", label: "Booked", detail: "Slot held, contract sent" },
  { key: "signed", label: "Signed", detail: "E-signed, audit trail" },
  { key: "paid", label: "Deposit paid", detail: "Booking confirmed" },
  { key: "delivered", label: "Delivered", detail: "Gallery, proofed & downloaded" },
];

export function ThreadDevice() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setActive(STAGES.length); return; }
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % (STAGES.length + 3);
      setActive(Math.min(i, STAGES.length));
    }, 1100);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="placard overflow-hidden p-5">
      <p className="t-placard">The thread</p>
      <div className="relative mt-4 pl-6">
        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-[var(--color-line)]" />
        <div className="absolute left-[7px] top-1 w-px bg-[var(--color-brass)] transition-[height] duration-700 ease-out" style={{ height: `calc(${Math.max(0, (active - 0.5)) / STAGES.length * 100}% )` }} />
        {STAGES.map((s, i) => {
          const lit = i < active;
          return (
            <div key={s.key} className="relative pb-5 last:pb-0">
              <span className="absolute -left-6 top-0.5 grid h-[15px] w-[15px] place-items-center rounded-full border transition-colors duration-300" style={{ borderColor: lit ? "var(--color-brass)" : "var(--color-line)", background: lit ? "var(--color-brass)" : "transparent" }}>
                {lit && <IconCheck size={9} stroke="#141414" />}
              </span>
              <p className="t-title text-[15px]" style={{ color: lit ? "var(--color-text)" : "var(--color-text-3)" }}>{s.label}</p>
              <p className="t-secondary" style={{ color: lit ? "var(--color-text-2)" : "var(--color-text-3)" }}>{s.detail}</p>
            </div>
          );
        })}
      </div>
      <p className="mono mt-1 text-[11px] text-[var(--color-text-3)]">One tool. One thread. No re-typing.</p>
    </div>
  );
}
