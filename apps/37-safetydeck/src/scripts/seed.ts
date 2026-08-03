/**
 * Seed the global toolbox-talk library.
 *
 * Idempotent: talks are upserted on their slug, so running this after editing a
 * talk body updates it in place rather than duplicating the library. It only
 * touches rows with `company_id IS NULL` — a customer's own custom talks are
 * never overwritten by a deploy.
 *
 * Run with `npm run db:seed`.
 */

import "@/lib/load-env";
import { closeDb, getDb } from "@/db";
import { talks } from "@/db/schema";
import { SEED_TALKS } from "@/content/talks";
import { readAloudMinutes } from "@/lib/markdown";

async function main(): Promise<void> {
  const db = getDb();
  let inserted = 0;
  let updated = 0;

  for (const [index, talk] of SEED_TALKS.entries()) {
    const values = {
      companyId: null,
      slug: talk.slug,
      title: talk.title,
      bodyMd: talk.body,
      hazardTags: talk.hazardTags,
      language: "en" as const,
      // A seeded talk is a five-minute talk by design: the read aloud plus the
      // two discussion questions at the end. `readAloudMinutes` is for custom
      // talks, where the length is whatever the customer pasted in.
      estMinutes: talk.estMinutes ?? Math.max(5, readAloudMinutes(talk.body)),
      source: "seed" as const,
      rotationOrder: index + 1,
    };
    const [row] = await db
      .insert(talks)
      .values(values)
      .onConflictDoUpdate({
        target: talks.slug,
        set: {
          title: values.title,
          bodyMd: values.bodyMd,
          hazardTags: values.hazardTags,
          estMinutes: values.estMinutes,
          rotationOrder: values.rotationOrder,
        },
      })
      .returning({ createdAt: talks.createdAt });
    // A row whose createdAt is older than a second ago was an update.
    if (row && Date.now() - row.createdAt.getTime() < 1_000) inserted += 1;
    else updated += 1;
  }

  console.info(
    `Seeded ${SEED_TALKS.length} toolbox talks (${inserted} new, ${updated} refreshed).`,
  );
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
