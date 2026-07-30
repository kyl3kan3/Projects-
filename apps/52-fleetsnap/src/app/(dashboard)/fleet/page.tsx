/**
 * src/app/(dashboard)/fleet/page.tsx
 *
 * The office home screen: the fleet board (DESIGN.md "Fleet board").
 * Answers the morning question: is every truck roadworthy, and what's
 * due?
 *
 * TODO:
 * - [ ] requireUser(); load vehicles with last inspection, open defect
 *       counts, OOS flags, and next-due service lines.
 * - [ ] Header: Label "TUESDAY · 6 ON THE ROAD" + hero stat "11 of 12"
 *       roadworthy with the 4px hairline track filled green, Secondary
 *       "1 out of service · 2 services due".
 * - [ ] Filter chips: All / Due / In shop / OOS.
 * - [ ] VehicleTile per vehicle (see components/VehicleTile.tsx); the
 *       stamp-at-1:28 signature plays when an inspection lands (poll or
 *       stream); reduced-motion falls back to a direct state swap.
 * - [ ] Thumb-zone primary: "New work order"; "Export DVIRs" quiet
 *       action in the header.
 * - [ ] Empty state (no vehicles yet): the three first-run cards -- add
 *       vehicles, text the first driver link ("Reyes can inspect T-12
 *       right now"), review the FMCSA default template.
 */

export default async function FleetBoardPage() {
  return null; // TODO: implement
}
