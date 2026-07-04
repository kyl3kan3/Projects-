/**
 * Pose pipeline: vision-camera frame processor -> TFLite pose model ->
 * landmark ring buffer. Runs on the camera thread via worklets; JS receives
 * downsampled landmark frames only.
 * TODO: implement model load/warm-up, 30fps budget enforcement (drop frames,
 * never queue), landmark smoothing (One Euro filter), framing-grade
 * computation (subject visibility, angle heuristics per lift).
 */

export interface LandmarkFrame {
  timestampMs: number;
  /** 17-33 keypoints depending on model; normalized image coords + score. */
  keypoints: Array<{ x: number; y: number; score: number }>;
}

export type FramingGrade = "good" | "marginal" | "rejected";

export function gradeFraming(_frames: LandmarkFrame[], _lift: string): FramingGrade {
  throw new Error("Not implemented");
}
