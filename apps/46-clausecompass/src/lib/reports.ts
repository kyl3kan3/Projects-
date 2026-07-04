/**
 * src/lib/reports.ts
 *
 * Report assembly and export: the clause map, flags, explanations, and
 * redlines rendered as the in-app report, a shareable link, and a PDF
 * with the not-legal-advice banner on every page.
 *
 * TODO:
 * - [ ] assemble(contractId): ordered report model (HIGH first), coverage
 *       strip figures, provenance (playbook_version + model_version).
 * - [ ] PDF via @react-pdf/renderer: DESIGN.md print spec — serif quotes,
 *       sans explanations, mono citations, banner on EVERY page, page
 *       numbers; store in R2, presigned download.
 * - [ ] Share tokens (jose, SHARE_TOKEN_SECRET): read-only report links,
 *       revocable, expiring.
 * - [ ] Report-ready email (Resend) with the flag summary in text.
 * - [ ] Completeness invariant: every clauses row and every flags row for
 *       the contract appears in the report (test proves it).
 * - [ ] Retention: report + source deleted at retention_expires_at; delete
 *       flow re-states the promise (audit-logged).
 */

export function assemble(_contractId: string): Promise<unknown> {
  throw new Error("Not implemented");
}

export function exportPdf(_contractId: string): Promise<string> {
  throw new Error("Not implemented");
}
