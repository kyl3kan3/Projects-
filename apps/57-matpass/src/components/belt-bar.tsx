/**
 * src/components/belt-bar.tsx
 *
 * The belt bar — the product's recurring object, and the stripe-seat
 * signature animation (DESIGN.md "The signature"). Appears identically on
 * student rows, the kiosk card, grading candidates, and the landing hero.
 *
 * TODO:
 * - [ ] Band: height 12 (kiosk 16), radius 4, filled with the rank's
 *       belt_color_hex (data, not chrome); earned stripes as 3px
 *       canvas-gapped vertical bars at the right end; stripe color
 *       computed for contrast (white-on-dark belts, dark-on-light for
 *       white/yellow).
 * - [ ] Progress hairline beneath (2px): fills crimson toward the next
 *       requirement; mono "18 / 24" at the right.
 * - [ ] Beats: counter tick (120ms odometer) -> bar fill (200ms
 *       ease-out-quart) -> on promotion, stripe slides in from the right
 *       and seats with a snap (spring-snappy ~180ms, 2px overshoot) ->
 *       mono record line fades up ("Blue · 2nd stripe · Jul 17 2026 ·
 *       Prof. Reyes").
 * - [ ] Check-ins play beats 1-2 only; grading batches stagger max 3
 *       seats, 100ms apart, then "14 promotions recorded".
 * - [ ] prefers-reduced-motion: stripe appears seated with <=100ms fade;
 *       direct counter swap.
 */

export type BeltBarProps = {
  beltColorHex: string;
  rankName: string;
  stripesEarned: number;
  stripesTotal: number;
  classesDone: number;
  classesRequired: number;
  size?: "row" | "kiosk";
};

export function BeltBar(_props: BeltBarProps) {
  // TODO: implement per DESIGN.md "The belt bar" + "The signature"
  return null;
}
