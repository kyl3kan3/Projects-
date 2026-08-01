"use client";

import { useEffect, useState } from "react";
import { moneyShort } from "@/lib/format";

/**
 * Beat 1 of four: the machine running.
 *
 * Five bids land on a leveling grid one at a time and the columns snap into
 * alignment; the per-line lows light up; the adjusted totals settle and the apparent
 * low takes the steel underline. The numbers are a **staged demo** — labelled as one
 * on the page — but they are the real shape of a Division 26 package, and the
 * arithmetic below is the same arithmetic the product does: the raw low loses to the
 * adjusted low once the missing fire alarm is plugged.
 *
 * Runs on CSS transitions with one timer. Under `prefers-reduced-motion` the whole
 * grid is present on first paint with no movement at all — the reduced-motion path
 * is the complete thing, not a stub.
 */

interface DemoColumn {
  sub: string;
  cells: (number | null)[];
  plug: number | null;
  adjusted: number;
}

const ROWS = [
  "Temporary power and distribution",
  "Panelboards and feeders",
  "Branch wiring and devices",
  "Light fixtures (owner-furnished)",
  "Fire alarm rough-in",
];

const COLUMNS: DemoColumn[] = [
  {
    sub: "MERIDIAN",
    cells: [840_000, 4_620_000, 9_250_000, 1_800_000, null],
    plug: 1_230_000,
    adjusted: 17_740_000,
  },
  {
    sub: "HARLAN",
    cells: [910_000, 4_480_000, 9_575_000, 1_740_000, 1_230_000],
    plug: null,
    adjusted: 18_355_000,
  },
  {
    sub: "BRIGHTLINE",
    cells: [null, null, null, null, null],
    plug: 1_230_000,
    adjusted: 17_960_000,
  },
  {
    sub: "CASS RIDGE",
    cells: [790_000, 4_910_000, 9_980_000, 1_690_000, 1_410_000],
    plug: null,
    adjusted: 18_780_000,
  },
  {
    sub: "PIKE ST",
    cells: [880_000, 4_705_000, 9_400_000, 1_755_000, 1_295_000],
    plug: null,
    adjusted: 18_035_000,
  },
];

/** The winner on adjusted totals — not the raw low. That is the whole point. */
const LOW_INDEX = 0;

export function HeroGrid() {
  const [landed, setLanded] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLanded(COLUMNS.length);
      return;
    }
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setLanded(i);
      if (i >= COLUMNS.length) clearInterval(timer);
    }, 320);
    return () => clearInterval(timer);
  }, []);

  const lowPerRow = ROWS.map((_, r) => {
    const values = COLUMNS.slice(0, Math.max(landed, 1))
      .map((c) => c.cells[r])
      .filter((v): v is number => v !== null);
    return values.length > 0 ? Math.min(...values) : null;
  });

  return (
    <figure style={{ margin: 0 }}>
      <div className="grid-track" aria-hidden="true">
        <table className="lvl">
          <thead>
            <tr>
              <th className="lvl-head">Line item</th>
              {COLUMNS.map((c, i) => (
                <th
                  key={c.sub}
                  style={{
                    opacity: i < landed ? 1 : 0,
                    transition: "opacity 200ms var(--ease-out-quart)",
                    color: i === LOW_INDEX && landed >= COLUMNS.length ? "var(--accent)" : undefined,
                  }}
                >
                  {c.sub}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, r) => (
              <tr key={row}>
                <td className="lvl-row-head">{row}</td>
                {COLUMNS.map((c, i) => {
                  const value = c.cells[r];
                  const shown = i < landed;
                  const isPlug = value === null && c.plug !== null && r === ROWS.length - 1;
                  const isLumpSum = c.sub === "BRIGHTLINE";
                  const isLow = value !== null && value === lowPerRow[r];
                  return (
                    <td
                      key={c.sub}
                      className={`lvl-cell${isLow ? " is-low" : ""}${isPlug ? " is-plug" : ""}${
                        value === null && !isPlug ? " is-empty" : ""
                      }`}
                      style={{
                        opacity: shown ? 1 : 0,
                        transform: shown ? "translateY(0)" : "translateY(8px)",
                        transition: `opacity 240ms var(--ease-out-quart) ${r * 24}ms, transform 240ms var(--ease-out-quart) ${r * 24}ms, color 200ms linear`,
                      }}
                    >
                      {value !== null ? (
                        moneyShort(value)
                      ) : isPlug ? (
                        <>
                          {moneyShort(c.plug!)}
                          <span className="plug-mark">p</span>
                        </>
                      ) : isLumpSum ? (
                        "LS"
                      ) : (
                        "—"
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="lvl-row-head">Adjusted total</td>
              {COLUMNS.map((c, i) => (
                <td
                  key={c.sub}
                  className={i === LOW_INDEX && landed >= COLUMNS.length ? "is-apparent-low" : ""}
                  style={{
                    opacity: i < landed ? 1 : 0,
                    transition: "opacity 240ms var(--ease-out-quart)",
                  }}
                >
                  {moneyShort(c.adjusted)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <figcaption
        className="t-secondary"
        style={{ marginTop: "var(--s3)", color: "var(--fg-3)" }}
      >
        Staged demo, not a customer&rsquo;s job: five bids on one Division 26 package.
        Brightline is the raw low at $164,900 — and loses, because their number is
        missing the fire alarm and the dumpsters. The <em>p</em> cells are plug values
        the estimator entered, never disguised as a bidder&rsquo;s price.
      </figcaption>
    </figure>
  );
}
