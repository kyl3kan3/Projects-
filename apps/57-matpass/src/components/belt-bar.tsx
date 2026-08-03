/**
 * src/components/belt-bar.tsx
 *
 * The belt bar — the product's recurring object, and the carrier of the
 * stripe-seat signature. It renders identically on student rows, the kiosk card,
 * grading candidates, the batch review sheet and the landing hero.
 *
 * Construction (DESIGN.md "The belt bar"): a 12px band (16 on the kiosk) at the
 * rank's `belt_color_hex`, earned stripes as 3px canvas-gapped vertical bars at
 * the right end with a contrast-computed colour, and beneath it a 2px progress
 * hairline filling crimson toward the next requirement with the mono "18 / 24"
 * at the right.
 *
 * Deliberately a server-safe pure component: no hooks, no db import. The four
 * animation beats are CSS classes it is *told* to play, so the same component
 * serves a static roster row and a live kiosk confirmation.
 */

import { safeBeltHex, stripeColorFor } from "@/lib/belt";

export interface BeltBarProps {
  beltColorHex: string;
  rankName: string;
  stripesEarned: number;
  stripesTotal: number;
  classesDone: number;
  classesRequired: number;
  size?: "row" | "kiosk";
  /** Play beat 3 on the newest stripe: it slides in and seats with a snap. */
  seatingStripe?: boolean;
  /** Stagger index for a batch — at most three seats, 100ms apart. */
  seatIndex?: number;
  /** Play beat 2: fill the bar from this fraction (0..1) to its new value. */
  fillFrom?: number;
  /** Show the mono requirement figures at the right of the progress line. */
  showFigures?: boolean;
  /** Progress is met — the hairline reads green rather than crimson. */
  met?: boolean;
}

export function BeltBar({
  beltColorHex,
  rankName,
  stripesEarned,
  stripesTotal,
  classesDone,
  classesRequired,
  size = "row",
  seatingStripe = false,
  seatIndex = 0,
  fillFrom,
  showFigures = true,
  met = false,
}: BeltBarProps) {
  const band = safeBeltHex(beltColorHex);
  const stripe = stripeColorFor(band);
  const fraction = classesRequired > 0 ? Math.min(1, classesDone / classesRequired) : 1;
  const seatDelay = seatIndex >= 2 ? "seat-delay-2" : seatIndex === 1 ? "seat-delay-1" : "";

  const label = `${rankName}${
    stripesTotal > 0 ? `, ${stripesEarned} of ${stripesTotal} stripes` : ""
  }${classesRequired > 0 ? `, ${classesDone} of ${classesRequired} classes toward the next step` : ""}`;

  return (
    <div role="img" aria-label={label}>
      <div
        className={`belt${size === "kiosk" ? " belt-lg" : ""}`}
        style={
          {
            "--belt-band": band,
            "--belt-stripe": stripe,
          } as React.CSSProperties
        }
      >
        {Array.from({ length: stripesTotal }).map((_, i) => {
          const earned = i < stripesEarned;
          const isNewest = earned && i === stripesEarned - 1;
          return (
            <span
              key={i}
              className={[
                earned ? "belt-stripe" : "belt-stripe-empty",
                seatingStripe && isNewest ? `belt-stripe-seating ${seatDelay}` : "",
              ]
                .filter(Boolean)
                .join(" ")}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-3" style={{ marginTop: 4 }}>
        <div
          className={`progress${met ? " progress-met" : ""}${
            fillFrom === undefined ? "" : " progress-animate"
          }`}
          style={{ flex: 1 }}
        >
          <span
            style={
              {
                transform: `scaleX(${fraction})`,
                "--from-scale": fillFrom === undefined ? undefined : String(fillFrom),
              } as React.CSSProperties
            }
          />
        </div>
        {showFigures ? (
          <span className="t-data fg-2" style={{ flex: "none" }}>
            {classesRequired > 0 ? `${classesDone} / ${classesRequired}` : `${classesDone}`}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The from -> to pair on the batch review sheet and the promotion timeline: two
 * belt bars side by side, so a rank change is visible rather than described.
 */
export function BeltTransition({
  from,
  to,
  seatIndex = 0,
  animate = false,
}: {
  from: { beltColorHex: string; rankName: string; stripesEarned: number; stripesTotal: number };
  to: { beltColorHex: string; rankName: string; stripesEarned: number; stripesTotal: number };
  seatIndex?: number;
  animate?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div style={{ flex: 1, minWidth: 0 }}>
        <BeltBar
          {...from}
          classesDone={0}
          classesRequired={0}
          showFigures={false}
        />
        <p className="t-secondary fg-3" style={{ marginTop: 4 }}>
          {from.rankName}
          {from.stripesTotal > 0 ? ` · ${from.stripesEarned} stripe${from.stripesEarned === 1 ? "" : "s"}` : ""}
        </p>
      </div>
      <span className="t-data fg-3" aria-hidden="true" style={{ flex: "none" }}>
        →
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <BeltBar
          {...to}
          classesDone={0}
          classesRequired={0}
          showFigures={false}
          seatingStripe={animate}
          seatIndex={seatIndex}
        />
        <p className="t-secondary" style={{ marginTop: 4 }}>
          {to.rankName}
          {to.stripesTotal > 0 ? ` · ${to.stripesEarned} stripe${to.stripesEarned === 1 ? "" : "s"}` : ""}
        </p>
      </div>
    </div>
  );
}
