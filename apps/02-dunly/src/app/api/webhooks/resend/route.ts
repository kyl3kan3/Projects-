import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { readRawWebhookBody, verifyProviderWebhook } from "@/lib/provider-webhook";

export async function POST(req: Request) {
  if (!process.env.RESEND_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Webhook verification is not configured" }, { status: 503 });
  }
  let verified;
  try {
    verified = verifyProviderWebhook(await readRawWebhookBody(req), req.headers,
      process.env.RESEND_WEBHOOK_SECRET, "svix");
  } catch {
    return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
  }
  const body = verified.payload as { type?: string; data?: { email_id?: string } } | null;
  if (typeof body?.type !== "string" || typeof body.data?.email_id !== "string") {
    return NextResponse.json({ ok: true });
  }
  const statusMap: Record<string, "delivered" | "bounced" | "complained" | "clicked"> = {
    "email.delivered": "delivered", "email.bounced": "bounced",
    "email.complained": "complained", "email.clicked": "clicked",
  };
  const status = statusMap[body.type];
  if (!status) return NextResponse.json({ ok: true });
  const emailId = body.data.email_id;
  // The unique receipt and business changes share one transaction. Failures
  // roll back the receipt so provider retries can safely try again.
  await db.transaction(async (tx) => {
    const claimed = await tx.insert(schema.providerWebhookReceipts)
      .values({ id: `resend:${verified.id}` }).onConflictDoNothing().returning();
    if (!claimed.length) return;
    const msg = await tx.query.messages.findFirst({
      where: eq(schema.messages.providerMessageId, emailId),
    });
    if (!msg) throw new Error("Webhook message is not yet available; retry delivery");
    await tx.update(schema.messages).set({ status }).where(eq(schema.messages.id, msg.id));
    if (status === "bounced" || status === "complained") {
      await tx.update(schema.customers).set({ suppressedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.customers.id, msg.customerId));
    }
  });
  return NextResponse.json({ ok: true });
}
