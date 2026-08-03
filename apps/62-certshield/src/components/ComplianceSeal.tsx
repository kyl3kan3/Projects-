/**
 * ComplianceSeal — the one gold on the screen (DESIGN.md's signature detail).
 *
 * A 20px seal ring with an inner tick, stamped beside an engagement that evaluates
 * COMPLIANT. `press` runs the embosser animation (1.15 → 1.0, 140ms settle) on
 * mount, which is the moment a verdict flips to compliant on screen; reduced motion
 * lands on the final state.
 *
 * Deficient states render NO icon. They render the sentence — that is the rule the
 * whole design hangs off, so this component refuses to be a generic status badge:
 * it takes `earned`, and when nothing is earned it renders nothing.
 */

import { IconSeal } from "@/components/icons";

export function ComplianceSeal({
  earned,
  press = false,
  size = 20,
  title = "Compliant — every required line met",
}: {
  earned: boolean;
  press?: boolean;
  size?: number;
  title?: string;
}) {
  if (!earned) return null;
  return (
    <span className="seal" data-press={press ? "true" : undefined} title={title}>
      <IconSeal size={size} />
      <span className="sr-only" style={{ position: "absolute", left: -9999 }}>
        {title}
      </span>
    </span>
  );
}
