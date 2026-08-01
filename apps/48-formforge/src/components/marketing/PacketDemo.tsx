"use client";

/**
 * The hero: the product's output assembling in front of the visitor
 * (MARKETING_PLAYBOOK law 2), and the brand device — the clipboard retired, audit
 * trail included.
 *
 * One of the page's four animated beats. Three steps, ~900ms apart: the packet
 * fills, the signature draws, the evidence stamp lands. It is CSS and one interval;
 * there is no canvas on the mobile critical path and no library.
 *
 * `prefers-reduced-motion` shows the finished state immediately — feature-complete,
 * not punitive, and it is what the screenshot in a slide deck should look like anyway.
 */

import { useEffect, useState } from "react";
import { IconCheck } from "@/components/icons";

const SIGNATURE_PATH =
  "M14 74 C24 46, 34 44, 40 62 C46 80, 52 82, 58 60 C64 38, 74 40, 78 66 " +
  "C82 88, 92 84, 98 62 C104 40, 116 42, 122 68 C128 92, 140 84, 152 56 " +
  "C160 38, 174 42, 182 66 C188 84, 200 84, 214 58";

const STAMP = "SIGNED · JUL 4 2026 · 14:02 UTC · SHA-256 9F3C…2AB1";

export function PacketDemo() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setStep(3);
      return;
    }
    const timers = [
      setTimeout(() => setStep(1), 320),
      setTimeout(() => setStep(2), 1150),
      setTimeout(() => setStep(3), 1900),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="panel p-4" style={{ maxWidth: 420 }} aria-label="A demo intake packet being signed">
      <div className="hairline-b pb-3">
        <p className="t-label">Riverbend Counseling</p>
        <p className="t-title mt-1">Behavioral health intake packet</p>
        <p className="t-data mt-1" style={{ color: "var(--color-ink-3)" }}>
          V2 · SECTION 6 OF 6
        </p>
      </div>

      <div className="progress mt-3">
        <div
          className="progress-fill"
          style={{ width: step === 0 ? "20%" : step === 1 ? "70%" : "100%" }}
        />
      </div>

      <dl className="m-0 mt-4">
        {[
          ["Presenting concern", "Panic attacks since March, worse before work"],
          ["PHQ-9", "14 · MODERATE"],
          ["GAD-7", "11 · MODERATE"],
        ].map(([label, value], i) => (
          <div
            key={label}
            className="hairline-b py-2"
            style={{
              opacity: step >= 1 ? 1 : 0,
              transform: step >= 1 ? "none" : "translateY(4px)",
              transition: `opacity 240ms ease ${i * 90}ms, transform 240ms ease ${i * 90}ms`,
            }}
          >
            <dt className="t-secondary">{label}</dt>
            <dd
              className={i === 0 ? "m-0 mt-0.5" : "t-data m-0 mt-0.5"}
              style={{ fontSize: i === 0 ? 15 : undefined }}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4" style={{ minHeight: 96 }}>
        <svg viewBox="0 0 240 110" width="100%" height="80" role="img" aria-label="A signature being drawn">
          <path
            d={SIGNATURE_PATH}
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 1400,
              strokeDashoffset: step >= 2 ? 0 : 1400,
              transition: "stroke-dashoffset 600ms cubic-bezier(0.25, 1, 0.5, 1)",
            }}
          />
        </svg>
        <div className="sig-line" />
      </div>

      <p
        className="t-data mt-3"
        style={{
          color: "var(--color-ink-2)",
          opacity: step >= 3 ? 1 : 0,
          transform: step >= 3 ? "none" : "translateY(8px)",
          transition: "opacity 320ms ease, transform 320ms cubic-bezier(0.2, 0.8, 0.25, 1)",
          borderBottom: step >= 3 ? "1.5px solid var(--color-teal)" : "1.5px solid transparent",
          display: "inline-block",
          paddingBottom: 3,
          wordBreak: "break-word",
        }}
      >
        {STAMP}
      </p>

      <p
        className="t-secondary mt-4 flex items-center gap-2"
        style={{
          color: "var(--color-moss)",
          opacity: step >= 3 ? 1 : 0,
          transition: "opacity 320ms ease 160ms",
        }}
      >
        <IconCheck size={18} />
        On file, before the appointment
      </p>
    </div>
  );
}
