import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForAccount } from "@/lib/stripe";

export async function GET(request: NextRequest) {
  const error = request.nextUrl.searchParams.get("error");
  const code = request.nextUrl.searchParams.get("code");

  if (error) {
    return NextResponse.redirect(new URL(`/connect?error=${encodeURIComponent(error)}`, request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/connect?error=missing_code", request.url));
  }

  try {
    const account = await exchangeCodeForAccount(code);
    return NextResponse.redirect(new URL(`/dashboard?connected=${account.stripeAccountId}`, request.url));
  } catch {
    return NextResponse.redirect(new URL("/connect?error=oauth_exchange_failed", request.url));
  }
}
