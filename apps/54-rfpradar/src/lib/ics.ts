/**
 * src/lib/ics.ts
 *
 * The deadline calendar feed. Every questions/proposal/orals date in
 * `deadlines` mirrors into a per-firm ICS subscription that Google and
 * Outlook poll. The feed URL carries a signed token (jose HMAC with
 * env.icsTokenSecret); rotation revokes the old URL immediately and is
 * always audit-logged.
 *
 * TODO:
 * - [ ] mintIcsToken(firmId): signed compact JWS; store hash on firms.
 * - [ ] verifyIcsToken(token): firmId or null (constant-time hash check
 *       against firms.icsTokenHash so revoked tokens die).
 * - [ ] renderIcsFeed(firmId): VCALENDAR with one VEVENT per open
 *       deadline (UID = deadline id, DTSTART = due_at, SUMMARY = label,
 *       URL = pursuit link); completed deadlines drop out.
 * - [ ] rotateIcsToken(firmId): new token, audit_log entry.
 */

export async function mintIcsToken(firmId: string): Promise<string> {
  throw new Error("Not implemented");
}

export async function verifyIcsToken(token: string): Promise<string | null> {
  throw new Error("Not implemented");
}

export async function renderIcsFeed(firmId: string): Promise<string> {
  throw new Error("Not implemented");
}
