"use server";

/**
 * Public changelog subscription.
 *
 * A subscriber gets an RSS token immediately (RSS needs no verification — the
 * feed is the same public page) but email requires a verified address. Verifying
 * is a link in the confirmation mail, which means an unverified row is never
 * mailed a changelog notice: that is how a public form does not become a way to
 * send mail to strangers.
 */

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { apis, organizations, subscriptions } from "@/db/schema";
import { env } from "@/lib/env";
import { emailConfigured } from "@/lib/email";
import { enqueueDelivery, drainDeliveries } from "@/lib/notify";

import type { SubscribeState } from "@/lib/form-state";

export async function subscribeAction(_prev: SubscribeState, form: FormData): Promise<SubscribeState> {
  const orgSlug = String(form.get("org") ?? "");
  const apiSlug = String(form.get("api") ?? "");
  const email = String(form.get("email") ?? "").trim().toLowerCase();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "Enter a valid email address.", ok: null, feedUrl: null };
  }

  const db = getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, orgSlug));
  if (!org) return { error: "That changelog does not exist.", ok: null, feedUrl: null };
  const [api] = await db
    .select()
    .from(apis)
    .where(and(eq(apis.organizationId, org.id), eq(apis.slug, apiSlug)));
  if (!api || api.visibility === "private") {
    return { error: "That changelog does not exist.", ok: null, feedUrl: null };
  }

  const rssToken = randomBytes(16).toString("base64url");
  const [row] = await db
    .insert(subscriptions)
    .values({ apiId: api.id, email, rssToken })
    .onConflictDoUpdate({
      target: [subscriptions.apiId, subscriptions.email],
      set: { unsubscribedAt: null },
    })
    .returning();

  const verifyUrl = `${env.appUrl}/c/${org.slug}/${api.slug}/verify?token=${row.rssToken}`;
  const feedUrl = `${env.appUrl}/c/${org.slug}/${api.slug}/rss.xml`;

  if (row.verifiedAt) {
    return { error: null, ok: "You are already subscribed to this changelog.", feedUrl };
  }

  if (!emailConfigured()) {
    // Be honest rather than pretending a mail went out. RSS still works.
    return {
      error: null,
      ok: "Recorded. Email delivery is not configured on this deployment, so use the feed below instead.",
      feedUrl,
    };
  }

  await enqueueDelivery({
    organizationId: org.id,
    apiId: api.id,
    diffId: null,
    channel: "email",
    target: email,
    dedupeKey: `email:verify:${row.id}`,
    payload: {
      apiName: api.name,
      entryTitle: "Confirm your changelog subscription",
      entryUrl: verifyUrl,
      breaking: false,
      bodyMd: `Confirm you want breaking-change notices for ${api.name}.\n\nOpen this link and you are done: ${verifyUrl}`,
      unsubscribeUrl: `${env.appUrl}/c/${org.slug}/${api.slug}/unsubscribe?token=${row.rssToken}`,
    },
  });
  await drainDeliveries(3, 4_000).catch(() => undefined);

  revalidatePath(`/c/${orgSlug}/${apiSlug}`);
  return { error: null, ok: "Check your inbox for a confirmation link.", feedUrl };
}
