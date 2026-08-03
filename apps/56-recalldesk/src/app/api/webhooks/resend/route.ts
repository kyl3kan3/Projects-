/**
 * Resend webhook: delivery, bounce, and complaint events.
 *
 * A hard bounce flags the patient's address (`email_bounced_at`) and a spam
 * complaint is treated as an unsubscribe — permanently. Both are suppression
 * hygiene: continuing to send to either is how a dental practice's sending domain
 * ends up in a spam folder for every patient at once.
 *
 * Signed with Svix headers when `RESEND_WEBHOOK_SECRET` is set. Without a secret
 * configured the endpoint refuses rather than trusting anonymous suppression
 * requests.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { applyProviderEvent } from "@/server/campaigns";
import { recordWebhookEvent } from "@/server/billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ResendEvent {
  type?: string;
  created_at?: string;
  data?: { email_id?: string; to?: string[] };
}

function verify(raw: string, headers: Headers): boolean {
  const secret = env.resendWebhookSecret;
  if (!secret) return false;
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatureHeader = headers.get("svix-signature");
  if (!id || !timestamp || !signatureHeader) return false;

  // Svix secrets are "whsec_<base64>"; the HMAC key is the decoded remainder.
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${raw}`).digest("base64");

  for (const part of signatureHeader.split(" ")) {
    const [, value] = part.split(",");
    if (!value) continue;
    const a = Buffer.from(expected);
    const b = Buffer.from(value);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  if (!verify(raw, req.headers)) {
    return Response.json({ error: "unverified" }, { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(raw) as ResendEvent;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const emailId = event.data?.email_id;
  const type = event.type ?? "";
  if (!emailId) return Response.json({ received: true });

  const fresh = await recordWebhookEvent({
    provider: "resend",
    externalId: `${emailId}:${type}`,
    type,
    payload: { emailId, type },
  });
  if (!fresh) return Response.json({ received: true, duplicate: true });

  if (type === "email.delivered") {
    await applyProviderEvent({ providerMessageId: emailId, event: "delivered", channel: "email" });
  } else if (type === "email.bounced") {
    await applyProviderEvent({ providerMessageId: emailId, event: "bounced", channel: "email" });
  } else if (type === "email.complained") {
    await applyProviderEvent({ providerMessageId: emailId, event: "complained", channel: "email" });
  }

  return Response.json({ received: true });
}
