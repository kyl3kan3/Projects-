/**
 * src/lib/links.ts
 *
 * Signed parent link-pages: the no-app, no-login surface where parents
 * see schedules, read announcements, claim volunteer slots, and check
 * payment state. One durable signed link per household.
 *
 * TODO:
 * - [ ] createHouseholdLink(householdId): JWT (jose) with LINK_TOKEN_SECRET,
 *       long-lived but revocable (key rotation via households.signed_link_key).
 * - [ ] resolve(token): household + its players' teams -> scoped page data
 *       (never another household's children — test this hard).
 * - [ ] Tracked-view links inside SMS (the honest read-receipt for SMS).
 * - [ ] Per-announcement and per-claim deep links that land inside the
 *       household page.
 * - [ ] Rate limiting + token misuse alarms (children's data behind these).
 */

export function resolveHouseholdLink(_token: string): Promise<{
  householdId: string;
}> {
  throw new Error("Not implemented");
}
