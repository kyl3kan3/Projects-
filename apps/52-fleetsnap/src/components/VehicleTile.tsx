/**
 * src/components/VehicleTile.tsx
 *
 * One vehicle on the fleet board (DESIGN.md "Vehicle tile"). The one
 * sanctioned card: everything inside is hairline rows.
 *
 * TODO:
 * - [ ] Layout: unit number Title + mono plate right, StatusPill,
 *       last-inspection line ("pre-trip · 6:42am · Reyes" in ink-3),
 *       service-due line mono ("oil due in 240 mi" -- amber when due).
 * - [ ] The stamp-at-1:28 beats on inspection landing: last pass
 *       settles -> stopwatch locks -> ROADWORTHY stamp (scale 1.15->1.0,
 *       ring 0->360° in 240ms) -> tile crossfades green. Defective:
 *       flag plants + ticket number types on. Reduced motion: direct
 *       state swap.
 * - [ ] OOS state renders the red pill + reason line; tapping opens the
 *       vehicle detail.
 * - [ ] card ground, radius 12, padding 16, hairline border; no shadows.
 */

export type VehicleTileStatus =
  | "roadworthy"
  | "due"
  | "in_shop"
  | "out_of_service"
  | "uninspected";

export interface VehicleTileProps {
  unitNumber: string;
  plate: string | null;
  status: VehicleTileStatus;
  lastInspectionLine: string | null;
  serviceDueLine: string | null;
  openDefectCount: number;
}

export function VehicleTile(_props: VehicleTileProps) {
  throw new Error("Not implemented");
}
