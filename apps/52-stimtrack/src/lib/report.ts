/**
 * src/lib/report.ts
 *
 * Cycle-summary builder: assembles the one-page HTML document and renders
 * it to PDF on device (ARCHITECTURE.md flow 6). This artifact is the brand
 * in a consult room.
 *
 * TODO:
 * - [ ] buildSummaryHtml(cycleId): protocol timeline, prescriptions with
 *       dose-change history, scan table (JBM columns, units), inline SVG
 *       E2/follicle chart with dose-change markers, outcomes block
 *       (retrieval counts, fertilization, transfer/freeze, storage).
 * - [ ] Typeset per DESIGN.md paper-document palette (#FDFCF9 / #1B1D1B /
 *       #2E6B5C) regardless of app theme; embedded base64 fonts so the PDF
 *       matches the specimen.
 * - [ ] One page at US Letter + A4; overflow rules (top-N scans, truncation
 *       notes) rather than a second page.
 * - [ ] renderPdf(): expo-print -> file -> expo-sharing share sheet.
 * - [ ] Neutral outcome wording for ended cycles; the summary never
 *       editorializes and never interprets values.
 */

export {};
