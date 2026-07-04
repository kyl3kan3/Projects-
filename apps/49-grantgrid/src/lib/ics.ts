/**
 * src/lib/ics.ts
 *
 * Signed ICS calendar feed: every incomplete deadline in Google/Outlook
 * without OAuth. One tokenized URL per org, rotatable.
 *
 * TODO:
 * - [ ] issueToken(orgId): random token, HMAC hash stored on the org
 *       (ICS_TOKEN_SECRET); raw token only ever in the URL.
 * - [ ] rotateToken(orgId): new token, old feed 404s immediately
 *       (ROADMAP acceptance criterion).
 * - [ ] buildFeed(orgId): VCALENDAR with one VEVENT per incomplete
 *       deadline -- summary "LOI -- Gund Foundation", all-day events,
 *       stable UIDs (deadline id) so updates replace, not duplicate.
 * - [ ] Cache headers tuned for calendar pollers (they fetch hourly);
 *       ETag on the org's latest deadline update.
 * - [ ] Route handler: /api/calendar/[token]/calendar.ics.
 */

export function buildFeed(_orgId: string): string {
  throw new Error("Not implemented");
}

export function rotateToken(_orgId: string): Promise<string> {
  throw new Error("Not implemented");
}
