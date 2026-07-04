/**
 * src/app/(app)/incidents/page.tsx
 *
 * Incident log + intake entry point + OSHA form downloads.
 *
 * TODO:
 * - [ ] Server component: incident rows (mono case number, employee, date,
 *       RECORDABLE pill where derived, treatment severity).
 * - [ ] **Log incident** primary -> one-question-per-screen intake flow
 *       (questions from lib/incidents data, rule text cited in Secondary,
 *       mono progress "4/9").
 * - [ ] Severe-treatment answers route to the 8/24-hour duty screen:
 *       deadline clock (mono), OSHA phone + portal info, "record what you
 *       did" field. Guidance only -- no auto-filing.
 * - [ ] Year selector + form downloads: Form 300 log, per-incident 301,
 *       the signable 300A (with posting-window reminder Feb 1 - Apr 30).
 * - [ ] Privacy-case rendering respected everywhere a name appears.
 * - [ ] Empty state: "No incidents logged this year" with the plain note
 *       that a zero-incident 300A still must be posted.
 */

export default function IncidentsPage() {
  throw new Error("Not implemented");
}
