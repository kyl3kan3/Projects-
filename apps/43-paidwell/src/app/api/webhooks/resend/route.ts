/**
 * Resend webhook: delivery events and inbound replies.
 *
 * Stop-on-reply lives here, and it is the single most important piece of
 * deliverability *and* relationship hygiene in the product. The moment a client
 * writes back, the machine gets out of the way: the run pauses, the thread
 * surfaces on the invoice screen, and a human decides what happens next.
 *
 * Verification uses a shared secret in the `resend-signature` header. When
 * RESEND_WEBHOOK_SECRET is unset the endpoint refuses rather than accepting
 * anonymous input that could pause a firm's follow-up.
 */

import type { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { messages } from "@/db/schema";
import { recordReply } from "@/lib/sequences";
import { suggestPromiseDate } from "@/lib/promises";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ResendEvent {
  type?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
    text?: string;
    headers?: Record<string, string>;
  };
}

function verify(payload: string, signature: string | null): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.replace(/^sha256=/, ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!process.env.RESEND_WEBHOOK_SECRET) {
    return Response.json(
      { error: "RESEND_WEBHOOK_SECRET is not set; refusing to accept unsigned email events." },
      { status: 503 },
    );
  }
  const payload = await req.text();
  if (!verify(payload, req.headers.get("resend-signature"))) {
    return new Response("invalid signature", { status: 400 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(payload) as ResendEvent;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const db = getDb();
  const providerId = event.data?.email_id;

  // Delivery events: update the message we sent.
  const statusByType: Record<string, "delivered" | "bounced" | "sent"> = {
    "email.delivered": "delivered",
    "email.bounced": "bounced",
    "email.delivery_delayed": "sent",
    "email.sent": "sent",
  };
  const mapped = event.type ? statusByType[event.type] : undefined;
  if (mapped && providerId) {
    await db
      .update(messages)
      .set({ status: mapped })
      .where(eq(messages.providerMessageId, providerId));
    return new Response(null, { status: 204 });
  }

  // Inbound reply: find the message it answers, pause the run, surface it.
  if (event.type === "email.received" || event.type === "inbound.email") {
    const inReplyTo =
      event.data?.headers?.["in-reply-to"] ?? event.data?.headers?.["In-Reply-To"] ?? null;
    const reference = inReplyTo?.replace(/[<>]/g, "").split("@")[0] ?? providerId ?? null;
    if (!reference) return new Response("no reference", { status: 202 });

    const [message] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.providerMessageId, reference)));
    if (!message) return new Response("unknown thread", { status: 202 });

    const text = event.data?.text ?? "";
    await recordReply({
      firmId: message.firmId,
      invoiceId: message.invoiceId,
      messageId: message.id,
      fromEmail: event.data?.from ?? "unknown sender",
      snippet: text,
      // A guessed date is a suggestion for a human to confirm, never a promise.
      suggestedPromiseFor: suggestPromiseDate(text),
    });
    return new Response(null, { status: 204 });
  }

  return new Response(null, { status: 204 });
}
