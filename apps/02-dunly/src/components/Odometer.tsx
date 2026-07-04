"use client";

/**
 * The signature: the return tick. Digits roll vertically (≤600ms), and on
 * settle a 1.5px banknote underline sweeps under the figure. Rate-limited
 * to one roll per 5s by the caller batching value updates.
 */

import { useEffect, useRef, useState } from "react";

const DIGITS = "0123456789";

function Column({ digit, delay }: { digit: string; delay: number }) {
  if (!DIGITS.includes(digit)) {
    return <span>{digit}</span>;
  }
  const n = Number(digit);
  return (
    <span className="odo" style={{ height: "1em" }} aria-hidden>
      <span
        className="odo-digit"
        style={{ transform: `translateY(${-n}em)`, transitionDelay: `${delay}ms` }}
      >
        {DIGITS.split("").map((d) => (
          <span key={d} style={{ display: "block", height: "1em", lineHeight: 1 }}>
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}

export function Odometer({
  value,
  className,
  dollarAccent = true,
}: {
  value: string; // pre-formatted, e.g. "$4,213.88"
  className?: string;
  dollarAccent?: boolean;
}) {
  const [settling, setSettling] = useState(false);
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setSettling(true);
      const t = setTimeout(() => setSettling(false), 900);
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <span
      className={`settle-sweep ${settling ? "is-settling" : ""} ${className ?? ""}`}
      aria-label={value}
    >
      {value.split("").map((ch, i) =>
        ch === "$" && dollarAccent ? (
          <span key={i} style={{ color: "var(--color-banknote)" }}>
            $
          </span>
        ) : (
          <Column key={i} digit={ch} delay={i * 24} />
        ),
      )}
    </span>
  );
}
