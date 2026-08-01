"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The brand device: **#347 → #12**, the queue jump.
 *
 * This is the hero's "machine running" beat — the same odometer the product
 * uses, on staged numbers, and labelled as staged. It runs once when it scrolls
 * into view and then stops: one of the page's four animated moments.
 */

const FROM = 347;
const TO = 12;
const STEPS = [347, 297, 247, 197, 147, 97, 62, 37, 22, 12];

export function QueueJump() {
  const [value, setValue] = useState(FROM);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = host.current;
    if (!node) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const run = () => {
      if (reduced) {
        setValue(TO);
        setDone(true);
        return;
      }
      setRunning(true);
      STEPS.forEach((step, index) => {
        setTimeout(() => {
          setValue(step);
          if (index === STEPS.length - 1) {
            setRunning(false);
            setDone(true);
          }
        }, index * 90);
      });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          run();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const digits = String(value).padStart(3, " ").split("");

  return (
    <div ref={host} style={{ position: "relative", textAlign: "center" }}>
      <div style={{ height: 20, display: "flex", justifyContent: "center", alignItems: "flex-end" }}>
        {running || done ? <span className="delta-chip">▲ {FROM - value}</span> : null}
      </div>

      <div className="t-numeral roll" data-rolling={running} aria-hidden="true">
        <span>#</span>
        {digits.map((digit, index) =>
          digit === " " ? null : <Digit key={index} value={Number(digit)} />,
        )}
      </div>

      {done ? <span className="landing-ring" data-active="true" /> : null}

      <p className="t-secondary" style={{ marginTop: 12 }}>
        Three friends confirmed. {FROM} → {TO}.
      </p>
      <p className="t-label" style={{ marginTop: 8 }}>
        Demo · staged numbers
      </p>
    </div>
  );
}

const LADDER = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function Digit({ value }: { value: number }) {
  return (
    <span className="roll-digit">
      <span style={{ transform: `translateY(-${value * 10}%)` }}>
        {LADDER.map((d) => (
          <span key={d} style={{ display: "block", height: "1em" }}>
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}
