/**
 * src/app/(dashboard)/pipeline/page.tsx
 *
 * The pipeline -- GrantGrid's home screen (DESIGN.md "Pipeline (home)").
 * Auth.js-protected, org-scoped.
 *
 * TODO:
 * - [ ] Header: org name + Label summary (`6 ACTIVE · $83,500 PENDING`).
 * - [ ] Next-deadline banner as a pinned hairline row (flag glyph for
 *       reports; brick when overdue).
 * - [ ] Stage chip row filtering pipeline rows grouped under stage
 *       Labels; mono right column (ask · next date).
 * - [ ] Row tap -> grant detail: deadlines, workspace checklist,
 *       activity history.
 * - [ ] Pinned primary "Add grant" -> sheet (search approved funders /
 *       manual entry).
 * - [ ] ≥768px: columns-by-stage board; stage moves via drag with a
 *       button-equivalent (row overflow menu) -- gestures never the
 *       only path.
 * - [ ] Empty state: real onboarding copy pointing at profile +
 *       discovery, with three example rows (clearly sample-labeled).
 * - [ ] Loading/error states per DESIGN.md; reduced-motion compliance.
 */

export default function PipelinePage() {
  throw new Error("Not implemented");
}
