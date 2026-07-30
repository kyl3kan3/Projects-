/**
 * src/app/(dashboard)/roster/page.tsx
 *
 * The roster: households, members, portal links, and turnover-proof
 * history.
 *
 * TODO:
 * - [ ] Server component: household rows (unit + primary member, member
 *       count, autopay/SMS badges), search by unit or name.
 * - [ ] Household sheet: members with contact info, portal-link resend /
 *       revoke, SMS opt-in state (read-only here -- consent is the
 *       member's action), join/leave history.
 * - [ ] CSV import flow with dry-run preview (imported/skipped counts)
 *       before commit.
 * - [ ] Ownership change flow: close household (left_on) + open successor
 *       -- balances never silently transfer.
 * - [ ] Roster export (the board-turnover artifact).
 * - [ ] Member-limit gate with upgrade prompt at plan cap.
 */

export default function RosterPage() {
  return null; // TODO: implement
}
