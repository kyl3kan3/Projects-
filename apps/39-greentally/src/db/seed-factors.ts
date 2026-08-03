/**
 * src/db/seed-factors.ts
 *
 * Loads the bundled factor sets into `emission_factors`. Idempotent: keyed on
 * (factor_set, category, region, vintage), so re-running updates the value and
 * citation of a row already present and inserts anything new.
 *
 * A published vintage is never mutated into a different vintage — that is the point
 * of putting the vintage in the key. Next year's EPA release is new rows, and last
 * year's report still resolves its factor ids.
 *
 * Run: `npm run db:seed-factors`
 */

import "@/lib/load-env";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { emissionFactors } from "@/db/schema";
import { FACTOR_SEEDS } from "@/db/factors";

export async function seedFactors(): Promise<{ inserted: number; updated: number }> {
  const db = getDb();
  let inserted = 0;
  let updated = 0;

  for (const seed of FACTOR_SEEDS) {
    const [existing] = await db
      .select({ id: emissionFactors.id, micro: emissionFactors.kgco2ePerUnitMicro })
      .from(emissionFactors)
      .where(
        and(
          eq(emissionFactors.factorSet, seed.factorSet),
          eq(emissionFactors.category, seed.category),
          eq(emissionFactors.region, seed.region),
          eq(emissionFactors.vintage, seed.vintage),
        ),
      );

    if (!existing) {
      await db.insert(emissionFactors).values(seed);
      inserted += 1;
      continue;
    }

    await db
      .update(emissionFactors)
      .set({
        unit: seed.unit,
        kgco2ePerUnitMicro: seed.kgco2ePerUnitMicro,
        citation: seed.citation,
        scope: seed.scope,
        label: seed.label,
      })
      .where(eq(emissionFactors.id, existing.id));
    if (existing.micro !== seed.kgco2ePerUnitMicro) updated += 1;
  }

  return { inserted, updated };
}

// Only run when invoked directly, so importing this file from a test is harmless.
const invokedDirectly = process.argv[1]?.includes("seed-factors");
if (invokedDirectly) {
  seedFactors()
    .then(({ inserted, updated }) => {
      console.log(
        `emission_factors: ${inserted} inserted, ${updated} value(s) changed, ${FACTOR_SEEDS.length} in the bundled sets.`,
      );
      return closeDb();
    })
    .catch(async (err) => {
      console.error("Factor seed failed:", err);
      await closeDb();
      process.exit(1);
    });
}
