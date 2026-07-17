/**
 * src/lib/imports.ts
 *
 * POS CSV imports: saved column maps per source (Toast/Square/Clover
 * export shapes), employee matching by external id then fuzzy name,
 * and honest flags for everything unmatched or incomplete.
 *
 * TODO:
 * - [ ] parseCsv(sourceId, csvText): column map -> shift_entries
 *       drafts; unknown columns reported by name.
 * - [ ] matchEmployees(restaurantId, entries): external id ->
 *       exact name -> fuzzy (flag below threshold, never auto-accept).
 * - [ ] applyImport(shiftId, entries): write rows + flags; shift ->
 *       imported | flagged.
 */

export async function parseCsv(
  sourceId: string,
  csvText: string,
): Promise<{ rows: number; unknownColumns: string[] }> {
  throw new Error("Not implemented");
}

export async function applyImport(
  shiftId: string,
  sourceId: string,
  csvText: string,
): Promise<{ entries: number; flagged: number }> {
  throw new Error("Not implemented");
}
