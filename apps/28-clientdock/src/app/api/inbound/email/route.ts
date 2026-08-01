import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import {
  handleInboundEmail,
  InboundEmailError,
  parseInboundPayload,
} from "@/lib/inbound-email";

/**
 * Inbound email becomes a portal thread message (ARCHITECTURE.md flow 3).
 *
 * Point your provider's inbound webhook at this route with the shared secret in
 * `Authorization: Bearer …`. With no secret configured the route refuses to run
 * rather than defaulting to open: anything that can write into a client's thread is
 * as sensitive as the portal itself.
 *
 * A message that isn't for us answers 200 with a reason. A webhook that 500s gets
 * retried by the provider forever, and "this reply-to doesn't exist" is not a
 * failure we want retried.
 */
function authorized(req: NextRequest): boolean {
  const expected = env.inboundSecret;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const provided = header.replace(/^Bearer\s+/i, "");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export async function POST(req: NextRequest) {
  if (!env.inboundSecret) {
    return NextResponse.json(
      { error: "Inbound email is not configured (INBOUND_WEBHOOK_SECRET is unset)" },
      { status: 503 },
    );
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Body was not JSON" }, { status: 400 });
  }

  try {
    const email = parseInboundPayload(payload);
    const result = await handleInboundEmail(email, env.inboundDomain);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof InboundEmailError) {
      return NextResponse.json({ status: "rejected", reason: err.message });
    }
    console.error("[inbound] failed", err);
    return NextResponse.json({ error: "Could not process that message" }, { status: 500 });
  }
}
