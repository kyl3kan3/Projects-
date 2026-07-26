/**
 * app/summary.tsx — Cycle summary (PDF)
 *
 * The doctor-ready artifact: one page, one tap, rendered on device
 * (ARCHITECTURE.md flow 6). Built for second opinions and clinic handoffs.
 *
 * TODO:
 * - [ ] Preview of the page object: protocol timeline, prescriptions with
 *       dose-change history, scan table + E2/follicle chart, outcomes
 *       (retrieval counts, fertilization, transfer/freeze, storage).
 * - [ ] Cycle picker (defaults to current/most recent); Plus gate with
 *       blurred preview + paywall for free tier.
 * - [ ] "Generate PDF" -> src/lib/report HTML -> expo-print -> system share
 *       sheet; PDF typeset per DESIGN.md paper-document palette regardless
 *       of app theme.
 * - [ ] Loss-aware: ended cycles export with neutral outcome wording; the
 *       summary never editorializes.
 * - [ ] Empty state for cycles with no scans yet.
 */

export {};
