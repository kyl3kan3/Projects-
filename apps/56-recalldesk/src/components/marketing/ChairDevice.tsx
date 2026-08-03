/**
 * src/components/marketing/ChairDevice.tsx
 *
 * The brand device: **the chair that fills itself.**
 *
 * A week-strip of hygiene slots that ticks from hollow to filled while the
 * recovered-production counter climbs, each filled slot traceable to a named demo
 * patient and a timestamped touch. It is the product's own dashboard component
 * built from staged-but-labelled data — MARKETING_PLAYBOOK law 5 forbids inventing
 * receipts, so this is framed as a demo everywhere it appears.
 *
 * Pure CSS animation, no JavaScript, no canvas: the hero is HTML and CSS so mobile
 * LCP stays under 2s, and `prefers-reduced-motion` collapses it to the filled end
 * state with the counter simply present.
 */

import { money } from "@/lib/format";

interface DemoSlot {
  weekday: string;
  initials: string | null;
  channel: "Email" | "Text" | "Call" | null;
  touchDay: string;
  bookedDay: string;
}

/** Clearly fictional, and labelled as a demo wherever it renders. */
const SLOTS: DemoSlot[] = [
  { weekday: "Mon", initials: "R.M.", channel: "Text", touchDay: "Jun 30", bookedDay: "Jul 8" },
  { weekday: "Tue", initials: null, channel: null, touchDay: "", bookedDay: "" },
  { weekday: "Wed", initials: "D.O.", channel: "Email", touchDay: "Jul 2", bookedDay: "Jul 9" },
  { weekday: "Thu", initials: "A.N.", channel: "Call", touchDay: "Jul 7", bookedDay: "Jul 10" },
  { weekday: "Fri", initials: null, channel: null, touchDay: "", bookedDay: "" },
  { weekday: "Sat", initials: "P.R.", channel: "Email", touchDay: "Jul 5", bookedDay: "Jul 12" },
  { weekday: "Sun", initials: null, channel: null, touchDay: "", bookedDay: "" },
];

const VISIT_VALUE_CENTS = 31_000;

export function ChairDevice() {
  const filled = SLOTS.filter((s) => s.initials);
  const total = filled.length * VISIT_VALUE_CENTS;

  return (
    <figure style={{ margin: 0 }}>
      <div
        className="card"
        style={{ padding: 20, display: "grid", gap: 16 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <span className="t-label">Recovered · demo week</span>
          <span className="t-mono" style={{ color: "var(--color-ink-2)" }}>
            {filled.length} of 7 filled
          </span>
        </div>

        <p className="t-stat" style={{ margin: 0 }}>
          {money(total)}
        </p>

        <div className="week-strip">
          {SLOTS.map((slot, index) => (
            <div
              key={slot.weekday}
              className="slot"
              data-filled={Boolean(slot.initials)}
              style={
                slot.initials
                  ? { animationDelay: `${240 + index * 140}ms` }
                  : { animation: "none" }
              }
            >
              <span className="t-label" style={{ fontSize: "0.5625rem" }}>
                {slot.weekday}
              </span>
              <span className="slot-dot" aria-hidden="true" />
              <span className="slot-initials">{slot.initials ?? ""}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          {filled.slice(0, 3).map((slot, index) => (
            <p
              key={slot.weekday}
              className="t-mono receipt-line"
              style={{
                margin: 0,
                color: "var(--color-ink-2)",
                animationDelay: `${700 + index * 140}ms`,
              }}
            >
              {slot.initials} · {slot.channel} {slot.touchDay} → booked {slot.bookedDay} ·{" "}
              {money(VISIT_VALUE_CENTS)}
            </p>
          ))}
          <p className="t-secondary" style={{ margin: 0 }}>
            +1 more attributed this week
          </p>
        </div>
      </div>

      <figcaption className="t-secondary" style={{ marginTop: 12 }}>
        A demo week from our own test practice — fictional patients, real arithmetic. Slots fill only
        when a booking lands within 30 days of a logged touch.
      </figcaption>
    </figure>
  );
}
