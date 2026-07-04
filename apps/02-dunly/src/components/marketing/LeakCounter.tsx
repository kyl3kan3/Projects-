"use client";

/**
 * The landing device: the recovered-dollars counter ticking upward, fed by
 * a staged (honestly labeled) recovery feed. The odometer + settle sweep
 * IS the product, so it IS the hero.
 */

import { useEffect, useRef, useState } from "react";
import { Odometer } from "@/components/Odometer";
import { IconArrowDownLeft } from "@/components/icons";

interface Recovery {
  name: string;
  cents: number;
  via: string;
}

const FEED: Recovery[] = [
  { name: "Northlake Analytics", cents: 14900, via: "retry #2" },
  { name: "Craftwork Studio", cents: 4900, via: "card update" },
  { name: "Fieldnote HQ", cents: 29900, via: "retry #1" },
  { name: "Parcel & Pine", cents: 9900, via: "email · day 3" },
  { name: "Hollis Labs", cents: 19900, via: "retry #3" },
  { name: "Bright Harbor", cents: 7900, via: "card update" },
];

const START_CENTS = 341388;

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function LeakCounter() {
  const [total, setTotal] = useState(START_CENTS);
  const [items, setItems] = useState<Recovery[]>(FEED.slice(0, 3));
  const idx = useRef(3);
  const reduce = useRef(false);

  useEffect(() => {
    reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce.current) {
      setTotal(START_CENTS + FEED.reduce((s, f) => s + f.cents, 0));
      setItems(FEED);
      return;
    }
    const timer = setInterval(() => {
      const next = FEED[idx.current % FEED.length];
      idx.current += 1;
      setTotal((t) => t + next.cents);
      setItems((list) => [next, ...list].slice(0, 4));
    }, 5000); // rate-limited: one roll per 5s, per the design spec
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="panel overflow-hidden" aria-label="Demo: recovered revenue counting upward">
      <div className="border-b border-[var(--color-line)] p-4">
        <p className="t-label">Recovered this month</p>
        <p className="t-herostat mt-2" style={{ fontSize: "clamp(36px, 9vw, 52px)" }}>
          <Odometer value={fmt(total)} />
        </p>
        <p className="mono mt-2 text-[12px] text-[var(--color-faint)]">
          Staged demo · real product, real math
        </p>
      </div>
      <div className="rowlist px-4">
        {items.map((r, i) => (
          <div key={`${r.name}-${i}-${total}`} className={`flex items-center gap-3 py-3 ${i === 0 ? "feed-enter" : ""}`}>
            <IconArrowDownLeft size={16} style={{ color: "var(--color-banknote)" }} />
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{r.name}</span>
            <span className="mono">{fmt(r.cents)}</span>
            <span className="mono hidden text-[11px] text-[var(--color-faint)] sm:block">{r.via}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
