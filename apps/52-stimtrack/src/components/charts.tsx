/**
 * src/components/charts.tsx
 *
 * Hand-rolled SVG chart marks (DESIGN.md "Trend chart"): the E2 and
 * lead-follicle progression charts and the dose-change markers.
 *
 * TODO:
 * - [ ] LineChart: 2px viridian line on a hairline grid, JBM ink-3 axis
 *       labels, scan-day ticks only, no chart junk; renders from the
 *       repositories' progression series.
 * - [ ] DoseChangeMarker: 1.5px vertical viridian rule, 6px square at the
 *       top axis, JBM date label (also used by the summary PDF's inline SVG).
 * - [ ] Follicle detail: per-ovary JBM size chips layout (not a chart —
 *       counts stay literal).
 * - [ ] Empty/sparse states: one scan renders a point + teaching caption,
 *       never a fake line.
 * - [ ] Reduced motion: no draw-in animation; charts appear complete.
 * - [ ] Signal color NEVER appears in charts (DESIGN.md hard rule).
 */

export {};
