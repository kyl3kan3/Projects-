import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { cardUpdateDemo } from "@/lib/sample-data";
import { createCardUpdateSetupIntent } from "@/lib/stripe";
import { signCardUpdateToken, verifyCardUpdateToken } from "@/lib/tokens";

const cardUpdateSchema = z.object({
  token: z.string().min(1).optional(),
  customerId: z.string().min(1).optional(),
  stripeAccountId: z.string().min(1).optional(),
});

export async function GET() {
  const token = await signCardUpdateToken({
    organizationId: "org_demo",
    stripeAccountId: "acct_demo_recovery",
    customerId: "cus_demo",
    paymentFailureId: "fail_cedar",
    amountCents: cardUpdateDemo.amountCents,
  });

  return NextResponse.json({
    token,
    url: `${serverEnv.appUrl}/card-update/${token}`,
  });
}

export async function POST(request: NextRequest) {
  const body = cardUpdateSchema.parse(await request.json());
  const payload = body.token && body.token !== cardUpdateDemo.token ? await verifyCardUpdateToken(body.token) : null;
  const customerId = body.customerId ?? payload?.customerId ?? "cus_demo";
  const stripeAccountId = body.stripeAccountId ?? payload?.stripeAccountId ?? "acct_demo_recovery";

  if (serverEnv.dryRun || !serverEnv.stripeSecretKey) {
    return NextResponse.json({
      mode: "dry-run",
      setupIntentId: "seti_dry_card_update",
      clientSecret: "seti_dry_card_update_secret_demo",
      customerId,
      stripeAccountId,
    });
  }

  const setupIntent = await createCardUpdateSetupIntent(stripeAccountId, customerId);
  return NextResponse.json({
    mode: "live",
    setupIntentId: setupIntent.id,
    clientSecret: setupIntent.client_secret,
    customerId,
    stripeAccountId,
  });
}
