import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Resend delivery webhooks: bounces and complaints feed the suppression
 * list; opens/clicks feed attribution confidence.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    type?: string;
    data?: { email_id?: string };
  } | null;
  if (!body?.type || !body.data?.email_id) return NextResponse.json({ ok: true });

  const statusMap: Record<string, "delivered" | "bounced" | "complained" | "clicked"> = {
    "email.delivered": "delivered",
    "email.bounced": "bounced",
    "email.complained": "complained",
    "email.clicked": "clicked",
  };
  const status = statusMap[body.type];
  if (!status) return NextResponse.json({ ok: true });

  const msg = await db.query.messages.findFirst({
    where: eq(schema.messages.providerMessageId, body.data.email_id),
  });
  if (!msg) return NextResponse.json({ ok: true });

  await db.update(schema.messages).set({ status }).where(eq(schema.messages.id, msg.id));

  if (status === "bounced" || status === "complained") {
    await db
      .update(schema.customers)
      .set({ suppressedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.customers.id, msg.customerId));
  }

  return NextResponse.json({ ok: true });
}
