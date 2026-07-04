/**
 * src/db/seed-factors.ts
 *
 * Loads versioned public emission-factor sets into emission_factors:
 * EPA GHG factors, eGRID subregion grid factors, DEFRA fuel factors,
 * US EEIO spend-based factors. Idempotent; keyed by (factor_set, category,
 * region, vintage).
 *
 * TODO:
 * - [ ] Parse bundled CSV/JSON factor files from src/db/factors/.
 * - [ ] Upsert with citation + vintage on every row; never mutate a
 *       published vintage in place — new vintages are new rows.
 * - [ ] Report inserted/updated counts; fail loudly on schema drift.
 */

export async function seedFactors(): Promise<void> {
  throw new Error("Not implemented");
}
