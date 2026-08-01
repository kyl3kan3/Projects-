import { recordClick } from "@/lib/comms";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * The tracked link. Records a click for email and a "viewed link" for SMS — the
 * honest read receipt for a channel where an open cannot be observed — then
 * redirects.
 *
 * The redirect target is validated against our own origin. An open redirector in a
 * message that goes to hundreds of parents is exactly the thing a phisher wants.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ deliveryId: string }> },
): Promise<Response> {
  const { deliveryId } = await params;
  const to = new URL(req.url).searchParams.get("to") ?? "";

  let target = `${env.appUrl}/`;
  try {
    const candidate = new URL(to, env.appUrl);
    const base = new URL(env.appUrl);
    if (candidate.origin === base.origin) target = candidate.toString();
  } catch {
    // Fall through to the safe default.
  }

  try {
    if (/^[0-9a-f-]{36}$/i.test(deliveryId)) await recordClick(deliveryId);
  } catch (err) {
    console.error("[track] click not recorded", err);
  }

  return new Response(null, {
    status: 302,
    headers: { location: target, "cache-control": "no-store" },
  });
}
