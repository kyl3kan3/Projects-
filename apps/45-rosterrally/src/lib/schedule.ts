/**
 * src/lib/schedule.ts
 *
 * Schedule building and publishing: venues/fields, games/practices, CSV
 * import, and the publish gate that refuses to email a broken schedule.
 *
 * TODO:
 * - [ ] CRUD for venues (with field labels) and games/practices; timezone
 *       handling via date-fns-tz (club-local always displayed).
 * - [ ] importCsv(seasonId, file): column mapping, dry-run preview with
 *       per-row errors before commit.
 * - [ ] publish(seasonId): runs conflicts.check; HARD conflicts block,
 *       SOFT require explicit override; on success stamps published_at,
 *       regenerates iCal feeds (src/lib/ical.ts), fans out the schedule
 *       announcement, schedules game-day reminders.
 * - [ ] Edit-after-publish: re-check conflicts, re-fan-out ONLY to teams
 *       whose games changed, update feeds.
 * - [ ] getWeek(seasonId, weekStart): day-grouped rows for the mobile
 *       builder and the ≥768px week grid.
 */

export function publish(_seasonId: string): Promise<void> {
  throw new Error("Not implemented");
}
