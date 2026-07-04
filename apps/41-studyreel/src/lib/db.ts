/**
 * expo-sqlite setup: local_cards mirror, fsrs_state, pending_reviews,
 * settings (see ARCHITECTURE.md local data model); migration runner and
 * typed query helpers; citation-panel cache for offline recall.
 * TODO: implement migrations, transaction helpers, queue queries, and
 * cache eviction for cited audio/PDF snippets.
 */

export async function openDatabase(): Promise<unknown> {
  throw new Error("Not implemented");
}
