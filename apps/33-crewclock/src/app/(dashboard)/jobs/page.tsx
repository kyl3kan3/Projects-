/**
 * src/app/(dashboard)/jobs/page.tsx
 *
 * Owner jobs list: every active job as a hairline row with the 4px
 * labor-cost bar -- foreman green under 80% of bid, amber to 100%, red
 * past it. The screen that answers "which job is eating its budget?"
 * (DESIGN.md "Mobile layout: Owner jobs list").
 *
 * TODO:
 * - [ ] Query job cost rollups (src/lib/job-costing) for the org's
 *       active jobs; amber/red bars sort to top.
 * - [ ] Row anatomy: Title job name, client in Secondary, cost bar,
 *       mono "$8,410 / $11,200 - 75%".
 * - [ ] Chip filters: Active / Over 80% / Complete.
 * - [ ] Cost bars fill once on first paint (300ms ease-out-quart), then
 *       move only on data change; reduced-motion -> instant.
 * - [ ] Empty state with real content: a sample job showing what the
 *       bar will look like, plus "Add your first job" primary action.
 * - [ ] Job detail route: cost bar full width, hours vs bid stat pair,
 *       crew-today rows with fence dots, projection line.
 * - [ ] >=768px: two-column grid; >=1024px: left rail (DESIGN.md
 *       "Responsive").
 */

export default function JobsPage() {
  throw new Error("Not implemented");
}
