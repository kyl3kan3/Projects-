import "@/lib/load-env";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { signups } from "@/db/schema";
async function main() {
  const db = getDb();
  const rows = await db.select({ email: signups.email, token: signups.verifyToken, code: signups.referralCode, pos: signups.position, status: signups.status }).from(signups).where(eq(signups.email, process.argv[2]));
  console.log(JSON.stringify(rows[0]));
  await closeDb();
}
main();
