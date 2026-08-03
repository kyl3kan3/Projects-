"use server";

/**
 * The changelog editor.
 *
 * Publishing is where the product stops being a detector and becomes a
 * communication channel, so two things are enforced on the server: a published
 * entry must not still contain the migration placeholder (an unedited draft on a
 * public page is worse than no page), and publishing queues one notice per
 * verified subscriber with a `dedupeKey` that makes a second send impossible.
 */

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { apis, auditLog, changelogEntries, subscriptions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { enqueueDelivery, drainDeliveries } from "@/lib/notify";
import { hasUnfilledMigrationNote } from "@/core/changelog";
import type { FormState } from "@/lib/form-state";

async function resolve(organizationId: string, slug: string, entryId: string) {
  const db = getDb();
  const [api] = await db
    .select()
    .from(apis)
    .where(and(eq(apis.organizationId, organizationId), eq(apis.slug, slug)));
  if (!api) return null;
  const [entry] = await db
    .select()
    .from(changelogEntries)
    .where(and(eq(changelogEntries.apiId, api.id), eq(changelogEntries.id, entryId)));
  if (!entry) return null;
  return { api, entry };
}

export async function saveEntryAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, org } = await requireUser();
  const slug = String(form.get("slug") ?? "");
  const entryId = String(form.get("entryId") ?? "");
  const found = await resolve(org.id, slug, entryId);
  if (!found) return { error: "That entry is not on your organization.", ok: null };

  const title = String(form.get("title") ?? "").trim();
  const bodyMd = String(form.get("bodyMd") ?? "");
  if (title.length < 4) return { error: "The title is what a consumer sees in their inbox. Give it four characters at least.", ok: null };

  await getDb()
    .update(changelogEntries)
    .set({ title, bodyMd, updatedAt: new Date() })
    .where(eq(changelogEntries.id, found.entry.id));
  await getDb().insert(auditLog).values({
    organizationId: org.id,
    actor: user.email,
    action: "changelog.edit",
    target: `${slug} ${found.entry.versionLabel}`,
    metadata: {} as never,
  });

  revalidatePath(`/apis/${slug}/changelog`);
  return { error: null, ok: "Saved as a draft." };
}

export async function publishEntryAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, org } = await requireUser();
  const slug = String(form.get("slug") ?? "");
  const entryId = String(form.get("entryId") ?? "");
  const found = await resolve(org.id, slug, entryId);
  if (!found) return { error: "That entry is not on your organization.", ok: null };
  if (found.entry.status === "published") return { error: "That entry is already published.", ok: null };

  const title = String(form.get("title") ?? found.entry.title).trim();
  const bodyMd = String(form.get("bodyMd") ?? found.entry.bodyMd);

  if (hasUnfilledMigrationNote(bodyMd)) {
    return {
      error:
        "This entry still has an unfilled migration note. Write what consumers should do instead — that sentence is the reason they read this page.",
      ok: null,
    };
  }

  const db = getDb();
  const publishedAt = new Date();
  await db
    .update(changelogEntries)
    .set({ status: "published", title, bodyMd, publishedAt, updatedAt: publishedAt })
    .where(eq(changelogEntries.id, found.entry.id));

  // One notice per verified, still-subscribed reader. The dedupe key is
  // (entry, subscription), so republishing or a double click cannot mail twice.
  const readers = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.apiId, found.api.id),
        isNotNull(subscriptions.verifiedAt),
        isNull(subscriptions.unsubscribedAt),
      ),
    );

  const entryUrl = `${env.appUrl}/c/${org.slug}/${found.api.slug}#${found.entry.anchor}`;
  let queued = 0;
  for (const reader of readers) {
    const created = await enqueueDelivery({
      organizationId: org.id,
      apiId: found.api.id,
      diffId: found.entry.diffId,
      channel: "email",
      target: reader.email,
      dedupeKey: `email:entry:${found.entry.id}:${reader.id}`,
      payload: {
        apiName: found.api.name,
        entryTitle: title,
        entryUrl,
        breaking: found.entry.breaking,
        bodyMd,
        unsubscribeUrl: `${env.appUrl}/c/${org.slug}/${found.api.slug}/unsubscribe?token=${reader.rssToken}`,
      },
    });
    if (created) queued += 1;
  }

  await db.insert(auditLog).values({
    organizationId: org.id,
    actor: user.email,
    action: "changelog.publish",
    target: `${slug} ${found.entry.versionLabel}`,
    metadata: { subscribers: queued, breaking: found.entry.breaking } as never,
  });

  await drainDeliveries(10, 5_000).catch(() => undefined);

  revalidatePath(`/apis/${slug}/changelog`);
  revalidatePath(`/c/${org.slug}/${found.api.slug}`);
  return {
    error: null,
    ok:
      queued > 0
        ? `Published. ${queued} subscriber notice${queued === 1 ? "" : "s"} queued.`
        : "Published. No verified subscribers yet, so nothing was emailed.",
  };
}

export async function unpublishEntryAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, org } = await requireUser();
  const slug = String(form.get("slug") ?? "");
  const entryId = String(form.get("entryId") ?? "");
  const found = await resolve(org.id, slug, entryId);
  if (!found) return { error: "That entry is not on your organization.", ok: null };

  await getDb()
    .update(changelogEntries)
    .set({ status: "draft", publishedAt: null, updatedAt: new Date() })
    .where(eq(changelogEntries.id, found.entry.id));
  await getDb().insert(auditLog).values({
    organizationId: org.id,
    actor: user.email,
    action: "changelog.unpublish",
    target: `${slug} ${found.entry.versionLabel}`,
    metadata: {} as never,
  });

  revalidatePath(`/apis/${slug}/changelog`);
  revalidatePath(`/c/${org.slug}/${found.api.slug}`);
  return {
    error: null,
    ok: "Back to a draft. Notices already sent cannot be recalled — that is what the audit log is for.",
  };
}
