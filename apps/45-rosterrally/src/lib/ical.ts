/**
 * src/lib/ical.ts
 *
 * Calendar out: per-team read-only iCal feeds (subscribe once, changes
 * propagate) and the printable schedule.
 *
 * TODO:
 * - [ ] buildTeamFeed(teamId): ics events for published games/practices,
 *       club-local timezone, venue+field in location, stable UIDs so
 *       edits update rather than duplicate.
 * - [ ] Feed URLs signed per team (no enumeration), served from a route
 *       handler with cache headers (15-min TTL).
 * - [ ] Regenerate on publish and on edit-after-publish (schedule.ts calls
 *       in here).
 * - [ ] printableSchedule(divisionId): a clean single-page HTML view (the
 *       clubhouse corkboard still exists).
 */

export function buildTeamFeed(_teamId: string): Promise<string> {
  throw new Error("Not implemented");
}
