/**
 * Confirm a changelog subscription.
 *
 * The token is the subscription's RSS token — a 128-bit random value that is
 * already secret enough to be a feed URL. Verifying with it means the click in
 * the confirmation email is the whole proof, with no second table.
 */

import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { apis, organizations, subscriptions } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ org: string; slug: string }> },
) {
  const { org: orgSlug, slug } = await params;
  const token = new URL(request.url).searchParams.get("token");
  const back = `/c/${orgSlug}/${slug}`;
  if (!token) return NextResponse.redirect(new URL(`${back}?subscribed=invalid`, request.url));

  const db = getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, orgSlug));
  if (!org) return NextResponse.redirect(new URL(`${back}?subscribed=invalid`, request.url));
  const [api] = await db
    .select()
    .from(apis)
    .where(and(eq(apis.organizationId, org.id), eq(apis.slug, slug)));
  if (!api) return NextResponse.redirect(new URL(`${back}?subscribed=invalid`, request.url));

  const [row] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.apiId, api.id), eq(subscriptions.rssToken, token)));
  if (!row) return NextResponse.redirect(new URL(`${back}?subscribed=invalid`, request.url));

  if (!row.verifiedAt) {
    await db
      .update(subscriptions)
      .set({ verifiedAt: new Date(), unsubscribedAt: null })
      .where(and(eq(subscriptions.id, row.id), isNull(subscriptions.verifiedAt)));
  }
  return NextResponse.redirect(new URL(`${back}?subscribed=yes`, request.url));
}
