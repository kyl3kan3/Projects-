import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { payments, webhookEvents } from "@/db/schema";
import { loadInvoice } from "@/lib/invoicing";
import { formatMoney } from "@/lib/money";
async function main() {
  const db = getDb();
  const invoiceId = "757fd4c6-74df-438a-97ba-90655d4d543f";
  const rows = await db.select().from(payments).where(eq(payments.invoiceId, invoiceId));
  const ledger = await loadInvoice(invoiceId);
  const events = await db.select().from(webhookEvents);
  console.log("payment rows:", rows.length);
  for (const r of rows) console.log("  ", r.stripePaymentIntentId, r.status, formatMoney(r.amountCents), "applied", formatMoney(r.appliedCents), "credit", formatMoney(r.creditCents));
  console.log("invoice total:", formatMoney(ledger!.totalCents), "settled:", formatMoney(ledger!.settledCents), "balance:", formatMoney(ledger!.balanceCents), "status:", ledger!.status);
  console.log("webhook_events:", events.map((e) => `${e.source}/${e.eventId}`).join(", "));
  await closeDb();
}
main();
