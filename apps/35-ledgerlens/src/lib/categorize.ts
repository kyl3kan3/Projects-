/**
 * src/lib/categorize.ts
 *
 * Categorization and vendor rules. The learned-rules layer that makes the
 * product quieter every month: one correction becomes a permanent per-vendor
 * default, applied before any model suggestion is consulted.
 *
 * TODO:
 * - [ ] normalizeVendor(raw): case-fold, strip store numbers ("HOME DEPOT
 *       #1234" -> "home depot"), collapse whitespace/punctuation.
 * - [ ] resolveCategory(orgId, vendor, modelSuggestion, modelConfidence):
 *       precedence = learned vendor rule > model suggestion above the
 *       confidence gate > review item.
 * - [ ] learnFromCorrection(orgId, vendorId, categoryId): upsert
 *       vendors.default_category_id with rule_source = "correction";
 *       corrections always win over prior rules.
 * - [ ] Seed the global Schedule-C category set (Supplies, Fuel, Meals,
 *       Insurance, Utilities, Contract labor, ...) with schedule_c_line
 *       mappings; per-org custom categories layer on top.
 * - [ ] Guard: category output is never presented as tax advice -- plain
 *       naming, disclaimers live in the UI copy, not here.
 */

export function normalizeVendor(_raw: string): string {
  throw new Error("Not implemented");
}

export function resolveCategory(): never {
  throw new Error("Not implemented");
}
