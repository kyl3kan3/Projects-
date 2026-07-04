/**
 * src/lib/issues.ts
 *
 * The violations/requests log: numbered issues, photo threads, and the
 * fair-process timeline. Institutional memory + legal defensibility.
 *
 * TODO:
 * - [ ] createIssue(associationId, kind, householdId?, title, body,
 *       photos): yearly number sequence ("2026-014"); opened by a board
 *       user or a member via the portal.
 * - [ ] appendEvent(issueId, author, body, photos, visibility): append-
 *       only; status changes and notices are events too (kind field);
 *       board_only events NEVER render in the member portal (enforce in
 *       the query layer, test in Phase 1 acceptance).
 * - [ ] sendNotice(issueId, template): emails the household (photos
 *       attached, portal link included) and records a notice_sent event
 *       with delivery status -- the "we notified you on March 3" receipt.
 *       Templates ship with review-your-governing-documents language;
 *       nothing auto-generates legal action.
 * - [ ] Photo handling: signed PUTs to R2, thumbnails, EXIF-stripped on
 *       ingest (member privacy).
 * - [ ] exportIssuePdf(issueId): the full timeline for board packets or
 *       counsel -- includes board_only content, labeled.
 * - [ ] Status transitions audit-logged; close requires a resolution note.
 */

export function createIssue(): Promise<string> {
  throw new Error("Not implemented");
}

export function appendEvent(): Promise<void> {
  throw new Error("Not implemented");
}
