import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { PLANS, TRIAL_DAYS, quotaBytesFor } from "@/lib/plans";
import { stripe } from "@/lib/stripe";

const Body = z.object({ plan: z.enum(["solo", "studio", "pro"]) });

/** Our own SaaS subscription (Stripe Billing), 14-day trial. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

  const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, session.accountId) });
  if (!account) return NextResponse.json({ error: "No account" }, { status: 404 });
  const plan = PLANS[parsed.data.plan];

  let customerId = account.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe().customers.create({ email: session.email, name: account.name, metadata: { accountId: account.id } });
    customerId = customer.id;
    await db.update(schema.accounts).set({ stripeCustomerId: customerId }).where(eq(schema.accounts.id, account.id));
  }

  const checkout = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price_data: { currency: "usd", unit_amount: plan.priceMonthly * 100, recurring: { interval: "month" }, product_data: { name: `LensCRM ${plan.name}` } }, quantity: 1 }],
    subscription_data: { trial_period_days: TRIAL_DAYS, metadata: { accountId: account.id, plan: plan.id } },
    success_url: `${env.appUrl}/settings?billing=ok`,
    cancel_url: `${env.appUrl}/settings?billing=canceled`,
  });

  void quotaBytesFor;
  return NextResponse.json({ url: checkout.url });
}
