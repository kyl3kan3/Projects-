/**
 * Injury-risk flags: cross-session trend windows (lumbar proxy vs load %,
 * unilateral shift, depth-load correlation). "Pattern worth attention",
 * never diagnosis — copy is fixed-template and legally reviewed.
 * TODO: implement trend regression over recent sessions, conservative
 * thresholds, flag lifecycle (create / surface at weekly review only /
 * dismiss / re-flag on new evidence), and evidence summaries
 * ("visible in 6 of your last 8 heavy sets").
 */

export type FlagKind = "lumbar_trend" | "shift_trend" | "depth_load_correlation";

export async function recomputeFlags(_liftId: string): Promise<void> {
  throw new Error("Not implemented");
}
