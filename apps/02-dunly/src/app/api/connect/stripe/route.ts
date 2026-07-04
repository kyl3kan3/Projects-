import { NextRequest, NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { buildConnectAuthorizeUrl } from "@/lib/stripe";

export function GET(request: NextRequest) {
  const state = crypto.randomUUID();

  if (!serverEnv.stripeConnectClientId) {
    return NextResponse.redirect(new URL(`/api/demo/backfill?state=${state}`, request.url));
  }

  return NextResponse.redirect(buildConnectAuthorizeUrl(state));
}
