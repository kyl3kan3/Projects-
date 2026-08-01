import { eq, and } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { households, invoices } from "@/db/schema";
async function main() {
  const db = getDb();
  const [h] = await db.select().from(households).where(eq(households.unitLabel, "212 Maple St"));
  const rows = await db.select().from(invoices).where(and(eq(invoices.householdId, h.id)));
  const open = rows.filter((r) => r.status !== "paid");
  console.log("PICK " + JSON.stringify({ invoiceId: open[0].id, householdId: h.id, period: open[0].periodLabel }));
  await closeDb();
}
main();
