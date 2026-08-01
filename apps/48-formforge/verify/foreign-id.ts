import "@/lib/load-env";
import { asc, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { intakes, practices } from "@/db/schema";

/** An intake id belonging to the *oldest* practice — i.e. somebody else's. */
async function main() {
  const db = getDb();
  const [practice] = await db.select().from(practices).orderBy(asc(practices.createdAt)).limit(1);
  const [intake] = await db
    .select()
    .from(intakes)
    .where(eq(intakes.practiceId, practice.id))
    .orderBy(asc(intakes.sentAt))
    .limit(1);
  console.log(intake.id);
  await closeDb();
}
main();
