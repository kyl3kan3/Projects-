/**
 * src/components/WeekStrip.tsx
 *
 * The week-strip and the chair-fill signature (DESIGN.md "The signature").
 *
 * Seven hygiene-slot cells: empty is porcelain with a hollow centre dot; filled is
 * a 12% aqua wash with a solid aqua dot and the patient's mono initials. Strictly
 * data-driven — a cell fills because a booking earned an attribution row.
 *
 * The four beats are CSS animations on mount, staggered 80ms apart and capped at
 * three (DESIGN.md's batching rule), with the summary line carrying the rest. No
 * JavaScript animation at all, which is why it survives
 * `prefers-reduced-motion` collapsing everything to a fade: the filled state, the
 * counter and the receipt line are all present without motion.
 *
 * A server component. Props only, no client bundle.
 */

import { Icon } from "@/components/icons";
import { money } from "@/lib/format";
import { receiptLine } from "@/lib/attribution";
import { formatDayShort } from "@/lib/dates";
import type { LedgerRow, WeekSlot } from "@/server/ledger";

export function WeekStrip({
  slots,
  recentAttributions,
  totalAttributed,
}: {
  slots: WeekSlot[];
  /** Most recent attributed bookings, newest first. */
  recentAttributions: LedgerRow[];
  totalAttributed: number;
}) {
  const filled = slots.filter((s) => s.filled).length;
  // At most three fills animate, 80ms apart; the rest are summarised.
  const animatedIndexes = slots.filter((s) => s.filled).slice(0, 3).map((s) => s.day);
  const receipts = recentAttributions.filter((r) => r.attribution).slice(0, 2);
  const moreAttributed = Math.max(0, totalAttributed - receipts.length);

  return (
    <section aria-label="This week's attributed bookings" style={{ marginTop: 8 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <p className="t-label" style={{ margin: 0 }}>
          This week
        </p>
        <p className="t-mono" style={{ margin: 0, color: "var(--color-ink-2)" }}>
          {filled} of 7 filled
        </p>
      </div>

      <div className="week-strip">
        {slots.map((slot) => {
          const animate = animatedIndexes.includes(slot.day);
          return (
            <div
              key={slot.day}
              className="slot"
              data-filled={slot.filled}
              style={
                animate
                  ? { animationDelay: `${animatedIndexes.indexOf(slot.day) * 80}ms` }
                  : { animation: "none" }
              }
              title={
                slot.filled
                  ? `${slot.bookings} attributed ${slot.bookings === 1 ? "booking" : "bookings"} on ${slot.weekdayLabel}`
                  : `No attributed booking on ${slot.weekdayLabel}`
              }
            >
              <span className="t-label" style={{ fontSize: "0.5625rem", color: "var(--color-ink-2)" }}>
                {slot.weekdayLabel}
              </span>
              <span className="slot-dot" aria-hidden="true" />
              <span className="slot-initials">
                {slot.filled ? (slot.bookings > 1 ? `+${slot.bookings}` : slot.initials) : ""}
              </span>
              <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>
                {slot.filled ? `${slot.bookings} attributed` : "empty"}
              </span>
            </div>
          );
        })}
      </div>

      {receipts.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          {receipts.map((row, i) => (
            <p
              key={row.bookingId}
              className="t-mono receipt-line"
              style={{
                margin: "6px 0 0",
                color: "var(--color-ink-2)",
                animationDelay: `${320 + i * 80}ms`,
              }}
            >
              {receiptLine({
                initials: row.patientInitials,
                channel: row.attribution!.touchChannel,
                touchLabel: formatDayShort(row.attribution!.touchOccurredAt),
                bookedLabel: formatDayShort(row.bookedAt),
                money: money(row.attribution!.productionCents),
              })}
            </p>
          ))}
          {moreAttributed > 0 && (
            <p className="t-secondary" style={{ margin: "6px 0 0" }}>
              +{moreAttributed} more attributed this month
            </p>
          )}
        </div>
      ) : (
        <p className="t-secondary" style={{ marginTop: 12, marginBottom: 0, display: "flex", gap: 8 }}>
          <Icon name="clock" size={18} style={{ flex: "none", marginTop: 2, color: "var(--color-ink-2)" }} />
          Slots fill when a booking lands within the attribution window of a touch. Nothing is filled
          in by hand.
        </p>
      )}
    </section>
  );
}
