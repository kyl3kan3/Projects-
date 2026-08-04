"use client";

import { useState } from "react";
import { money } from "@/lib/format";
import { dollarsToCents, intInRange } from "@/lib/forms";

/**
 * The buyer's economics, calculated in front of them (MARKETING_PLAYBOOK law 3's "the math").
 *
 * Two honest choices in here. The no-show rate defaults to the low end of the published range
 * for the trade rather than the high end, and the recovery figure is what the *policy* would
 * have collected — not the whole missed ticket, because a 50% fee is 50%. Inflating either
 * would make the number bigger and the product less believable, and this calculator's only job
 * is to be believed.
 */
const DEFAULTS = { perWeek: "40", ticket: "45", noShowRate: "10", feePercent: "50" };

export function Calculator() {
  const [values, setValues] = useState(DEFAULTS);
  const set = (key: keyof typeof DEFAULTS) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  const perWeek = intInRange(values.perWeek, 1, 200) ?? 0;
  const ticketCents = dollarsToCents(values.ticket) ?? 0;
  const rate = intInRange(values.noShowRate, 0, 100) ?? 0;
  const feePercent = intInRange(values.feePercent, 0, 100) ?? 0;

  const missedPerMonth = (perWeek * 52 * (rate / 100)) / 12;
  const lostCents = Math.round(missedPerMonth * ticketCents);
  const recoveredCents = Math.round(lostCents * (feePercent / 100));
  const readable = [perWeek, ticketCents, rate].every((n) => n > 0);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Field label="Appointments a week" value={values.perWeek} onChange={set("perWeek")} />
        <Field label="Average ticket ($)" value={values.ticket} onChange={set("ticket")} />
        <Field label="No-show rate (%)" value={values.noShowRate} onChange={set("noShowRate")} />
        <Field label="Your no-show fee (%)" value={values.feePercent} onChange={set("feePercent")} />
      </div>

      {readable ? (
        <div>
          <p className="t-label" style={{ margin: 0 }}>
            Walking out of the door, every month
          </p>
          <p className="t-stat" style={{ margin: 0 }}>
            {money(lostCents).split(".")[0]}
            <span className="t-cents">.{money(lostCents).split(".")[1]}</span>
          </p>
          <p className="t-secondary" style={{ margin: "4px 0 0" }}>
            About{" "}
            <span className="t-mono">{missedPerMonth.toFixed(1)}</span> missed appointments a month
            at <span className="t-mono">{money(ticketCents)}</span> each.
          </p>
          <div className="ledger-line" style={{ marginTop: 16 }}>
            <span>
              what a {feePercent}% policy would have collected
            </span>
            <span className="ledger-amount">+{money(recoveredCents)}</span>
          </div>
          <p className="t-secondary" style={{ margin: "12px 0 0" }}>
            Against <span className="t-mono">$19</span> a month for Chair. One protected no-show
            covers it, and the arithmetic above is yours — nothing here is a promise about how many
            of your clients will show up once they have put a card down.
          </p>
        </div>
      ) : (
        <p className="t-secondary" style={{ margin: 0 }}>
          Fill in your own numbers — appointments a week, what you charge, and roughly how often
          somebody does not turn up.
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="field" style={{ flex: "1 1 140px" }}>
      <span className="t-label">{label}</span>
      <input className="input" inputMode="decimal" value={value} onChange={onChange} />
    </label>
  );
}
