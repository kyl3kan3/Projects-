"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { blasts, lists, rewards, type BlastSegment, type TemplateId } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { createList, ownedList, updateListContent, uniqueSlug } from "@/lib/lists";
import { approveSignup, rejectSignup } from "@/lib/signups";
import { featureAllowed, plan } from "@/lib/plans";
import { sanitizeTheme } from "@/lib/templates";
import { isReservedSlug, slugify } from "@/lib/format";
import { addEndpoint, removeEndpoint } from "@/lib/webhooks";
import { segmentSize } from "@/lib/blasts";

export interface FormState {
  error?: string;
  ok?: string;
}

/** Load a list the caller owns, or throw — every action starts here. */
async function guard(listId: string) {
  const user = await requireUser();
  const list = await ownedList(user.id, listId);
  if (!list) throw new Error("That list doesn't exist, or isn't yours");
  return { user, list };
}

/* ------------------------------------------------------------------- lists --- */

export async function createListAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const template = (String(formData.get("template") ?? "marquee") || "marquee") as TemplateId;

  let listId: string;
  try {
    const list = await createList(user, { name, template });
    listId = list.id;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the list" };
  }
  redirect(`/lists/${listId}/builder?created=1`);
}

export async function updateContentAction(
  listId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { list } = await guard(listId);
  try {
    await updateListContent(list.id, {
      name: String(formData.get("name") ?? list.name),
      headline: String(formData.get("headline") ?? list.headline),
      subhead: String(formData.get("subhead") ?? list.subhead),
      ctaLabel: String(formData.get("ctaLabel") ?? list.ctaLabel),
      proofLine: String(formData.get("proofLine") ?? list.proofLine),
      template: (String(formData.get("template") ?? list.template) || list.template) as TemplateId,
      theme: sanitizeTheme({
        ground: String(formData.get("ground") ?? list.theme.ground),
        accent: String(formData.get("accent") ?? list.theme.accent),
        typePair: String(formData.get("typePair") ?? list.theme.typePair) as "grotesk" | "mono",
      }),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the page" };
  }
  revalidatePath(`/lists/${listId}/builder`);
  revalidatePath(`/l/${list.slug}`);
  return { ok: "Page saved." };
}

export async function updateSlugAction(
  listId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { list } = await guard(listId);
  const requested = slugify(String(formData.get("slug") ?? ""));
  if (requested === list.slug) return { ok: "Address unchanged." };
  if (isReservedSlug(requested)) return { error: `"${requested}" is reserved — pick another.` };

  const db = getDb();
  const [clash] = await db.select({ id: lists.id }).from(lists).where(eq(lists.slug, requested));
  if (clash) return { error: `"${requested}" is taken. Try ${await uniqueSlug(requested)}.` };

  await db.update(lists).set({ slug: requested }).where(eq(lists.id, list.id));
  revalidatePath(`/lists/${listId}/settings`);
  return { ok: `Your page now lives at /l/${requested}.` };
}

export async function updateMechanicsAction(
  listId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { list } = await guard(listId);
  const boost = Number(formData.get("boostPerReferral") ?? list.boostPerReferral);
  const maxBoost = Number(formData.get("maxBoost") ?? list.maxBoost);
  const doubleOptIn = formData.get("requireDoubleOptIn") === "on";

  if (!Number.isFinite(boost) || boost < 1 || boost > 10_000) {
    return { error: "A referral has to be worth between 1 and 10,000 positions." };
  }
  if (!Number.isFinite(maxBoost) || maxBoost < 0) {
    return { error: "The cap has to be zero (no cap) or a positive number." };
  }

  const db = getDb();
  await db
    .update(lists)
    .set({
      boostPerReferral: Math.floor(boost),
      maxBoost: Math.floor(maxBoost),
      requireDoubleOptIn: doubleOptIn,
    })
    .where(eq(lists.id, list.id));

  // Existing boosts are deliberately left alone: retroactively re-pricing
  // referrals would move people who already told their friends where they stand.
  revalidatePath(`/lists/${listId}/settings`);
  return {
    ok: doubleOptIn
      ? "Saved. New referrals are worth " + Math.floor(boost) + " positions."
      : "Saved. Double opt-in is off — signups count the moment they submit.",
  };
}

export async function updateBadgeAction(listId: string, hidden: boolean): Promise<void> {
  const { user, list } = await guard(listId);
  if (hidden && !featureAllowed(user.plan, "canHideBadge")) return;
  const db = getDb();
  await db.update(lists).set({ badgeHidden: hidden }).where(eq(lists.id, list.id));
  revalidatePath(`/lists/${listId}/settings`);
  revalidatePath(`/l/${list.slug}`);
}

export async function updateDomainAction(
  listId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, list } = await guard(listId);
  if (!featureAllowed(user.plan, "customDomain")) {
    return { error: `Custom domains are on Growth. You're on ${plan(user.plan).name}.` };
  }
  const raw = String(formData.get("customDomain") ?? "").trim().toLowerCase();
  const db = getDb();

  if (!raw) {
    await db
      .update(lists)
      .set({ customDomain: null, customDomainVerified: false })
      .where(eq(lists.id, list.id));
    revalidatePath(`/lists/${listId}/settings`);
    return { ok: "Custom domain removed." };
  }

  const domain = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    return { error: "That doesn't look like a domain — try waitlist.yourproduct.com." };
  }
  const [clash] = await db.select({ id: lists.id }).from(lists).where(eq(lists.customDomain, domain));
  if (clash && clash.id !== list.id) return { error: "That domain is already attached to a list." };

  // Saved unverified. Verification is a DNS check plus attaching the domain at
  // the host, which is a deploy-time operation — the wizard below tells the
  // truth about what is still outstanding rather than pretending it is live.
  await db
    .update(lists)
    .set({ customDomain: domain, customDomainVerified: false })
    .where(eq(lists.id, list.id));
  revalidatePath(`/lists/${listId}/settings`);
  return { ok: `Saved. Point ${domain} at LaunchList with the CNAME below, then verify.` };
}

export async function archiveListAction(listId: string): Promise<void> {
  const { list } = await guard(listId);
  const db = getDb();
  await db.update(lists).set({ status: "archived" }).where(eq(lists.id, list.id));
  redirect("/lists");
}

export async function launchListAction(listId: string): Promise<void> {
  const { list } = await guard(listId);
  const db = getDb();
  await db
    .update(lists)
    .set({ status: list.status === "launched" ? "pre" : "launched" })
    .where(eq(lists.id, list.id));
  revalidatePath(`/lists/${listId}`);
}

/* ----------------------------------------------------------------- rewards --- */

export async function addRewardAction(
  listId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { list } = await guard(listId);
  const threshold = Number(formData.get("threshold") ?? 0);
  const label = String(formData.get("label") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!Number.isFinite(threshold) || threshold < 1 || threshold > 1000) {
    return { error: "A tier needs a referral count between 1 and 1,000." };
  }
  if (label.length < 2) return { error: "Give the tier a name people will want." };

  const db = getDb();
  const inserted = await db
    .insert(rewards)
    .values({ listId: list.id, threshold: Math.floor(threshold), label, description })
    .onConflictDoNothing()
    .returning();
  if (!inserted.length) return { error: `There's already a tier at ${threshold} referrals.` };

  revalidatePath(`/lists/${listId}/referrals`);
  return { ok: `${label} added at ${threshold} referrals.` };
}

export async function removeRewardAction(listId: string, rewardId: string): Promise<void> {
  const { list } = await guard(listId);
  const db = getDb();
  // Grants cascade with the tier: a deleted tier is a tier nobody holds.
  await db.delete(rewards).where(and(eq(rewards.id, rewardId), eq(rewards.listId, list.id)));
  revalidatePath(`/lists/${listId}/referrals`);
}

/* ------------------------------------------------------------ review queue --- */

export async function approveSignupAction(listId: string, signupId: string): Promise<void> {
  await guard(listId);
  await approveSignup(signupId);
  revalidatePath(`/lists/${listId}/signups`);
  revalidatePath(`/lists/${listId}`);
}

export async function rejectSignupAction(listId: string, signupId: string): Promise<void> {
  await guard(listId);
  await rejectSignup(signupId);
  revalidatePath(`/lists/${listId}/signups`);
  revalidatePath(`/lists/${listId}`);
}

/* ---------------------------------------------------------------- webhooks --- */

export async function addWebhookAction(
  listId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, list } = await guard(listId);
  if (!featureAllowed(user.plan, "webhooks")) {
    return { error: "Webhooks are on Pro." };
  }
  try {
    await addEndpoint(list.id, String(formData.get("url") ?? ""));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add the endpoint" };
  }
  revalidatePath(`/lists/${listId}/settings`);
  return { ok: "Endpoint added. Every confirmed signup will be POSTed to it." };
}

export async function removeWebhookAction(listId: string, endpointId: string): Promise<void> {
  const { list } = await guard(listId);
  await removeEndpoint(list.id, endpointId);
  revalidatePath(`/lists/${listId}/settings`);
}

/* ------------------------------------------------------------------ blasts --- */

export async function createBlastAction(
  listId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, list } = await guard(listId);
  if (!featureAllowed(user.plan, "emailBlasts")) {
    return { error: `Email blasts are on Growth. You're on ${plan(user.plan).name}.` };
  }

  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const segment = (String(formData.get("segment") ?? "all") || "all") as BlastSegment;
  const segmentValue = Number(formData.get("segmentValue") ?? 0);
  const sendNow = formData.get("sendNow") === "on";
  const scheduledRaw = String(formData.get("scheduledAt") ?? "").trim();

  if (subject.length < 3) return { error: "Give the email a subject line." };
  if (body.length < 10) return { error: "Write something worth sending." };

  let scheduledAt: Date | null = null;
  if (!sendNow && scheduledRaw) {
    const parsed = new Date(scheduledRaw);
    if (Number.isNaN(parsed.getTime())) return { error: "That send time isn't a valid date." };
    if (parsed.getTime() < Date.now() - 60_000) return { error: "That send time is in the past." };
    scheduledAt = parsed;
  }

  const spec = { segment, value: Number.isFinite(segmentValue) ? segmentValue : 0 };
  const recipients = await segmentSize(list.id, spec);
  if (recipients === 0) {
    return { error: "That segment has nobody in it yet — nothing would be sent." };
  }

  const db = getDb();
  await db.insert(blasts).values({
    listId: list.id,
    subject,
    body,
    segment,
    segmentValue: spec.value,
    recipientCount: recipients,
    status: sendNow || scheduledAt ? "scheduled" : "draft",
    scheduledAt: sendNow ? new Date() : scheduledAt,
  });

  revalidatePath(`/lists/${listId}/blasts`);
  redirect(`/lists/${listId}/blasts`);
}

export async function cancelBlastAction(listId: string, blastId: string): Promise<void> {
  const { list } = await guard(listId);
  const db = getDb();
  // Only a blast that has not started sending can be cancelled. Half-sent mail
  // cannot be unsent, and pretending otherwise would be a lie.
  await db
    .update(blasts)
    .set({ status: "draft", scheduledAt: null })
    .where(and(eq(blasts.id, blastId), eq(blasts.listId, list.id), eq(blasts.status, "scheduled")));
  revalidatePath(`/lists/${listId}/blasts`);
}
