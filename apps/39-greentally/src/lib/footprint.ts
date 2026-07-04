/**
 * src/lib/footprint.ts
 *
 * The emissions engine. Deterministic and replayable: results are a pure
 * function of (activity_lines, spend_lines, factor set, engine_version).
 * Every result row carries its provenance (factor id + source line id).
 *
 * TODO:
 * - [ ] computeScope1(lines, factors): fuel quantities x combustion factors.
 * - [ ] computeScope2(lines, site, factors): location-based (eGRID/national
 *       grid by site.grid_region) AND market-based (residual mix; contract
 *       instruments if provided) — always both.
 * - [ ] computeScope3Spend(spendLines, factors): EEIO kgCO2e/$ multiply,
 *       labeled screening estimate.
 * - [ ] recomputePeriod(periodId): delete + rebuild emission_results in a
 *       transaction; bump nothing unless inputs changed (idempotency test).
 * - [ ] Intensity metrics (tCO2e / revenue, / FTE) + coverage snapshot.
 * - [ ] ENGINE_VERSION constant; results stamped with it.
 */

export const ENGINE_VERSION = "0.1.0";

export async function recomputePeriod(_periodId: string): Promise<void> {
  throw new Error("Not implemented");
}
