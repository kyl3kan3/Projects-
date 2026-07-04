"use client";

import { useEffect, useMemo, useState } from "react";

function splitMoney(cents: number) {
  const dollars = Math.floor(cents / 100).toLocaleString("en-US");
  const centsPart = Math.abs(cents % 100).toString().padStart(2, "0");
  return { dollars, centsPart };
}

export function ReturnTicker({ cents }: { cents: number }) {
  const [displayCents, setDisplayCents] = useState(Math.max(0, cents - 58_900));

  useEffect(() => {
    const start = displayCents;
    const diff = cents - start;
    const startedAt = performance.now();
    const duration = 600;
    let frame = 0;

    function tick(now: number) {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      setDisplayCents(Math.round(start + diff * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cents]);

  const parts = useMemo(() => splitMoney(displayCents), [displayCents]);

  return (
    <div className="hero-money return-underline" aria-label={`Recovered ${parts.dollars} dollars and ${parts.centsPart} cents`}>
      <span className="money-symbol">$</span>
      <span>{parts.dollars}</span>
      <span className="text-[60%]">.{parts.centsPart}</span>
    </div>
  );
}
