import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { db, schema } from "@/db";
import { encryptToken } from "@/lib/crypto";
import { env } from "@/lib/env";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return NextResponse.redirect(new URL("/settings?crm=denied", env.appUrl));

  let orgId: string;
  try {
    const { payload } = await jwtVerify(state, new TextEncoder().encode(env.authSecret));
    orgId = payload.orgId as string;
  } catch {
    return NextResponse.redirect(new URL("/settings?crm=invalid", env.appUrl));
  }

  const res = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.hubspotClientId,
      client_secret: env.hubspotClientSecret,
      redirect_uri: `${env.appUrl}/api/crm/hubspot/callback`,
      code,
    }),
  });
  if (!res.ok) return NextResponse.redirect(new URL("/settings?crm=error", env.appUrl));
  const tokens = (await res.json()) as { access_token: string; refresh_token: string };

  // portal id from token introspection
  const info = await fetch(`https://api.hubapi.com/oauth/v1/access-tokens/${tokens.access_token}`);
  const portalId = info.ok ? String(((await info.json()) as { hub_id: number }).hub_id) : null;

  const existing = await db.query.crmConnections.findFirst({ where: eq(schema.crmConnections.orgId, orgId) });
  if (existing) {
    await db
      .update(schema.crmConnections)
      .set({
        accessTokenEnc: encryptToken(tokens.access_token),
        refreshTokenEnc: encryptToken(tokens.refresh_token),
        portalId,
        status: "active",
      })
      .where(eq(schema.crmConnections.id, existing.id));
  } else {
    await db.insert(schema.crmConnections).values({
      orgId,
      provider: "hubspot",
      accessTokenEnc: encryptToken(tokens.access_token),
      refreshTokenEnc: encryptToken(tokens.refresh_token),
      portalId,
      status: "active",
    });
  }

  return NextResponse.redirect(new URL("/settings?crm=ok", env.appUrl));
}
