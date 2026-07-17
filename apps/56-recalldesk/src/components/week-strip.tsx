/**
 * src/components/week-strip.tsx
 *
 * The week-strip + chair-fill signature (DESIGN.md "The signature").
 * Dashboard hero component and the landing page's device.
 *
 * TODO:
 * - [ ] 7 columns of hygiene-slot cells (radius 8, hairline): empty =
 *       porcelain + hollow dot; filled = 12% aqua wash + aqua dot + mono
 *       initials. Strictly data-driven from attributed bookings.
 * - [ ] Four beats on a new attribution: slot fills (200ms ease-out-quart)
 *       -> initials seat (120ms) -> recovered counter rolls up
 *       odometer-style (spring-gentle <=300ms) -> receipt line slides in
 *       ("R.M. · SMS Jun 30 -> booked Jul 8 · $310").
 * - [ ] Batched (nightly) attributions: max 3 fills, 80ms apart, then
 *       "+4 more attributed overnight" summary line.
 * - [ ] prefers-reduced-motion: filled state + direct counter swap +
 *       summary line only.
 * - [ ] Haptic on fill (native only, never load-bearing).
 */

export type WeekStripProps = {
  locationId: string;
  recoveredCents: number;
};

export function WeekStrip(_props: WeekStripProps) {
  // TODO: implement per DESIGN.md "The signature — the chair fills"
  return null;
}
