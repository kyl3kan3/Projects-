/**
 * src/lib/retention.ts
 *
 * The drop-off alarm: personal-baseline attendance detection and the flag
 * workflow. Fires while the student is still saveable.
 *
 * TODO:
 * - [ ] scanSchool(): nightly — per active student, recent cadence
 *       (trailing 3 weeks) vs their own baseline (trailing 12 weeks).
 *       Flag when recent < RETENTION_BASELINE_FRACTION x baseline AND
 *       days since last check-in >= RETENTION_MIN_DAYS_ABSENT.
 * - [ ] Exclusions (each with a test): paused students, students newer
 *       than 4 weeks (no baseline yet), already-open flags (one open flag
 *       per student).
 * - [ ] autoRecover(): an open flag closes itself as recovered when
 *       check-ins resume to >= baseline fraction.
 * - [ ] disposition(): contacted (with note) / recovered / lost —
 *       handled_by + audit row; feeds the monthly tally
 *       ("7 flags, 4 recovered").
 * - [ ] flagList(): open flags sorted by days-since-seen with the mono
 *       figures for the flag card ("last seen 19 days ago · was 3x/week").
 */

export async function scanSchool(_schoolId: string): Promise<{
  flagged: number;
  autoRecovered: number;
}> {
  // TODO: implement per ARCHITECTURE.md key flow 4
  throw new Error("Not implemented");
}
