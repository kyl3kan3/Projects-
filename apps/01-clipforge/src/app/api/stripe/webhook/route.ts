import { NextResponse } from "next/server";
import { constructWebhookEvent, handleWebhook } from "@/lib/billing";

// Stripe needs the raw body for signature verification.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }
  const payload = await req.text();
  let event;
  try {
    event = constructWebhookEvent(payload, signature);
  } catch (err) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err instanceof Error ? err.message : ""}` },
      { status: 400 },
    );
  }
  try {
    await handleWebhook(event);
  } catch (err) {
    console.error("[stripe] handler error", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
