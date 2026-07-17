/**
 * src/lib/outbox.ts (client-side)
 *
 * The IndexedDB outbox (idb-keyval) that makes gym-basement logging
 * safe: every set write lands locally first, POSTs when online, and
 * drains on reconnect. Idempotency keys make the drain replay-safe.
 *
 * TODO:
 * - [ ] enqueue(setInput): write-through local, attempt POST.
 * - [ ] drain(): on online/visibilitychange — POST queued entries in
 *       order, remove on 2xx, keep on failure with backoff.
 * - [ ] pendingCount(): for the offline banner ("3 sets will sync").
 */

"use client";

import type { LogSetInput } from "./logging";

export async function enqueue(input: LogSetInput): Promise<void> {
  throw new Error("Not implemented");
}

export async function drain(): Promise<{ synced: number; remaining: number }> {
  throw new Error("Not implemented");
}

export async function pendingCount(): Promise<number> {
  throw new Error("Not implemented");
}
