import type { AgingReport } from "@/lib/analytics";
import { BUCKET_LABELS } from "@/lib/analytics";
import { BUCKET_FILL, BUCKET_ORDER } from "@/lib/display";
import { formatMoneyShort } from "@/lib/money";

/**
 * One horizontal band, four segments, mono bucket totals beneath. Never a pie
 * (DESIGN.md). A book with nothing outstanding shows the empty band rather than
 * disappearing, so the shape of the screen does not change under the firm.
 */
export function AgingBar({ aging }: { aging: AgingReport }) {
  const total = aging.outstandingCents;
  return (
    <div>
      <div className="aging-bar" role="img" aria-label={ariaLabel(aging)}>
        {total > 0
          ? BUCKET_ORDER.map((bucket) => {
              const amount = aging.buckets[bucket].amountCents;
              if (amount <= 0) return null;
              return (
                <span
                  key={bucket}
                  className="aging-seg"
                  style={{ width: `${(amount / total) * 100}%`, background: BUCKET_FILL[bucket] }}
                />
              );
            })
          : null}
      </div>
      <div
        className="scroll-x"
        style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}
      >
        {BUCKET_ORDER.map((bucket) => (
          <div key={bucket}>
            <div className="t-label" style={{ marginBottom: 4 }}>
              {BUCKET_LABELS[bucket]}
            </div>
            <div className="t-data" style={{ fontSize: 14 }}>
              {formatMoneyShort(aging.buckets[bucket].amountCents)}
            </div>
            <div className="t-data" style={{ color: "var(--color-text-3)", marginTop: 2 }}>
              {aging.buckets[bucket].count}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ariaLabel(aging: AgingReport): string {
  return BUCKET_ORDER.map(
    (bucket) =>
      `${BUCKET_LABELS[bucket]} days: ${formatMoneyShort(aging.buckets[bucket].amountCents)}`,
  ).join(", ");
}
