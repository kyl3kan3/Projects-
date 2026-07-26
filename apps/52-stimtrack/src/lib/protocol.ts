/**
 * src/lib/protocol.ts
 *
 * Protocol-calendar domain logic: cycle-day math, phase grouping, and
 * timeline assembly. STRICTLY descriptive — this module never generates,
 * suggests, or adjusts a schedule (the wellness line is architectural).
 *
 * TODO:
 * - [ ] cycleDay(cycle, date) and stimDay(cycle, date) helpers (date-fns).
 * - [ ] Timeline assembly: protocol_event rows -> phase-grouped, day-indexed
 *       sections (STIMULATION / TRIGGER / RETRIEVAL / TRANSFER) for Calendar.
 * - [ ] Today extraction: events + due doses for a given date (Today screen).
 * - [ ] Trigger window helpers: isInsideT24(triggerAt), remaining(triggerAt)
 *       — consumed by the countdown and the Today band.
 * - [ ] Validation: warn (never block) on impossible orderings the user may
 *       have mistyped (retrieval before trigger) — phrased as questions,
 *       never as clinical direction.
 * - [ ] NO protocol templates that compute dates, NO dose math, NO
 *       predictions. Reject any such TODO in review.
 */

export {};
