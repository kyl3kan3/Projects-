/**
 * expo-sqlite setup: schema migrations for lifts, sets, analyses, reps,
 * flags, sessions, settings (see ARCHITECTURE.md data model); typed query
 * helpers; clip retention pruning (free: 30 days, with prior notice).
 * TODO: implement migration runner, transaction helpers, and the weekly
 * free-tier counter queries (computed locally, never from network).
 */

export async function openDatabase(): Promise<unknown> {
  throw new Error("Not implemented");
}
