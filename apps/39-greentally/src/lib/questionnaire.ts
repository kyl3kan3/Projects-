/**
 * src/lib/questionnaire.ts
 *
 * The answer bank: templates mapping period results onto common CDP/
 * EcoVadis-style questions. Figures are interpolated from emission_results
 * (never free-typed); every answer carries source_refs for provenance.
 *
 * TODO:
 * - [ ] Question template registry: framework, question_key, question_text,
 *       answer template with typed slots (figures, methodology, boundaries).
 * - [ ] generateAnswers(periodId, framework): interpolate results into
 *       templates, mark draft, attach source_refs.
 * - [ ] Regeneration preserves user tone edits outside figure slots.
 * - [ ] Custom-form mode: user pastes questions; nearest-template matching
 *       with manual fallback.
 */

export type Framework = "cdp_style" | "ecovadis_style" | "custom";

export async function generateAnswers(
  _periodId: string,
  _framework: Framework
): Promise<unknown> {
  throw new Error("Not implemented");
}
