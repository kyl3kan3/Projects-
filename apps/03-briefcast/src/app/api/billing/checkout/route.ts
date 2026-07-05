import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { PLANS, TRIAL_DAYS } from "@/lib/plans";
import { stripe } from "@/lib/stripe";

const Body = z.object({ plan: z.enum(["starter", "pro", "business"]) });

/** Per-seat Stripe subscription with a 14-day trial; quantity = active members. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

  const org = await db.query.organizations.findFirst({ where: eq(schema.organizations.id, session.orgId) });
  if (!org) return NextResponse.json({ error: "No organization" }, { status: 404 });

  const seatCount = (await db.query.users.findMany({ where: eq(schema.users.orgId, org.id) })).length || 1;
  const plan = PLANS[parsed.data.plan];

  let customerId = org.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe().customers.create({ email: session.email, name: org.name, metadata: { orgId: org.id } });
    customerId = customer.id;
    await db.update(schema.organizations).set({ stripeCustomerId: customerId }).where(eq(schema.organizations.id, org.id));
  }

  const checkout = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: plan.perSeatMonthly * 100,
          recurring: { interval: "month" },
          product_data: { name: `Briefcast ${plan.name} (per seat)` },
        },
        quantity: seatCount,
      },
    ],
    subscription_data: { trial_period_days: TRIAL_DAYS, metadata: { orgId: org.id, plan: plan.id } },
    success_url: `${env.appUrl}/settings?billing=ok`,
    cancel_url: `${env.appUrl}/settings?billing=canceled`,
  });

  return NextResponse.json({ url: checkout.url });
}
