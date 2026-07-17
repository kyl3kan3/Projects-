/**
 * ComplianceSeal — the one gold on the screen (DESIGN.md).
 *
 * A 20px seal ring with inner tick, stamped beside compliant
 * engagements; the press animation (1.15 -> 1.0, 140ms) runs when a
 * verdict flips to compliant. Deficient states render NO icon — they
 * render the sentence.
 *
 * TODO: props { earned: boolean }; press keyframes; reduced-motion
 * static.
 */

export function ComplianceSeal({ earned }: { earned: boolean }) {
  void earned;
  return <span className="seal">Not implemented</span>;
}
