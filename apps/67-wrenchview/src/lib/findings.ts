/**
 * src/lib/findings.ts
 *
 * Plain-language findings: canned phrase + measurement -> the
 * customer sentence ("Front brake pads at 2mm — replacement
 * recommended; new pads are 10–12mm"). Composed once at tech_done,
 * advisor-editable before send.
 *
 * TODO:
 * - [ ] composeFindings(inspectionId): yellow/red items -> findings
 *       rows with interpolated measurements; urgency defaults
 *       (red -> now, yellow -> soon).
 * - [ ] buildEstimateLines(inspectionId): a draft line per "now"/
 *       "soon" finding with shop labor-rate defaults.
 * - [ ] railSummary(inspectionId): { red, yellow, green } counts for
 *       the board.
 */

export async function composeFindings(inspectionId: string): Promise<{ composed: number }> {
  throw new Error("Not implemented");
}

export async function railSummary(
  inspectionId: string,
): Promise<{ red: number; yellow: number; green: number }> {
  throw new Error("Not implemented");
}
