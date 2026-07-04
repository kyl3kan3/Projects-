/**
 * FSRS scheduling engine: pure TypeScript, unit-tested, deterministic.
 * Computes per-card stability/difficulty/due-date from the merged review
 * log so any device recomputes identical state after sync.
 * TODO: implement FSRS-4.5 update rules, daily queue selection (due +
 * new-card ration), grade application, and the property test harness
 * (two offline devices reconcile identically).
 */

export type Grade = "again" | "hard" | "good" | "easy";

export interface FsrsState {
  stability: number;
  difficulty: number;
  dueAt: string;
}

export function applyReview(_state: FsrsState | null, _grade: Grade, _at: string): FsrsState {
  throw new Error("Not implemented");
}
