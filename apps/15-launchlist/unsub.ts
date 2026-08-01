import "@/lib/load-env";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { signups } from "@/db/schema";
import { unsubscribeUrlFor } from "@/lib/signups";
async function main() {
  const db = getDb();
  const [r] = await db.select().from(signups).where(eq(signups.email, "http-q3@example.com"));
  console.log(unsubscribeUrlFor(r.id));
  await closeDb();
}
main();
