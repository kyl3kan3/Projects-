/**
 * src/app/(dashboard)/jobs/page.tsx
 *
 * Jobs home screen (the app's landing tab): active jobs as hairline rows
 * with jurisdiction, permit reference, and status pill; rule-change alert
 * banner slot above the list; "New job checklist" primary action pinned in
 * the thumb zone. Mobile-first at 390px per DESIGN.md.
 *
 * TODO:
 * - [ ] Server component: fetch active jobs for the session org with
 *       application status + checklist progress ("4 of 6 verified", mono).
 * - [ ] Row construction per DESIGN.md: Title address + job type, Secondary
 *       jurisdiction + mono permit ref, status pill right (NOT SUBMITTED /
 *       IN REVIEW / ISSUED / EXPIRED / STOP-WORK).
 * - [ ] Rule-change alert banner when a watched jurisdiction changed since
 *       last visit (links the diff; dismiss is a quiet action).
 * - [ ] Empty state with real content: a worked example checklist from the
 *       corpus, not a gray placeholder.
 * - [ ] "New job checklist" -> job creation flow (jurisdiction autocomplete
 *       from covered list, job-type chips).
 * - [ ] Plan-gate notice when active-job limit is reached (upgrade path,
 *       not a dead end).
 */

export default function JobsPage() {
  return null; // TODO: implement
}
