import "@/lib/load-env";
import { and, eq, isNotNull, like } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { signups } from "@/db/schema";
async function main() {
  const db = getDb();
  const rows = await db.select().from(signups).where(and(like(signups.email, "http-q%"), eq(signups.status, "pending")));
  for (const r of rows) {
    const res = await fetch(`http://localhost:3015/verify/${r.verifyToken}`, { redirect: "manual" });
    console.log(r.email, res.status);
  }
  await closeDb();
}
main();
