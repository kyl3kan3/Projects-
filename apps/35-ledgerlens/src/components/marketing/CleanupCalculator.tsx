"use client";

/**
 * Beat 4: the buyer's economics, calculated in front of them.
 *
 * Two sliders — the hours their accountant spends reconstructing a year of receipts, and
 * that accountant's hourly rate — and the arithmetic writes itself out. Reactive rather
 * than ambient, which is the only kind of motion a marketing page should spend a beat on
 * below the fold.
 *
 * The defaults are honest: 8 hours at $50 is $400, which is the low end of the $300–$800
 * range cited in the README, and the comparison is against the real published price.
 */

import { useState } from "react";
import { formatCents } from "@/lib/money";
import { PLANS } from "@/lib/plans";

const ANNUAL_CENTS = PLANS.solo.priceCents * 12;

export function CleanupCalculator() {
  const [hours, setHours] = useState(8);
  const [rate, setRate] = useState(50);

  const feeCents = hours * rate * 100;
  const deltaCents = feeCents - ANNUAL_CENTS;

  return (
    <div
      className="mt-6 rounded-[12px] border p-4"
      style={{ background: "var(--color-card)", borderColor: "var(--color-line)" }}
    >
      <label className="block">
        <span className="t-label">Hours your accountant spends sorting receipts</span>
        <div className="mt-2 flex items-center gap-4">
          <input
            type="range"
            min={2}
            max={30}
            step={1}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="min-w-0 flex-1"
            style={{ accentColor: "var(--color-ledger)", height: 44 }}
            aria-label="Hours your accountant spends sorting receipts"
          />
          <span className="t-mono w-[54px] text-right text-[15px]">{hours} h</span>
        </div>
      </label>

      <label className="mt-3 block">
        <span className="t-label">Their hourly rate</span>
        <div className="mt-2 flex items-center gap-4">
          <input
            type="range"
            min={25}
            max={250}
            step={5}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            className="min-w-0 flex-1"
            style={{ accentColor: "var(--color-ledger)", height: 44 }}
            aria-label="Their hourly rate"
          />
          <span className="t-mono w-[54px] text-right text-[15px]">${rate}</span>
        </div>
      </label>

      <div className="mt-5 hairline-t">
        <div
          className="flex items-baseline justify-between gap-3 border-b py-3"
          style={{ borderColor: "var(--color-line)" }}
        >
          <span className="t-body">
            Your cleanup fee
            <span className="t-data ml-2" style={{ color: "var(--color-ink-3)" }}>
              {hours} × ${rate}
            </span>
          </span>
          <span className="t-mono text-[17px]">{formatCents(feeCents)}</span>
        </div>
        <div
          className="flex items-baseline justify-between gap-3 border-b py-3"
          style={{ borderColor: "var(--color-line)" }}
        >
          <span className="t-body">A year of LedgerLens</span>
          <span className="t-mono text-[17px]" style={{ color: "var(--color-ledger)" }}>
            {formatCents(ANNUAL_CENTS)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-3">
          <span className="t-title">
            {deltaCents >= 0 ? "You are ahead by" : "You are behind by"}
          </span>
          <span
            className="t-mono text-[20px]"
            style={{ color: deltaCents >= 0 ? "var(--color-ledger)" : "var(--color-ink-2)" }}
          >
            {formatCents(Math.abs(deltaCents))}
          </span>
        </div>
      </div>

      <p className="t-secondary mt-3" style={{ color: "var(--color-ink-3)" }}>
        {deltaCents >= 0
          ? "And that is before the deductions a faded receipt would have cost you."
          : "At that rate the cleanup is cheap — but you still lose the faded receipts."}{" "}
        Cleanup fees of $300–$800 for a year of shoebox bookkeeping are typical; your own
        preparer&rsquo;s quote is the number that matters.
      </p>
    </div>
  );
}
