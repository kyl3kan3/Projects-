/**
 * src/lib/offline.ts
 *
 * Client-side offline machinery for the crew PWA: the IndexedDB outbox,
 * precache coordination with the service worker, and sync triggering.
 * Jobsites have no bars; this module is why the product works anyway.
 *
 * TODO:
 * - [ ] Outbox schema (idb): pending sign-offs, photos (as blobs), and
 *       instance completions, keyed by (instanceId, employeeId, deviceId).
 * - [ ] queueSignOff(entry): write-local-first, always -- even online,
 *       the outbox is the single write path (then sync immediately).
 * - [ ] syncOutbox(): drain to /api/sync with exponential backoff; partial
 *       success handling (per-entry acks); never drop an entry without a
 *       server ack.
 * - [ ] Precache contract with the Serwist worker: opening a crew link
 *       caches the talk body, roster, and shell for airplane-mode use.
 * - [ ] Connectivity state for the UI banner (offline / syncing / synced
 *       counts) -- states from DESIGN.md, never a blocking modal.
 * - [ ] Device id: stable random id in localStorage (conflict resolution
 *       key; no fingerprinting).
 */

export function queueSignOff(): Promise<void> {
  throw new Error("Not implemented");
}

export function syncOutbox(): Promise<void> {
  throw new Error("Not implemented");
}
