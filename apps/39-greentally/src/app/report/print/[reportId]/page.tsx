/**
 * src/app/report/print/[reportId]/page.tsx
 *
 * Print-CSS report route: the CSRD-lite document itself. The worker loads
 * this route in headless Chromium to produce the PDF, so screen and PDF are
 * the same artifact.
 *
 * TODO:
 * - [ ] Access via signed render token only (worker) or org session.
 * - [ ] Report pages per DESIGN.md: sheet ground, square corners, Spectral
 *       headings, ruled tables, mono figures, factor citations as footnotes.
 * - [ ] Sections: cover, methodology + boundaries, Scope 1/2 tables (both
 *       S2 methods), Scope 3 spend screen w/ disclaimer, intensity metrics.
 * - [ ] @page rules for A4/Letter; no interactive elements.
 */

export default function ReportPrintPage() {
  return null; // TODO: implement
}
