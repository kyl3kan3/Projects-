"use client";

import { useMemo, useState } from "react";
import { formatMoneyShort } from "@/lib/money";

/**
 * The math section: the buyer's own economics, calculated in front of them.
 *
 * Every number here is the visitor's input times arithmetic they can check — no
 * industry averages, no invented "customers see a 34% lift". The one external claim
 * on the page (first responder wins the majority of jobs) is attributed where it is
 * made, and this calculator does not depend on it.
 */
export function LagMath() {
  const [quotesPerMonth, setQuotesPerMonth] = useState(24);
  const [averageJob, setAverageJob] = useState(6_500);
  const [eveningHours, setEveningHours] = useState(5);

  const math = useMemo(() => {
    // Deliberately conservative: one job a month, not a modelled win-rate lift.
    const jobsLostPerYear = 12;
    const revenueAtStake = jobsLostPerYear * averageJob;
    const eveningsPerYear = eveningHours * 52;
    const quotesPerYear = quotesPerMonth * 12;
    return { revenueAtStake, eveningsPerYear, quotesPerYear };
  }, [averageJob, eveningHours, quotesPerMonth]);

  return (
    <div className="panel" style={{ padding: 20 }}>
      <p className="t-label">Your numbers</p>
      <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
        <label style={{ display: "grid", gap: 8 }}>
          <span className="t-secondary">
            Quotes you write a month:{" "}
            <span className="t-data" style={{ color: "var(--color-text)" }}>
              {quotesPerMonth}
            </span>
          </span>
          <input
            type="range"
            min={5}
            max={80}
            value={quotesPerMonth}
            onChange={(event) => setQuotesPerMonth(Number(event.target.value))}
            style={{ accentColor: "var(--color-hi-vis)", height: 44 }}
          />
        </label>
        <label style={{ display: "grid", gap: 8 }}>
          <span className="t-secondary">
            Average job:{" "}
            <span className="t-data" style={{ color: "var(--color-text)" }}>
              {formatMoneyShort(averageJob * 100)}
            </span>
          </span>
          <input
            type="range"
            min={800}
            max={30_000}
            step={100}
            value={averageJob}
            onChange={(event) => setAverageJob(Number(event.target.value))}
            style={{ accentColor: "var(--color-hi-vis)", height: 44 }}
          />
        </label>
        <label style={{ display: "grid", gap: 8 }}>
          <span className="t-secondary">
            Evening hours a week on estimates:{" "}
            <span className="t-data" style={{ color: "var(--color-text)" }}>
              {eveningHours}
            </span>
          </span>
          <input
            type="range"
            min={1}
            max={15}
            value={eveningHours}
            onChange={(event) => setEveningHours(Number(event.target.value))}
            style={{ accentColor: "var(--color-hi-vis)", height: 44 }}
          />
        </label>
      </div>

      <div className="rule" style={{ marginTop: 20, paddingTop: 20 }}>
        <p className="t-secondary">
          One job a month lost to whoever answered first is{" "}
          <span className="t-data" style={{ color: "var(--color-hi-vis)", fontSize: 15 }}>
            {formatMoneyShort(math.revenueAtStake * 100)}
          </span>{" "}
          a year at your average ticket.
        </p>
        <p className="t-secondary" style={{ marginTop: 10 }}>
          You also spend{" "}
          <span className="t-data" style={{ color: "var(--color-text)", fontSize: 15 }}>
            {math.eveningsPerYear}
          </span>{" "}
          hours a year writing{" "}
          <span className="t-data" style={{ color: "var(--color-text)", fontSize: 15 }}>
            {math.quotesPerYear}
          </span>{" "}
          quotes at the kitchen table.
        </p>
        <p className="t-secondary" style={{ marginTop: 10, color: "var(--color-text-3)" }}>
          QuoteFox at $99/mo is $1,188 a year. Those are the two numbers to weigh it against — and the
          arithmetic above is yours, not ours.
        </p>
      </div>
    </div>
  );
}
