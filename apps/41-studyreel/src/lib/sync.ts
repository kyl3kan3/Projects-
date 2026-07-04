/**
 * Review-state sync: pushes pending_reviews (append-only events) to the
 * API, pulls the merged log + card updates, recomputes FSRS locally.
 * TODO: implement device-id tagging, idempotent event upload, incremental
 * card/deck pull (approved cards only), conflict-free merge (event log is
 * the truth; state is derived), and background sync on connectivity.
 */

export async function syncNow(): Promise<void> {
  throw new Error("Not implemented");
}
