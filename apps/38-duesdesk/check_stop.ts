import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { members } from "@/db/schema";
async function main() {
  const db = getDb();
  const rows = await db.select().from(members).where(eq(members.phone, "+16145550142"));
  for (const r of rows) console.log(r.name, "smsOptIn:", r.smsOptIn, "optedOutAt:", r.smsOptedOutAt?.toISOString().slice(0,19));
  await closeDb();
}
main();
