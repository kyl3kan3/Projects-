import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invitations } from "@/db/schema";
import { env } from "@/lib/env";
import { recordDeliveryEvent } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * Resend delivery events. Opens and bounces are what make the status board honest:
 * "sent" is not "read", and a bounce has to show up immediately or the estimator
 * spends a week chasing a sub who never got the invite.
 *
 * Unexercised here: no Resend account in this environment, so the signature path
 * below has never seen a real webhook. It is written to fail closed — a configured
 * secret with a bad signature is rejected.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const secret = env.resendWebhookSecret;

  if (secret) {
    const signature = req.headers.get("svix-signature") ?? req.headers.get("resend-signature");
    if (!signature || !verify(raw, signature, secret)) {
      return NextResponse.json({ error: "Bad signature" }, { status: 400 });
    }
  }

  let payload: { type?: string; data?: { email_id?: string; created_at?: string } };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  const messageId = payload.data?.email_id;
  if (!messageId) return NextResponse.json({ received: true });

  const status =
    payload.type === "email.opened"
      ? "opened"
      : payload.type === "email.bounced"
        ? "bounced"
        : payload.type === "email.delivered"
          ? "delivered"
          : null;
  if (!status) return NextResponse.json({ received: true });

  const occurredAt = payload.data?.created_at ? new Date(payload.data.created_at) : new Date();
  const invitationId = await recordDeliveryEvent({
    providerMessageId: messageId,
    status,
    occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
  });

  // An open on the invite email is a real signal that a human saw it, so the board
  // reflects it — but it never overwrites a stronger state (submitted, declined).
  if (invitationId && status === "opened") {
    const db = getDb();
    const [row] = await db.select().from(invitations).where(eq(invitations.id, invitationId));
    if (row && (row.status === "sent" || !row.openedAt)) {
      await db
        .update(invitations)
        .set({
          openedAt: row.openedAt ?? occurredAt,
          ...(row.status === "sent" ? { status: "opened" as const } : {}),
        })
        .where(eq(invitations.id, invitationId));
    }
  }

  return NextResponse.json({ received: true });
}

/** Svix-style `v1,<base64>` list. Any matching version passes. */
function verify(body: string, header: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(body).digest("base64");
  for (const part of header.split(" ")) {
    const value = part.includes(",") ? part.split(",")[1] : part;
    try {
      const a = Buffer.from(value, "base64");
      const b = Buffer.from(expected, "base64");
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      // Malformed segment; keep checking the others.
    }
  }
  return false;
}
