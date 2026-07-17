/**
 * src/components/DeltaChip.tsx
 *
 * The exposure chip (DESIGN.md "Delta chip"): height 28, radius 8, mono.
 * Colored by YOUR exposure, never by market direction.
 *
 * Mapping:
 *  - amber "UNDERCUT −$5.00"
 *  - green "ADVANTAGE +$3.20"
 *  - red   "BELOW FLOOR"
 *  - muted "NO RIVALS IN STOCK"
 *
 * TODO:
 * - [ ] Mono label with explicit sign and value -- deltas always carry
 *       text; nothing is color-only.
 * - [ ] Reveal beat 4: settles in with spring-snappy; reduced motion
 *       appears complete.
 */

export type ExposureTone = "amber" | "green" | "red" | "muted";

export interface DeltaChipProps {
  tone: ExposureTone;
  label: string; // "UNDERCUT −$5.00"
}

export function DeltaChip(_props: DeltaChipProps) {
  throw new Error("Not implemented");
}
