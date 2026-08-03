"use server";

/**
 * The consumer registry. Declared usage is entered as plain lists — one entry
 * per line or comma-separated — because the people filling this in are copying
 * from a partner's integration doc, not learning a DSL.
 *
 * Endpoints are validated against the *current* baseline spec, so a typo is
 * caught at entry rather than silently never matching a finding. A registry that
 * quietly matches nothing is worse than an empty one: it looks like coverage.
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { apis, auditLog, consumers, deploys } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { parseLines } from "@/lib/format";
import { canUse } from "@/lib/plans";
import { planState } from "@/lib/queries";
import { normalizeUsage } from "@/core/impact";
import { operationIndex } from "@/core/diff";
import type { JsonObject } from "@/core/canonicalize";
import type { FormState } from "@/lib/form-state";

async function resolveApi(organizationId: string, slug: string) {
  const [api] = await getDb()
    .select()
    .from(apis)
    .where(and(eq(apis.organizationId, organizationId), eq(apis.slug, slug)));
  return api ?? null;
}

/** Every `METHOD /path` in the API's baseline (or newest) deploy. */
export async function knownEndpoints(apiId: string, baselineDeployId: string | null): Promise<string[]> {
  const db = getDb();
  let deploy = null;
  if (baselineDeployId) {
    [deploy] = await db.select().from(deploys).where(eq(deploys.id, baselineDeployId));
  }
  if (!deploy) {
    [deploy] = await db.select().from(deploys).where(eq(deploys.apiId, apiId)).limit(1);
  }
  if (!deploy) return [];
  return [...operationIndex(deploy.specCanonical as JsonObject).keys()].sort();
}

export async function saveConsumerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, org } = await requireUser();
  const gate = canUse(await planState(org), new Date(), "consumerRegistry");
  if (!gate.allowed) return { error: gate.message, ok: null };

  const slug = String(form.get("slug") ?? "");
  const api = await resolveApi(org.id, slug);
  if (!api) return { error: "That API is not on your organization.", ok: null };

  const consumerId = String(form.get("consumerId") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const contact = String(form.get("contact") ?? "").trim();
  const notify = form.get("notify") === "on";

  if (name.length < 2) return { error: "Name the consumer as your team refers to it — \"Acme webhooks\", \"iOS app\".", ok: null };

  const usage = normalizeUsage({
    endpoints: parseLines(String(form.get("endpoints") ?? "")),
    fields: parseLines(String(form.get("fields") ?? "")),
    enumValues: parseLines(String(form.get("enumValues") ?? "")),
  });

  const malformed = usage.endpoints.filter((e) => !/^\s*[A-Za-z]+\s+\/\S*\s*$/.test(e));
  if (malformed.length > 0) {
    return {
      error: `Endpoints need a method and a path, like "GET /v1/orders". These do not: ${malformed.join(", ")}.`,
      ok: null,
    };
  }

  const known = await knownEndpoints(api.id, api.baselineDeployId);
  const unknown = known.length > 0 ? usage.endpoints.filter((e) => !known.includes(e.toUpperCase().replace(/\s+/, " "))) : [];

  const db = getDb();
  if (consumerId) {
    const [existing] = await db
      .select()
      .from(consumers)
      .where(and(eq(consumers.apiId, api.id), eq(consumers.id, consumerId)));
    if (!existing) return { error: "That consumer is not on this API.", ok: null };
    await db
      .update(consumers)
      .set({ name, contact: contact || null, declaredUsage: usage as never, notify })
      .where(eq(consumers.id, existing.id));
  } else {
    const [clash] = await db
      .select({ id: consumers.id })
      .from(consumers)
      .where(and(eq(consumers.apiId, api.id), eq(consumers.name, name)));
    if (clash) return { error: `"${name}" is already in this registry.`, ok: null };
    await db.insert(consumers).values({
      apiId: api.id,
      name,
      contact: contact || null,
      declaredUsage: usage as never,
      notify,
    });
  }

  await db.insert(auditLog).values({
    organizationId: org.id,
    actor: user.email,
    action: consumerId ? "consumer.update" : "consumer.create",
    target: `${api.slug} / ${name}`,
    metadata: {
      endpoints: usage.endpoints.length,
      fields: usage.fields.length,
      enumValues: usage.enumValues.length,
    } as never,
  });

  revalidatePath(`/apis/${slug}/consumers`);
  return {
    error: null,
    ok:
      unknown.length > 0
        ? `Saved. ${unknown.length} declared endpoint${unknown.length === 1 ? "" : "s"} do not exist in the current spec (${unknown.join(", ")}) — they will never match a finding until they do.`
        : `Saved ${name}: ${usage.endpoints.length} endpoints, ${usage.fields.length} fields, ${usage.enumValues.length} values.`,
  };
}

export async function deleteConsumerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, org } = await requireUser();
  const slug = String(form.get("slug") ?? "");
  const consumerId = String(form.get("consumerId") ?? "");
  const api = await resolveApi(org.id, slug);
  if (!api) return { error: "That API is not on your organization.", ok: null };

  const db = getDb();
  const [existing] = await db
    .select()
    .from(consumers)
    .where(and(eq(consumers.apiId, api.id), eq(consumers.id, consumerId)));
  if (!existing) return { error: "That consumer is already gone.", ok: null };

  await db.delete(consumers).where(eq(consumers.id, existing.id));
  await db.insert(auditLog).values({
    organizationId: org.id,
    actor: user.email,
    action: "consumer.delete",
    target: `${api.slug} / ${existing.name}`,
    metadata: {} as never,
  });

  revalidatePath(`/apis/${slug}/consumers`);
  return { error: null, ok: `Removed ${existing.name}. Past impact records stay in the timeline.` };
}
