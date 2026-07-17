/**
 * src/lib/enrollment.ts
 *
 * THE product: the atomic enrollment transaction. All checks inside one
 * transaction with the class row locked (SELECT ... FOR UPDATE):
 *   1. registration window open for the family's tier
 *   2. capacity remaining
 *   3. student grade within band
 *   4. prerequisite met
 *   5. student not already enrolled that period (any class)
 *   6. class room/teacher consistency (schema-guarded)
 * Failures throw EnrollmentError with the human sentence the portal
 * renders verbatim ("Noah is already in Room 4 that period").
 *
 * TODO:
 * - [ ] enroll(studentId, classId): the transaction; full class ->
 *       waitlist offer with honest position.
 * - [ ] drop(enrollmentId): frees the seat, enqueues promote-waitlist.
 * - [ ] promoteNext(classId): atomic promotion re-running all checks;
 *       claim-link flow (48h) handled by the worker.
 * - [ ] Race test: two concurrent enrolls, one seat -> exactly one
 *       enrolled row (the build's centerpiece test).
 */

export class EnrollmentError extends Error {
  constructor(
    public reason:
      | "window_closed"
      | "full"
      | "grade_band"
      | "prerequisite"
      | "period_conflict",
    public sentence: string,
  ) {
    super(sentence);
  }
}

export async function enroll(
  studentId: string,
  classId: string,
): Promise<{ status: "enrolled" | "waitlisted"; waitlistPosition?: number }> {
  throw new Error("Not implemented");
}

export async function drop(enrollmentId: string): Promise<void> {
  throw new Error("Not implemented");
}
