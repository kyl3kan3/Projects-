import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { queue } from "@/lib/queue";
import { stripe } from "@/lib/stripe";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return NextResponse.redirect(new URL("/dashboard?connect=denied", env.appUrl));

  let organizationId: string;
  try {
    const { payload } = await jwtVerify(state, new TextEncoder().encode(env.authSecret));
    organizationId = payload.organizationId as string;
  } catch {
    return NextResponse.redirect(new URL("/dashboard?connect=invalid", env.appUrl));
  }

  const resp = await stripe().oauth.token({ grant_type: "authorization_code", code });
  const stripeAccountId = resp.stripe_user_id!;

  await db
    .insert(schema.stripeAccounts)
    .values({ organizationId, stripeAccountId, livemode: !!resp.livemode, webhookStatus: "active" })
    .onConflictDoUpdate({
      target: schema.stripeAccounts.stripeAccountId,
      set: { organizationId, webhookStatus: "active" },
    });

  await audit(organizationId, "system", "stripe.connected", stripeAccountId);

  // 90-day historical backfill for the recovery preview, off the request path.
  await queue("cron").add("backfill-account", { stripeAccountId }, { jobId: `backfill-${stripeAccountId}` });

  return NextResponse.redirect(new URL("/dashboard?connect=ok", env.appUrl));
}
