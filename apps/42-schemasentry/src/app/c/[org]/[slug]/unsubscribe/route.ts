/**
 * One-click unsubscribe from the footer of every changelog notice.
 *
 * No confirmation screen: a link that needs a second click is a link people
 * report as spam instead.
 */

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
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

  await db
    .update(subscriptions)
    .set({ unsubscribedAt: new Date() })
    .where(and(eq(subscriptions.apiId, api.id), eq(subscriptions.rssToken, token)));

  return NextResponse.redirect(new URL(`${back}?subscribed=no`, request.url));
}
