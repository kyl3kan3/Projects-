/**
 * src/lib/logging.ts
 *
 * Set logging with offline-outbox idempotency. The client generates
 * keys `assignment:{id}:day:{w}-{d}:ex:{rowId}:set:{i}`; the server
 * upserts by key — double-taps, retries, and replays can't duplicate.
 *
 * TODO:
 * - [ ] logSet(input): upsert by idempotency_key (onConflictDoUpdate
 *       with latest values — the client may correct a weight).
 * - [ ] openSession(assignmentId, w, d): idempotent by unique day
 *       index; stamps opened_at (the adherence signal).
 * - [ ] completeSession(sessionId, note?).
 * - [ ] progression(clientId, exerciseId): per-exercise history table
 *       (date, top set, est 1RM as plain arithmetic).
 */

export interface LogSetInput {
  workoutSessionId: string;
  programRowId: string;
  setIndex: number;
  weightGrams: number | null;
  reps: number | null;
  rpe: number | null;
  idempotencyKey: string;
}

export async function logSet(input: LogSetInput): Promise<{ loggedSetId: string }> {
  throw new Error("Not implemented");
}

export async function openSession(
  assignmentId: string,
  weekIndex: number,
  dayIndex: number,
): Promise<{ workoutSessionId: string }> {
  throw new Error("Not implemented");
}
