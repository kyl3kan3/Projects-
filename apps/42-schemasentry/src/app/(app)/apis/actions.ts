"use server";

/**
 * API-registry actions: add an API, rename it, change its visibility, set the
 * baseline, edit the policy, delete it.
 *
 * All of them re-resolve the session and re-scope to the caller's organization,
 * because a server action is a public endpoint — an id in a form field proves
 * nothing about who is allowed to touch it.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { apis, auditLog, deploys } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { slugify } from "@/lib/format";
import { canAddApi, canUse } from "@/lib/plans";
import { planState } from "@/lib/queries";
import { normalizePolicy, RULES, type PolicyLevel } from "@/core/rules";
import type { FormState } from "@/lib/form-state";
import { computeAndStoreDiff, draftChangelogFor } from "@/lib/ingest";


async function audit(organizationId: string, actor: string, action: string, target: string, metadata: unknown = {}) {
  await getDb().insert(auditLog).values({ organizationId, actor, action, target, metadata: metadata as never });
}

/* -------------------------------------------------------------- add an API */

export async function createApiAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, org } = await requireUser();
  const name = String(form.get("name") ?? "").trim();
  const rawSlug = String(form.get("slug") ?? "").trim();
  const visibility = String(form.get("visibility") ?? "unlisted");

  if (name.length < 2) return { error: "Give the API a name — the one your team says out loud.", ok: null };

  const slug = slugify(rawSlug || name);
  const gate = canAddApi(await planState(org), new Date());
  if (!gate.allowed) return { error: gate.message, ok: null };

  const db = getDb();
  const [clash] = await db
    .select({ id: apis.id })
    .from(apis)
    .where(and(eq(apis.organizationId, org.id), eq(apis.slug, slug)));
  if (clash) return { error: `You already watch an API at "${slug}". Pick another slug.`, ok: null };

  await db.insert(apis).values({
    organizationId: org.id,
    name,
    slug,
    visibility: visibility === "public" ? "public" : visibility === "private" ? "private" : "unlisted",
  });
  await audit(org.id, user.email, "api.create", slug, { name, visibility });

  revalidatePath("/apis");
  redirect(`/apis/${slug}`);
}

/* ------------------------------------------------------------ API settings */

export async function updateApiAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, org } = await requireUser();
  const slug = String(form.get("slug") ?? "");
  const db = getDb();
  const [api] = await db
    .select()
    .from(apis)
    .where(and(eq(apis.organizationId, org.id), eq(apis.slug, slug)));
  if (!api) return { error: "That API is not on your organization.", ok: null };

  const name = String(form.get("name") ?? "").trim();
  const visibility = String(form.get("visibility") ?? api.visibility);
  const slackWebhookUrl = String(form.get("slackWebhookUrl") ?? "").trim();

  if (name.length < 2) return { error: "The name cannot be blank.", ok: null };
  if (slackWebhookUrl && !/^https:\/\/hooks\.slack\.com\//.test(slackWebhookUrl)) {
    return {
      error: "That does not look like a Slack incoming-webhook URL (they start https://hooks.slack.com/).",
      ok: null,
    };
  }

  await db
    .update(apis)
    .set({
      name,
      visibility: visibility === "public" ? "public" : visibility === "private" ? "private" : "unlisted",
      slackWebhookUrl: slackWebhookUrl || null,
    })
    .where(eq(apis.id, api.id));
  await audit(org.id, user.email, "api.update", slug, { name, visibility, slack: Boolean(slackWebhookUrl) });

  revalidatePath(`/apis/${slug}/settings`);
  return { error: null, ok: "Saved." };
}

/* ------------------------------------------------------------------ policy */

/**
 * Per-API rule overrides. Gated on the plan (Team and above), because a custom
 * breaking-change policy is one of the Team features in the pricing table.
 */
export async function updatePolicyAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, org } = await requireUser();
  const gate = canUse(await planState(org), new Date(), "policyOverrides");
  if (!gate.allowed) return { error: gate.message, ok: null };

  const slug = String(form.get("slug") ?? "");
  const db = getDb();
  const [api] = await db
    .select()
    .from(apis)
    .where(and(eq(apis.organizationId, org.id), eq(apis.slug, slug)));
  if (!api) return { error: "That API is not on your organization.", ok: null };

  const overrides: Record<string, PolicyLevel> = {};
  for (const ruleId of RULES.keys()) {
    const value = form.get(`rule:${ruleId}`);
    if (typeof value !== "string" || value === "" || value === "default") continue;
    if (["breaking", "risky", "compatible", "ignore"].includes(value)) {
      overrides[ruleId] = value as PolicyLevel;
    }
  }
  const failOn = form.get("failOn") === "risky" ? "risky" : "breaking";
  const policy = normalizePolicy({ overrides, failOn });

  await db.update(apis).set({ policy: policy as never }).where(eq(apis.id, api.id));
  await audit(org.id, user.email, "policy.update", slug, {
    failOn,
    overrideCount: Object.keys(overrides).length,
    overrides,
  });

  revalidatePath(`/apis/${slug}/settings`);
  return {
    error: null,
    ok:
      Object.keys(overrides).length === 0
        ? `Policy saved: the default ruleset, failing CI on ${failOn}.`
        : `Policy saved: ${Object.keys(overrides).length} override${Object.keys(overrides).length === 1 ? "" : "s"}, failing CI on ${failOn}. Re-compare a diff to apply it.`,
  };
}

/* ---------------------------------------------------------------- baseline */

export async function setBaselineAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, org } = await requireUser();
  const slug = String(form.get("slug") ?? "");
  const deployId = String(form.get("deployId") ?? "");
  const db = getDb();

  const [api] = await db
    .select()
    .from(apis)
    .where(and(eq(apis.organizationId, org.id), eq(apis.slug, slug)));
  if (!api) return { error: "That API is not on your organization.", ok: null };

  const [deploy] = await db
    .select()
    .from(deploys)
    .where(and(eq(deploys.apiId, api.id), eq(deploys.id, deployId)));
  if (!deploy) return { error: "That deploy is not on this API.", ok: null };

  await db.update(apis).set({ baselineDeployId: deploy.id }).where(eq(apis.id, api.id));
  await audit(org.id, user.email, "baseline.set", slug, {
    versionLabel: deploy.versionLabel,
    environment: deploy.environment,
  });

  revalidatePath(`/apis/${slug}`);
  return { error: null, ok: `Baseline is now ${deploy.versionLabel}. The next push compares against it.` };
}

/* ----------------------------------------------------------------- compare */

/**
 * Compare two arbitrary deploys from the timeline. Computes the diff if the pair
 * has never been compared, then sends the user to it.
 */
export async function compareAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireUser();
  const slug = String(form.get("slug") ?? "");
  const fromId = String(form.get("from") ?? "");
  const toId = String(form.get("to") ?? "");
  const db = getDb();

  const [api] = await db
    .select()
    .from(apis)
    .where(and(eq(apis.organizationId, org.id), eq(apis.slug, slug)));
  if (!api) return { error: "That API is not on your organization.", ok: null };
  if (fromId === toId) return { error: "Pick two different deploys.", ok: null };

  const [from] = await db.select().from(deploys).where(and(eq(deploys.apiId, api.id), eq(deploys.id, fromId)));
  const [to] = await db.select().from(deploys).where(and(eq(deploys.apiId, api.id), eq(deploys.id, toId)));
  if (!from || !to) return { error: "One of those deploys is not on this API.", ok: null };

  // Compare in chronological order, whichever order the rows were tapped in:
  // a diff read backwards inverts every verdict, which is worse than useless.
  const [older, newer] = from.pushedAt <= to.pushedAt ? [from, to] : [to, from];
  const diff = await computeAndStoreDiff(api, older, newer);
  await draftChangelogFor(api.id, diff);

  revalidatePath(`/apis/${slug}`);
  redirect(`/apis/${slug}/diffs/${diff.id}`);
}
