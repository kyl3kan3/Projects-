/**
 * The position poll behind the roll animation.
 *
 * Returns only that one person's standing. The referral code is a public
 * capability, so this must not leak anything about the list beyond its size —
 * which the hosted page already shows.
 */

import { queueView } from "@/lib/signups";
import { normalizeReferralCode, nextReward } from "@/lib/referrals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const code = normalizeReferralCode((await params).code);
  if (!code) return new Response("not found", { status: 404 });

  const view = await queueView(code);
  if (!view) return new Response("not found", { status: 404 });

  const next = nextReward(view.creditedReferrals, view.tiers);

  return new Response(
    JSON.stringify({
      position: view.signup.position,
      total: view.total,
      referrals: view.creditedReferrals,
      pendingReferrals: view.pendingReferrals,
      status: view.signup.status,
      nextReward: next ? { label: next.reward.label, remaining: next.remaining } : null,
    }),
    { headers: { "content-type": "application/json", "cache-control": "no-store" } },
  );
}
