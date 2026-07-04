import { NextRequest, NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { getPlatformStripe } from "@/lib/stripe";

const planPrices: Record<string, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  growth: process.env.STRIPE_PRICE_GROWTH,
  scale: process.env.STRIPE_PRICE_SCALE,
  performance: process.env.STRIPE_PRICE_PERFORMANCE,
};

export async function GET(request: NextRequest) {
  const plan = request.nextUrl.searchParams.get("plan") ?? "growth";
  const priceId = planPrices[plan];

  if (serverEnv.dryRun || !serverEnv.stripeSecretKey || !priceId) {
    return NextResponse.redirect(new URL(`/settings?billing=dry-run&plan=${encodeURIComponent(plan)}`, request.url));
  }

  const session = await getPlatformStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${serverEnv.appUrl}/settings?billing=active`,
    cancel_url: `${serverEnv.appUrl}/settings?billing=canceled`,
  });

  return NextResponse.redirect(session.url ?? new URL("/settings?billing=created", request.url));
}
