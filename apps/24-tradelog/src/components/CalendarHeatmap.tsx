"use client";

/**
 * The calendar heatmap. One month of 4px-radius cells, filled by the day's net
 * P&L at 15–80% opacity; a zero day stays `panel`. Cells fill in reading order
 * with a 6ms stagger. Tapping a day lifts its trades into a mini-stack sheet.
 *
 * Cents arrive as JS numbers — this is a client component and bigints do not
 * cross that boundary. The exact figures were formatted on the server and travel
 * as strings; the numbers here only decide an opacity.
 */

import { useState } from "react";
import Link from "next/link";
import { heatOpacity } from "@/components/charts";
import { IconClose } from "@/components/icons";

export interface HeatmapDay {
  /** "YYYY-MM-DD" in the trader's timezone. */
  date: string;
  netCents: number;
  /** Pre-formatted by the server, so no money is formatted twice. */
  netLabel: string;
  count: number;
  trades: { id: string; symbol: string; pnlLabel: string; sign: number }[];
}

export function CalendarHeatmap({
  monthLabel,
  /** Day-of-week (0 = Sunday) the 1st of the month falls on. */
  firstWeekday,
  daysInMonth,
  days,
  /** Prefix for cell dates, "2026-01". */
  monthPrefix,
}: {
  monthLabel: string;
  firstWeekday: number;
  daysInMonth: number;
  days: HeatmapDay[];
  monthPrefix: string;
}) {
  const [open, setOpen] = useState<HeatmapDay | null>(null);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const maxMagnitude = Math.max(0, ...days.map((d) => Math.abs(d.netCents)));

  const cells: (HeatmapDay | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${monthPrefix}-${String(day).padStart(2, "0")}`;
    cells.push(byDate.get(date) ?? { date, netCents: 0, netLabel: "", count: 0, trades: [] });
  }

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="t-label">{monthLabel}</h2>
        <p className="t-secondary">Tap a day for its trades</p>
      </div>

      <div className="cal-grid mb-2" aria-hidden="true">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={`${d}${i}`} className="t-label text-center">
            {d}
          </span>
        ))}
      </div>

      <div className="cal-grid" role="grid" aria-label={`Daily profit and loss, ${monthLabel}`}>
        {cells.map((cell, index) => {
          if (!cell) {
            return <span key={`pad-${index}`} className="cal-cell" data-outside="true" />;
          }
          const dayNumber = Number(cell.date.slice(-2));
          const magnitude = Math.abs(cell.netCents);
          const opacity = heatOpacity(magnitude, maxMagnitude);
          const colour =
            cell.netCents > 0
              ? "var(--color-profit)"
              : cell.netCents < 0
                ? "var(--color-loss)"
                : "transparent";
          return (
            <button
              key={cell.date}
              type="button"
              className="cal-cell"
              data-has-trades={cell.count > 0}
              disabled={cell.count === 0}
              onClick={() => setOpen(cell)}
              style={{
                background:
                  opacity === 0
                    ? "var(--color-panel)"
                    : `color-mix(in srgb, ${colour} ${opacity * 100}%, var(--color-panel))`,
                animationDelay: `${Math.min(index, 40) * 6}ms`,
              }}
              aria-label={
                cell.count > 0
                  ? `${cell.date}: ${cell.netLabel} over ${cell.count} trade${cell.count === 1 ? "" : "s"}`
                  : `${cell.date}: no trades`
              }
            >
              {dayNumber}
            </button>
          );
        })}
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-5"
          onClick={() => setOpen(null)}
          role="presentation"
        >
          <div
            className="sheet w-full max-w-[430px] p-5"
            role="dialog"
            aria-modal="true"
            aria-label={`Trades on ${open.date}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="t-label">{open.date}</p>
                <p className="t-stat mt-2">{open.netLabel}</p>
              </div>
              <button
                type="button"
                className="btn-quiet flex h-11 w-11 items-center justify-center"
                onClick={() => setOpen(null)}
                aria-label="Close"
              >
                <IconClose size={20} />
              </button>
            </div>
            <ul>
              {open.trades.map((trade) => (
                <li key={trade.id}>
                  <Link href={`/journal/${trade.id}`} className="row">
                    <span className="t-cell flex-1">{trade.symbol}</span>
                    <span
                      className={`t-cell ${trade.sign > 0 ? "v-profit" : trade.sign < 0 ? "v-loss" : ""}`}
                    >
                      {trade.pnlLabel}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}
