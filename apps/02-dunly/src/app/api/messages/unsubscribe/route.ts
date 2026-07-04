import { NextRequest, NextResponse } from "next/server";

export function GET(request: NextRequest) {
  const messageId = request.nextUrl.searchParams.get("messageId") ?? "demo";
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
  const body = (await request.json().catch(() => ({}))) as { messageId?: string };
  return NextResponse.json({
    unsubscribed: true,
    messageId: body.messageId ?? "demo",
  });
}
