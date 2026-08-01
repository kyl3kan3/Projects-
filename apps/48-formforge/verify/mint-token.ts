import "@/lib/load-env";
import { desc, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { intakes, practices } from "@/db/schema";
import { reissueToken } from "@/lib/intakes";

/** Re-issue a link for the newest intake of the newest practice. */
async function main() {
  const db = getDb();
  const [practice] = await db.select().from(practices).orderBy(desc(practices.createdAt)).limit(1);
  const [intake] = await db
    .select()
    .from(intakes)
    .where(eq(intakes.practiceId, practice.id))
    .orderBy(desc(intakes.sentAt))
    .limit(1);
  const token = await reissueToken(practice.id, intake.id, {
    type: "user",
    id: null,
    label: "verification script",
  });
  console.log(token);
  await closeDb();
}
main();
