/**
 * src/lib/osha-forms.ts
 *
 * OSHA Form 300 / 301 / 300A rendering with pdf-lib. The government
 * artifact is the deliverable; layouts must match the official forms
 * closely enough that an inspector recognizes them instantly.
 *
 * TODO:
 * - [ ] render300(companyId, year): the log -- one row per recordable
 *       incident (case number, name or "privacy case", job title, date,
 *       where, description, classification columns, day counts).
 * - [ ] render301(incidentId): the incident detail report.
 * - [ ] render300A(companyId, year): the annual summary -- totals from the
 *       300 rows + establishment info + employment/hours denominators from
 *       companies; signature block for certification; posting-window note
 *       (Feb 1 - Apr 30).
 * - [ ] Totals math from integer counts only; a 300A whose totals disagree
 *       with its 300 is a build failure (assert in the renderer).
 * - [ ] Version stamp (FORM_LOGIC_VERSION + generated_at) discreetly in
 *       the footer; store artifacts in osha_forms + R2.
 * - [ ] Reporting-year variants: form layouts keyed by year so a rules
 *       change never rewrites past artifacts.
 */

export function render300(): Promise<Uint8Array> {
  throw new Error("Not implemented");
}

export function render300A(): Promise<Uint8Array> {
  throw new Error("Not implemented");
}
