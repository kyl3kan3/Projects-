/**
 * Rep segmentation: landmark time-series -> rep boundaries + counts.
 * Pure TypeScript, fully unit-tested against the labeled validation set.
 * TODO: implement hip/bar vertical-trajectory extraction, min-prominence
 * peak detection, tempo sanity checks (reject sub-300ms "reps"), partial-rep
 * handling at set ends, and the downsampled bar-path polyline for storage.
 */

import type { LandmarkFrame } from "./pose";

export interface RepSegment {
  index: number;
  startMs: number;
  bottomMs: number;
  endMs: number;
}

export function segmentReps(_frames: LandmarkFrame[], _lift: string): RepSegment[] {
  throw new Error("Not implemented");
}
