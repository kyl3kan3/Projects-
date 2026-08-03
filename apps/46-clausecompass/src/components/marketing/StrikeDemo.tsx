"use client";

/**
 * The brand device: the clause drawn in redline ink.
 *
 * One animated beat, on entry, once. The struck phrase and the replacement are both fully
 * present in the DOM before any animation runs, so reduced motion and print show the same
 * artefact standing still — which is the point of the device: the moment the document stops
 * winning is a *fact* on the page, not a movement.
 */

import { useEffect, useRef, useState } from "react";

const PHRASE =
  "Contractor hereby irrevocably assigns to Client all right, title and interest in the Work Product, effective upon creation of each item.";

export function StrikeDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || drawn) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setDrawn(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [drawn]);

  return (
    <div ref={ref} className="report-page p-5">
      <p className="t-label">§4.1 · IP Assignment · High</p>
      <p className="mt-3">
        <span className="redline-original strike-wrap">
          <span>{PHRASE}</span>
          <span className="strike-over" data-drawn={drawn} aria-hidden="true">
            {PHRASE}
          </span>
        </span>
      </p>
      <div className="rise mt-4" data-drawn={drawn}>
        <p className="redline-suggested">
          Upon Contractor&rsquo;s receipt of payment in full for the applicable deliverable,
          Contractor assigns to Client all right, title and interest in that deliverable. Until
          payment in full, Contractor retains all rights.
        </p>
        <p className="t-secondary mt-2">
          Ownership now moves when the invoice is paid, not when the file is made.
        </p>
      </div>
    </div>
  );
}
