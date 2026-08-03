/**
 * src/db/seed.ts — `npm run db:seed`
 *
 * Idempotent seed: the built-in playbook and its rules, plus the eval-case rows for the
 * committed fixtures. Safe to re-run; it inserts what is missing and nothing else.
 *
 * It deliberately does *not* create a demo account with fake reviews. This product's
 * screens are only honest when the contracts in them are real uploads, and a stranger
 * following the README's setup section should see their own first review, not a staged
 * one.
 */

import "@/lib/load-env";
import { closeDb, getDb } from "@/db";
import { evalCases, playbookRules } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureDefaultPlaybook } from "@/lib/playbook-store";
import { FIXTURES } from "@/fixtures/contracts";

async function main(): Promise<void> {
  const db = getDb();
  const playbook = await ensureDefaultPlaybook();
  const rules = await db
    .select({ ruleKey: playbookRules.ruleKey })
    .from(playbookRules)
    .where(eq(playbookRules.playbookId, playbook.id));
  console.log(`playbook "${playbook.name}" v${playbook.version} — ${rules.length} rules`);

  for (const fixture of FIXTURES) {
    await db
      .insert(evalCases)
      .values({
        fixtureKey: fixture.key,
        name: fixture.name,
        contractType: fixture.contractType,
        expectedFlags: fixture.expectedFlags,
      })
      .onConflictDoUpdate({
        target: evalCases.fixtureKey,
        set: { name: fixture.name, expectedFlags: fixture.expectedFlags },
      });
  }
  console.log(`eval cases: ${FIXTURES.length}`);
}

main()
  .then(async () => {
    await closeDb();
  })
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
