"use server";

/**
 * Organization settings: API tokens, the org-wide Slack and webhook targets,
 * billing, and sign-out.
 *
 * A token's plaintext is returned exactly once, in the action's result, and is
 * never stored — only its SHA-256 hash and a display prefix are. That is why the
 * form's success state has to render the value rather than a "copy it from the
 * list" instruction: there is no list to copy it from later.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { apis, apiTokens, auditLog, organizations } from "@/db/schema";
import { clearSession, requireUser } from "@/lib/auth";
import { generateToken } from "@/lib/tokens";
import { createCheckoutSession, createPortalSession, billingConfigured } from "@/lib/billing";
import { PAID_PLANS } from "@/lib/plans";
import type { Plan } from "@/db/schema";

import type { FormState, TokenState } from "@/lib/form-state";

export async function createTokenAction(_prev: TokenState, form: FormData): Promise<TokenState> {
  const { user, org } = await requireUser();
  const label = String(form.get("label") ?? "").trim();
  const scope = String(form.get("apiId") ?? "");

  if (label.length < 2) {
    return { error: "Label the token after where it lives — \"github-actions\", \"deploy-pipeline\".", ok: null, token: null };
  }

  const db = getDb();
  let apiId: string | null = null;
  if (scope) {
    const [api] = await db
      .select({ id: apis.id })
      .from(apis)
      .where(and(eq(apis.organizationId, org.id), eq(apis.id, scope)));
    if (!api) return { error: "That API is not on your organization.", ok: null, token: null };
    apiId = api.id;
  }

  const { token, hash, prefix } = generateToken();
  await db.insert(apiTokens).values({
    organizationId: org.id,
    apiId,
    tokenHash: hash,
    tokenPrefix: prefix,
    label,
  });
  await db.insert(auditLog).values({
    organizationId: org.id,
    actor: user.email,
    action: "token.create",
    target: label,
    metadata: { scoped: Boolean(apiId) } as never,
  });

  revalidatePath("/settings");
  return {
    error: null,
    ok: "Copy this now — it is not stored and cannot be shown again.",
    token,
  };
}

export async function revokeTokenAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, org } = await requireUser();
  const tokenId = String(form.get("tokenId") ?? "");
  const db = getDb();

  const [token] = await db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.organizationId, org.id), eq(apiTokens.id, tokenId)));
  if (!token) return { error: "That token is not on your organization.", ok: null };
  if (token.revokedAt) return { error: "That token is already revoked.", ok: null };

  await db.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.id, token.id));
  await db.insert(auditLog).values({
    organizationId: org.id,
    actor: user.email,
    action: "token.revoke",
    target: token.label,
    metadata: {} as never,
  });

  revalidatePath("/settings");
  return { error: null, ok: `Revoked "${token.label}". Any CI job using it now gets a 401.` };
}

export async function updateOrgAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, org } = await requireUser();
  const name = String(form.get("name") ?? "").trim();
  const slackWebhookUrl = String(form.get("slackWebhookUrl") ?? "").trim();
  const webhookUrl = String(form.get("webhookUrl") ?? "").trim();

  if (name.length < 2) return { error: "The organization name cannot be blank.", ok: null };
  if (slackWebhookUrl && !/^https:\/\/hooks\.slack\.com\//.test(slackWebhookUrl)) {
    return { error: "Slack incoming-webhook URLs start https://hooks.slack.com/.", ok: null };
  }
  if (webhookUrl && !/^https:\/\//.test(webhookUrl)) {
    return { error: "The outbound webhook must be an https URL.", ok: null };
  }

  const settings = { ...((org.settings ?? {}) as Record<string, unknown>) };
  if (slackWebhookUrl) settings.slackWebhookUrl = slackWebhookUrl;
  else delete settings.slackWebhookUrl;
  if (webhookUrl) settings.webhookUrl = webhookUrl;
  else delete settings.webhookUrl;

  await getDb()
    .update(organizations)
    .set({ name, settings: settings as never })
    .where(eq(organizations.id, org.id));
  await getDb().insert(auditLog).values({
    organizationId: org.id,
    actor: user.email,
    action: "org.update",
    target: org.slug,
    metadata: { slack: Boolean(slackWebhookUrl), webhook: Boolean(webhookUrl) } as never,
  });

  revalidatePath("/settings");
  return { error: null, ok: "Saved." };
}

export async function startCheckoutAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, org } = await requireUser();
  const plan = String(form.get("plan") ?? "");
  if (!PAID_PLANS.includes(plan as Plan)) return { error: "Pick one of the three plans.", ok: null };
  if (!billingConfigured()) {
    return {
      error: "Billing is not configured on this deployment. Set STRIPE_SECRET_KEY and the price IDs from .env.example.",
      ok: null,
    };
  }

  let url: string;
  try {
    url = await createCheckoutSession(org, user.email, plan as Plan);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Stripe would not open a checkout session.", ok: null };
  }
  redirect(url);
}

export async function openPortalAction(_prev: FormState, _form: FormData): Promise<FormState> {
  const { org } = await requireUser();
  if (!billingConfigured()) {
    return { error: "Billing is not configured on this deployment.", ok: null };
  }
  if (!org.stripeCustomerId) {
    return { error: "There is no subscription to manage yet.", ok: null };
  }
  let url: string;
  try {
    url = await createPortalSession(org);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Stripe would not open the billing portal.", ok: null };
  }
  redirect(url);
}

export async function signOutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
