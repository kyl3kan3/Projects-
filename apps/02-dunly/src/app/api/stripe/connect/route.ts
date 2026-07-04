import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { connectAuthorizeUrl } from "@/lib/stripe";

/** Kick off Stripe Connect OAuth with a signed state (CSRF protection). */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", env.appUrl));
  const state = await new SignJWT({ organizationId: session.organizationId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode(env.authSecret));
  return NextResponse.redirect(connectAuthorizeUrl(state));
}
