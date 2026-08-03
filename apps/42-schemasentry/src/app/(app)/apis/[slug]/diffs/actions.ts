"use server";

/**
 * Diff-screen actions: acknowledge a finding, withdraw an acknowledgement,
 * re-compare a pair after a policy edit.
 *
 * The ack is the interesting one. DESIGN.md makes it hold-to-confirm *and*
 * requires a note, because the interaction is the point: SchemaSentry records
 * intent rather than letting a check be silenced. So a blank note is rejected
 * here, on the server, not only in the form.
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { acknowledgements, apis, auditLog, checkRuns, deploys, diffs } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { computeAndStoreDiff, draftChangelogFor } from "@/lib/ingest";
import { RULES } from "@/core/rules";
import type { FormState } from "@/lib/form-state";

const MIN_NOTE = 8;

async function loadDiff(organizationId: string, diffId: string) {
  const db = getDb();
  const [row] = await db
    .select({ diff: diffs, api: apis })
    .from(diffs)
    .innerJoin(apis, eq(diffs.apiId, apis.id))
    .where(and(eq(diffs.id, diffId), eq(apis.organizationId, organizationId)));
  return row ?? null;
}

/**
 * Acknowledge a finding.
 *
 * Scope: `api` (this change is intentional, stop counting it anywhere) or the
 * PR the diff came from. The unique index on
 * `(api_id, rule_id, json_pointer, scope_key)` is what makes the ack survive a
 * force-push: the finding rows are recreated on every check, the ack is not
 * keyed to them.
 */
export async function acknowledgeAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, org } = await requireUser();
  const diffId = String(form.get("diffId") ?? "");
  const ruleId = String(form.get("ruleId") ?? "");
  const jsonPointer = String(form.get("jsonPointer") ?? "");
  const note = String(form.get("note") ?? "").trim();
  const scope = form.get("scope") === "pr" ? "pr" : "api";

  if (!RULES.has(ruleId)) return { error: "That finding's rule is not in this engine version.", ok: null };
  if (note.length < MIN_NOTE) {
    return {
      error: `Write a note of at least ${MIN_NOTE} characters. The note is the point — it is what a consumer reads later.`,
      ok: null,
    };
  }

  const row = await loadDiff(org.id, diffId);
  if (!row) return { error: "That diff is not on your organization.", ok: null };

  const db = getDb();
  let scopeKey = "api";
  if (scope === "pr") {
    const [check] = await db
      .select()
      .from(checkRuns)
      .where(and(eq(checkRuns.apiId, row.api.id), eq(checkRuns.diffId, diffId)));
    if (!check?.repository || check.prNumber === null) {
      return { error: "This diff did not come from a pull request, so there is no PR to scope the ack to.", ok: null };
    }
    scopeKey = `pr:${check.repository}#${check.prNumber}`;
  }

  await db
    .insert(acknowledgements)
    .values({ apiId: row.api.id, ruleId, jsonPointer, scope, scopeKey, note, actor: user.email })
    .onConflictDoUpdate({
      target: [acknowledgements.apiId, acknowledgements.ruleId, acknowledgements.jsonPointer, acknowledgements.scopeKey],
      set: { note, actor: user.email, createdAt: new Date() },
    });

  await db.insert(auditLog).values({
    organizationId: org.id,
    actor: user.email,
    action: "finding.acknowledge",
    target: `${row.api.slug} ${ruleId}`,
    metadata: { jsonPointer, note, scopeKey } as never,
  });

  // Re-compute so the verdict on screen reflects the ack immediately. The
  // findings are kept and demoted to `info`; intent is recorded, not silenced.
  await recompute(row.api.id, row.diff.fromDeployId, row.diff.toDeployId, org.id, scopeKey);

  revalidatePath(`/apis/${row.api.slug}/diffs/${diffId}`);
  revalidatePath(`/apis/${row.api.slug}`);
  return { error: null, ok: "Acknowledged. The finding stays in the timeline with your note attached." };
}

export async function withdrawAckAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, org } = await requireUser();
  const diffId = String(form.get("diffId") ?? "");
  const ruleId = String(form.get("ruleId") ?? "");
  const jsonPointer = String(form.get("jsonPointer") ?? "");

  const row = await loadDiff(org.id, diffId);
  if (!row) return { error: "That diff is not on your organization.", ok: null };

  const db = getDb();
  await db
    .delete(acknowledgements)
    .where(
      and(
        eq(acknowledgements.apiId, row.api.id),
        eq(acknowledgements.ruleId, ruleId),
        eq(acknowledgements.jsonPointer, jsonPointer),
      ),
    );
  await db.insert(auditLog).values({
    organizationId: org.id,
    actor: user.email,
    action: "finding.unacknowledge",
    target: `${row.api.slug} ${ruleId}`,
    metadata: { jsonPointer } as never,
  });

  await recompute(row.api.id, row.diff.fromDeployId, row.diff.toDeployId, org.id);

  revalidatePath(`/apis/${row.api.slug}/diffs/${diffId}`);
  return { error: null, ok: "Acknowledgement withdrawn. The finding counts again." };
}

/** Re-run the engine over a stored pair — used after an ack or a policy edit. */
export async function recomputeAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireUser();
  const diffId = String(form.get("diffId") ?? "");
  const row = await loadDiff(org.id, diffId);
  if (!row) return { error: "That diff is not on your organization.", ok: null };

  const result = await recompute(row.api.id, row.diff.fromDeployId, row.diff.toDeployId, org.id);
  revalidatePath(`/apis/${row.api.slug}/diffs/${diffId}`);
  return {
    error: null,
    ok: result ? `Re-run on the current policy: ${result.toUpperCase()}.` : "Could not re-run: a deploy is missing.",
  };
}

async function recompute(
  apiId: string,
  fromDeployId: string,
  toDeployId: string,
  organizationId: string,
  extraScopeKey?: string,
): Promise<string | null> {
  const db = getDb();
  const [api] = await db.select().from(apis).where(and(eq(apis.id, apiId), eq(apis.organizationId, organizationId)));
  if (!api) return null;
  const [from] = await db.select().from(deploys).where(eq(deploys.id, fromDeployId));
  const [to] = await db.select().from(deploys).where(eq(deploys.id, toDeployId));
  if (!from || !to) return null;
  const diff = await computeAndStoreDiff(api, from, to, extraScopeKey ? [extraScopeKey] : []);
  await draftChangelogFor(api.id, diff);
  return diff.verdict;
}
