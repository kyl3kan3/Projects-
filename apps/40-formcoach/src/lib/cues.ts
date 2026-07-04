/**
 * Cue engine: per-lift geometry over rep segments -> ranked, severity-
 * calibrated cues in plain lifter language. The trust core of the product.
 * TODO: implement squat (depth w/ camera-angle tolerance, knee tracking,
 * torso collapse, bar path vs mid-foot), deadlift (bar drift, hips-rise-
 * early, lumbar-flexion proxy), bench (touch consistency, J-curve, elbow
 * proxy); confidence gating — emit NOTHING below threshold; phrasing table
 * calibrated to certainty ("likely ~1 inch high", never "FAIL").
 */

export type Severity = "clean" | "borderline" | "fault";

export interface RepCue {
  cueId: string;
  severity: Severity;
  /** e.g. "Cut ~4 cm high" */
  headline: string;
  /** e.g. "Sit back and touch the box depth you hit on rep 1." */
  fix: string;
  metric?: { label: string; value: number; unit: string };
}

export function analyzeRep(_lift: string, _segment: unknown, _frames: unknown): RepCue[] {
  throw new Error("Not implemented");
}
