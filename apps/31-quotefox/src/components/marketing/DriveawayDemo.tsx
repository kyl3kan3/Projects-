"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconFlag, IconMic } from "@/components/icons";
import { formatMoney } from "@/lib/money";

/**
 * The hero: the machine running.
 *
 * MARKETING_PLAYBOOK law 2 says the product demos itself in the first five
 * seconds, so this is the estimate assembling itself out of a real walkthrough —
 * the same rows, the same amber flag, the same odometer total as the product's own
 * review screen, replayed from a fixed script. It is our own dogfood output from
 * the HVAC sample walkthrough, and it is labelled as a replay rather than
 * presented as a customer's job.
 *
 * One of the page's four animated moments (playbook law 6). It is HTML and CSS, so
 * it costs nothing on a phone, and `prefers-reduced-motion` shows the finished
 * estimate immediately instead.
 */

interface DemoRow {
  name: string;
  detail: string;
  cents: number;
  flagged?: boolean;
}

const ROWS: DemoRow[] = [
  { name: "Condenser, 3-ton 15.2 SEER2 R-410A", detail: "1 × $2,632.50 · from 00:12", cents: 263_250 },
  { name: "Evaporator coil, 3-ton cased", detail: "1 × $918.00 · from 00:12", cents: 91_800 },
  { name: "Condenser pad, 36x36 composite", detail: "1 × $114.75 · from 00:06", cents: 11_475 },
  { name: "Line set, 3/4 x 3/8 insulated", detail: "25 lf × $19.58 · from 00:30", cents: 48_950 },
  { name: "Thermostat, programmable Wi-Fi", detail: "1 × $249.75 · from 00:24", cents: 24_975 },
  { name: "Install labor, lead technician", detail: "6 hrs × $128.25 · from 00:36", cents: 76_950 },
  { name: "Install labor, apprentice", detail: "6 hrs × $87.75 · from 00:36", cents: 52_650 },
  { name: "Permit filing and inspection", detail: "1 × $325.00 · from 00:42", cents: 32_500 },
  {
    name: "Crane to set the rooftop unit",
    detail: "needs pricing · from 00:48",
    cents: 0,
    flagged: true,
  },
];

export function DriveawayDemo() {
  const [visible, setVisible] = useState(0);
  const [reduced, setReduced] = useState(false);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (query.matches) {
      setReduced(true);
      setVisible(ROWS.length);
      return;
    }
    // Rows land one at a time; the total ticks with them.
    ROWS.forEach((_, index) => {
      timers.current.push(setTimeout(() => setVisible(index + 1), 420 + index * 240));
    });
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  const total = useMemo(
    () =>
      ROWS.slice(0, visible)
        .filter((row) => !row.flagged)
        .reduce((sum, row) => sum + row.cents, 0),
    [visible],
  );
  const taxed = Math.round(total * 1.0825);
  const formatted = formatMoney(taxed);
  const [dollars, cents] = formatted.replace("$", "").split(".");

  return (
    <div className="panel" style={{ padding: 20, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          className="record-capsule"
          data-recording={!reduced && visible < ROWS.length}
          style={{ width: 32, height: 32, borderRadius: 10 }}
          aria-hidden="true"
        >
          <IconMic size={16} />
        </span>
        <span className="t-data" style={{ color: "var(--color-text-3)" }}>
          4412 Ramsey Ave · 4:12pm · 3 min 58 sec walked
        </span>
      </div>

      <p className="t-label" style={{ marginTop: 20 }}>
        Running total
      </p>
      <p className="t-stat" aria-live="off" style={{ marginTop: 2 }}>
        <span className="currency">$</span>
        <span key={taxed} className={reduced ? undefined : "odometer"}>
          {dollars}
        </span>
        <span className="cents">.{cents}</span>
      </p>

      <div style={{ marginTop: 16 }}>
        {ROWS.slice(0, visible).map((row, index) => (
          <div
            key={row.name}
            className={reduced ? undefined : "type-in"}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              padding: "12px 0",
              borderBottom: "1px solid var(--color-hairline)",
              animationDelay: reduced ? undefined : `${Math.min(index, 8) * 24}ms`,
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                className="t-title"
                style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 15 }}
              >
                {row.flagged ? (
                  <IconFlag size={15} style={{ color: "var(--color-amber)", flex: "none" }} />
                ) : null}
                {row.name}
              </span>
              <span
                className="t-secondary"
                style={{ display: "block", marginTop: 2, color: "var(--color-text-3)", fontSize: 12 }}
              >
                {row.detail}
              </span>
            </span>
            <span style={{ flex: "none", textAlign: "right" }}>
              {row.flagged ? (
                <span className="t-data needs-pricing amount">—</span>
              ) : (
                <span className="t-data amount">{formatMoney(row.cents)}</span>
              )}
            </span>
          </div>
        ))}
      </div>

      <p className="t-secondary" style={{ marginTop: 16, color: "var(--color-text-3)" }}>
        A replay of our own sample HVAC walkthrough — nine lines, every one priced from the
        contractor's price book, and the crane flagged rather than guessed.
      </p>
    </div>
  );
}
