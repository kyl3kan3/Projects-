import { NextRequest, NextResponse } from "next/server";
import { recordSuppression } from "@/lib/deliverability";

export async function GET(request: NextRequest) {
  const messageId = request.nextUrl.searchParams.get("messageId") ?? "demo";
  const email = request.nextUrl.searchParams.get("email") ?? "customer@example.com";
  await recordSuppression({ email, reason: "unsubscribe", providerMessageId: messageId });

  return new NextResponse(
    `<main style="font-family:Arial,sans-serif;padding:32px;color:#101315"><h1>Unsubscribed</h1><p>Message ${messageId} will not receive more recovery reminders.</p></main>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    },
  );
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { email?: string; messageId?: string };
  const suppression = await recordSuppression({
    email: body.email ?? "customer@example.com",
    reason: "unsubscribe",
    providerMessageId: body.messageId,
  });

  return NextResponse.json({
    unsubscribed: true,
    messageId: body.messageId ?? "demo",
    suppression,
  });
}
