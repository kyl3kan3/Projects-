import { NextRequest, NextResponse } from "next/server";
import { getRecoveryPreview } from "@/lib/analytics";
import { planRecovery } from "@/lib/campaigns";
import { backfillAccount } from "@/lib/stripe";

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account") ?? "acct_demo_recovery";
  const backfill = await backfillAccount(accountId);
  const preview = await getRecoveryPreview(accountId);
  const plan = planRecovery("fail_demo", "campaign_default");

  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("application/json")) {
    return NextResponse.json({
      accountId,
      backfill,
      preview,
      scheduledRetries: plan.retries.length,
      scheduledMessages: plan.messages.length,
    });
  }

  return NextResponse.redirect(new URL(`/dashboard?backfilled=1&preview=${preview.likelyRecoveredCents}`, request.url));
}
