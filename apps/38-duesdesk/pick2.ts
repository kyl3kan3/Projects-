import { eq, and } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { households, invoices } from "@/db/schema";
async function main() {
  const db = getDb();
  const [h] = await db.select().from(households).where(eq(households.unitLabel, "208 Maple St"));
  const rows = await db.select().from(invoices).where(and(eq(invoices.householdId, h.id)));
  const open = rows.filter((r) => r.status !== "paid").sort((a,b) => a.dueOn < b.dueOn ? -1 : 1);
  console.log(open[0].id);
  await closeDb();
}
main();
