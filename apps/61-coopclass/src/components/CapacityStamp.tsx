/**
 * CapacityStamp — the signature element (DESIGN.md).
 *
 * Plex Mono fraction ("8/12") that ticks as seats fill; at capacity it
 * rotates 2 degrees and stamps "FULL — WAITLIST" in brick-outlined
 * small caps. Rendered on class cards, the grid, the portal, and the
 * landing device.
 *
 * TODO: props { enrolled, capacity, waitlisted }; tick keyframes;
 * stamp rotate-settle; reduced-motion final state.
 */

export interface CapacityStampProps {
  enrolled: number;
  capacity: number;
  waitlisted: number;
}

export function CapacityStamp(props: CapacityStampProps) {
  void props;
  return <span className="stamp mono">Not implemented</span>;
}
