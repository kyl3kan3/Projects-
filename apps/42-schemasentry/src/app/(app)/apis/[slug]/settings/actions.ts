"use server";

/**
 * Contract-suite generation and regeneration.
 *
 * ARCHITECTURE.md is specific that regeneration must not overwrite a suite an
 * engineer has customized: it "diffs against the customized copy and marks drift
 * rather than overwriting". So `generateSuiteAction` on an existing suite reports
 * what changed and leaves the stored copy alone unless the user asks for the
 * replacement explicitly.
 */

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { apis, auditLog, consumers, contractSuites, deploys } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canUse } from "@/lib/plans";
import { planState } from "@/lib/queries";
import { assertionsFromJson, assertionsToJson, detectDrift, generateSuite } from "@/core/contract-tests";
import { normalizeUsage } from "@/core/impact";
import type { JsonObject } from "@/core/canonicalize";
import type { FormState } from "@/lib/form-state";

export async function generateSuiteAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, org } = await requireUser();
  const gate = canUse(await planState(org), new Date(), "contractTests");
  if (!gate.allowed) return { error: gate.message, ok: null };

  const slug = String(form.get("slug") ?? "");
  const consumerId = String(form.get("consumerId") ?? "");
  const framework = form.get("framework") === "jest" ? "jest" : "vitest";
  const replace = form.get("replace") === "on";

  const db = getDb();
  const [api] = await db
    .select()
    .from(apis)
    .where(and(eq(apis.organizationId, org.id), eq(apis.slug, slug)));
  if (!api) return { error: "That API is not on your organization.", ok: null };

  // Generate from the baseline if there is one, else the newest deploy: a suite
  // written against a PR candidate would assert a shape that never shipped.
  let source = null;
  if (api.baselineDeployId) {
    [source] = await db.select().from(deploys).where(eq(deploys.id, api.baselineDeployId));
  }
  if (!source) {
    [source] = await db
      .select()
      .from(deploys)
      .where(and(eq(deploys.apiId, api.id), eq(deploys.environment, "prod")))
      .orderBy(desc(deploys.pushedAt))
      .limit(1);
  }
  if (!source) {
    return { error: "Push a spec first — a contract suite is generated from a recorded deploy.", ok: null };
  }

  let consumer = null;
  if (consumerId) {
    [consumer] = await db
      .select()
      .from(consumers)
      .where(and(eq(consumers.apiId, api.id), eq(consumers.id, consumerId)));
    if (!consumer) return { error: "That consumer is not on this API.", ok: null };
  }

  const generated = generateSuite(source.specCanonical as JsonObject, {
    framework,
    apiName: api.name,
    deployLabel: source.versionLabel,
    consumerName: consumer?.name,
    declaredUsage: consumer ? normalizeUsage(consumer.declaredUsage) : undefined,
  });

  const [existing] = await db
    .select()
    .from(contractSuites)
    .where(
      consumer
        ? and(eq(contractSuites.apiId, api.id), eq(contractSuites.consumerId, consumer.id))
        : and(eq(contractSuites.apiId, api.id), eq(contractSuites.framework, framework)),
    )
    .orderBy(desc(contractSuites.generatedAt))
    .limit(1);

  if (existing && !replace) {
    const drift = detectDrift(assertionsFromJson(existing.assertions), generated.assertions);
    if (drift.added.length === 0 && drift.removed.length === 0) {
      return { error: null, ok: "No drift: the stored suite already matches the current spec." };
    }
    return {
      error: null,
      ok: `Drift found and nothing was overwritten. ${drift.added.length} new assertion${drift.added.length === 1 ? "" : "s"}, ${drift.removed.length} no longer in the spec${
        drift.removed.length > 0 ? ` (${drift.removed.slice(0, 3).map((a) => a.description).join("; ")})` : ""
      }. Tick "replace the stored suite" to take the new version.`,
    };
  }

  if (existing) {
    await db
      .update(contractSuites)
      .set({
        framework,
        sourceDeployId: source.id,
        filename: generated.filename,
        content: generated.source,
        assertions: assertionsToJson(generated.assertions) as never,
        generatedAt: new Date(),
      })
      .where(eq(contractSuites.id, existing.id));
  } else {
    await db.insert(contractSuites).values({
      apiId: api.id,
      consumerId: consumer?.id ?? null,
      framework,
      sourceDeployId: source.id,
      filename: generated.filename,
      content: generated.source,
      assertions: assertionsToJson(generated.assertions) as never,
    });
  }

  await db.insert(auditLog).values({
    organizationId: org.id,
    actor: user.email,
    action: existing ? "contract-suite.replace" : "contract-suite.generate",
    target: `${api.slug}${consumer ? ` / ${consumer.name}` : ""}`,
    metadata: { framework, assertions: generated.assertions.length, deploy: source.versionLabel } as never,
  });

  revalidatePath(`/apis/${slug}/settings`);
  return {
    error: null,
    ok: `${existing ? "Replaced" : "Generated"} ${generated.filename}: ${generated.assertions.length} assertions from ${source.versionLabel}.`,
  };
}

export async function deleteSuiteAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireUser();
  const slug = String(form.get("slug") ?? "");
  const suiteId = String(form.get("suiteId") ?? "");
  const db = getDb();

  const [api] = await db
    .select()
    .from(apis)
    .where(and(eq(apis.organizationId, org.id), eq(apis.slug, slug)));
  if (!api) return { error: "That API is not on your organization.", ok: null };

  await db.delete(contractSuites).where(and(eq(contractSuites.apiId, api.id), eq(contractSuites.id, suiteId)));
  revalidatePath(`/apis/${slug}/settings`);
  return { error: null, ok: "Suite removed." };
}
