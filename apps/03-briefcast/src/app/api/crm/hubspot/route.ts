import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { hubspotAuthorizeUrl } from "@/lib/crm/hubspot";

/** Start HubSpot OAuth with a signed state carrying the org id. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", env.appUrl));
  const state = await new SignJWT({ orgId: session.orgId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode(env.authSecret));
  return NextResponse.redirect(hubspotAuthorizeUrl(state));
}
