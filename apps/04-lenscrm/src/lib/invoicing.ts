/**
 * Deposit-first invoicing. On contract signature we create the retainer
 * invoice (due now — booking confirms on payment) and a draft balance invoice
 * (finalized T-14d by the scheduler). Stripe holds payment truth; our
 * `invoices` table holds business meaning (which session, deposit vs balance).
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";

export async function createDepositAndBalance(opts: {
  accountId: string;
  clientId: string;
  sessionId: string;
  priceCents: number;
  depositPercent: number;
  sessionStartsAt: Date;
  title: string;
}): Promise<{ depositId: string; balanceId: string }> {
  const depositCents = Math.round((opts.priceCents * opts.depositPercent) / 100);
  const balanceCents = opts.priceCents - depositCents;

  const [deposit] = await db
    .insert(schema.invoices)
    .values({
      accountId: opts.accountId,
      clientId: opts.clientId,
      sessionId: opts.sessionId,
      kind: "deposit",
      status: "open",
      subtotalCents: depositCents,
      totalCents: depositCents,
      dueAt: new Date(),
    })
    .returning();
  await db.insert(schema.invoiceItems).values({ invoiceId: deposit.id, description: `Retainer — ${opts.title}`, unitAmountCents: depositCents });

  const balanceDue = new Date(opts.sessionStartsAt.getTime() - 14 * 86400_000);
  const [balance] = await db
    .insert(schema.invoices)
    .values({
      accountId: opts.accountId,
      clientId: opts.clientId,
      sessionId: opts.sessionId,
      kind: "balance",
      status: "draft",
      subtotalCents: balanceCents,
      totalCents: balanceCents,
      dueAt: balanceDue,
    })
    .returning();
  await db.insert(schema.invoiceItems).values({ invoiceId: balance.id, description: `Balance — ${opts.title}`, unitAmountCents: balanceCents });

  // Create the hosted Stripe invoice for the deposit (skipped in dry-run).
  if (!env.dryRun) {
    const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, opts.clientId) });
    const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, opts.accountId) });
    if (client && account?.stripeCustomerId) {
      const inv = await stripe().invoices.create({
        customer: account.stripeCustomerId,
        collection_method: "send_invoice",
        days_until_due: 1,
        metadata: { lenscrmInvoiceId: deposit.id, kind: "deposit" },
      });
      await stripe().invoiceItems.create({ customer: account.stripeCustomerId, invoice: inv.id, amount: depositCents, currency: "usd", description: `Retainer — ${opts.title}` });
      const finalized = await stripe().invoices.finalizeInvoice(inv.id!);
      await db.update(schema.invoices).set({ stripeInvoiceId: finalized.id, hostedInvoiceUrl: finalized.hosted_invoice_url ?? null }).where(eq(schema.invoices.id, deposit.id));
    }
  }

  return { depositId: deposit.id, balanceId: balance.id };
}
