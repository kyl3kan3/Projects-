/**
 * Spec ingestion and verdict production — the one code path that can produce a
 * verdict, so `push`, `check`, and the dashboard's "compare these two deploys"
 * all agree by construction.
 *
 * A PR check records a deploy too, with `environment: "pr"`. That is not a
 * shortcut: DESIGN.md's timeline has a PRs chip, the ack flow needs a stable
 * diff to point at from the PR comment, and a re-run of the same commit has to
 * be idempotent. The unique index on `(api_id, version_label, environment)` is
 * what makes a retried CI job a no-op rather than a duplicate row.
 */

import { createHash } from "node:crypto";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import {
  canonicalize,
  diffCanonical,
  draftEntry,
  ENGINE_VERSION,
  normalizePolicy,
  normalizeUsage,
  rollUp,
  SpecParseError,
  summarize,
  type ConsumerImpactResult,
  type ConsumerRecord,
  type Finding,
  type JsonObject,
  type SpecHealth,
  type Verdict,
} from "@/core";
import { getDb } from "@/db";
import {
  acknowledgements,
  apis,
  auditLog,
  changelogEntries,
  checkRuns,
  consumerImpacts,
  consumers,
  deploys,
  diffs,
  findings as findingsTable,
  organizations,
  type Deploy,
  type Environment,
  type Organization,
  type WatchedApi,
} from "@/db/schema";
import { env } from "@/lib/env";
import { buildCheckSummary, buildCheckTitle, buildPrComment, conclusionFor, createCheckRun, githubConfigured, upsertPrComment } from "@/lib/github";
import { canPush, type GateResult } from "@/lib/plans";
import { enqueueDelivery } from "@/lib/notify";
import { buildSlackMessage } from "@/lib/slack";

export const MAX_SPEC_BYTES = 6 * 1024 * 1024;

export type IngestErrorCode =
  | "plan"
  | "spec-invalid"
  | "spec-too-large"
  | "no-baseline"
  | "not-found";

export interface IngestError {
  code: IngestErrorCode;
  message: string;
  upgradeTo?: string | null;
  /** Spec-health warnings, when the failure is about spec quality. */
  warnings?: string[];
}

export interface StoredDiff {
  id: string;
  verdict: Verdict;
  summary: ReturnType<typeof summarize>;
  findings: Finding[];
  impacts: ConsumerImpactResult[];
  fromLabel: string;
  toLabel: string;
  /** Environment of the *new* side — a PR candidate is not a release. */
  toEnvironment: Environment;
  fails: boolean;
}

export interface PushOutcome {
  ok: true;
  deploy: Deploy;
  /** True when this exact (api, version, environment) had already been pushed. */
  idempotent: boolean;
  health: SpecHealth;
  /** Absent on the very first push: there is nothing to compare against yet. */
  diff: StoredDiff | null;
  baselineSet: boolean;
}

export type PushResult = PushOutcome | { ok: false; error: IngestError };

/* ------------------------------------------------------------------ helpers */

export function specFingerprint(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 12);
}

async function loadConsumers(apiId: string): Promise<ConsumerRecord[]> {
  const rows = await getDb().select().from(consumers).where(eq(consumers.apiId, apiId));
  return rows.map((c) => ({ id: c.id, name: c.name, declaredUsage: normalizeUsage(c.declaredUsage) }));
}

/**
 * Demote acknowledged findings to `info`, attaching the note.
 *
 * ARCHITECTURE.md: "Acks are visible in the deploy timeline forever (intent is
 * recorded, not silenced)." So the finding is kept, its level becomes `info`,
 * and `info` is excluded from the verdict roll-up — the check goes neutral for
 * that finding without the reasoning disappearing.
 */
export interface AckRecord {
  ruleId: string;
  jsonPointer: string;
  note: string;
  actor: string;
}

export function applyAcks(list: Finding[], acks: AckRecord[]): { findings: Finding[]; notes: Map<string, AckRecord> } {
  if (acks.length === 0) return { findings: list, notes: new Map() };
  const index = new Map(acks.map((a) => [`${a.ruleId} ${a.jsonPointer}`, a]));
  const notes = new Map<string, AckRecord>();
  const out = list.map((f) => {
    const key = `${f.ruleId} ${f.jsonPointer}`;
    const ack = index.get(key);
    if (!ack) return f;
    notes.set(key, ack);
    return { ...f, level: "info" as const };
  });
  return { findings: out, notes };
}

async function loadAcks(apiId: string, scopeKeys: string[]): Promise<AckRecord[]> {
  if (scopeKeys.length === 0) return [];
  // `inArray`, not a raw `sql` fragment with `= any(${array})`: a raw fragment
  // skips Drizzle's column encoder, so postgres.js hands the JS array to
  // Postgres as a plain string and every check dies on `malformed array
  // literal`. The query type-checks and builds perfectly happily either way.
  const rows = await getDb()
    .select()
    .from(acknowledgements)
    .where(and(eq(acknowledgements.apiId, apiId), inArray(acknowledgements.scopeKey, scopeKeys)));
  return rows.map((r) => ({ ruleId: r.ruleId, jsonPointer: r.jsonPointer, note: r.note, actor: r.actor }));
}

/* ---------------------------------------------------------------- diff store */

/**
 * Compute a diff between two stored deploys and persist it. Re-computing an
 * existing pair replaces its findings rather than adding a second diff row, so
 * a policy edit followed by a re-compare updates the verdict in place.
 */
export async function computeAndStoreDiff(
  api: WatchedApi,
  fromDeploy: Deploy,
  toDeploy: Deploy,
  extraScopeKeys: string[] = [],
): Promise<StoredDiff> {
  const db = getDb();
  const policy = normalizePolicy(api.policy);
  const consumerRecords = await loadConsumers(api.id);
  const raw = diffCanonical(
    fromDeploy.specCanonical as JsonObject,
    toDeploy.specCanonical as JsonObject,
    policy,
    consumerRecords,
  );

  const acks = await loadAcks(api.id, ["api", ...extraScopeKeys]);
  const { findings: acked, notes } = applyAcks(raw.findings, acks);
  const verdict = rollUp(acked);
  const summary = summarize(acked);
  const fails = policy.failOn === "risky" ? verdict !== "compatible" : verdict === "breaking";

  // Impacts are computed from the acknowledged list: a finding whose intent is
  // recorded must not keep telling a partner they are about to break.
  const impacts = raw.impacts.length > 0 ? recomputeImpacts(raw.impacts, acked) : [];

  const [row] = await db
    .insert(diffs)
    .values({
      apiId: api.id,
      fromDeployId: fromDeploy.id,
      toDeployId: toDeploy.id,
      engineVersion: ENGINE_VERSION,
      verdict,
      summary,
    })
    .onConflictDoUpdate({
      target: [diffs.fromDeployId, diffs.toDeployId],
      set: { verdict, summary, engineVersion: ENGINE_VERSION, computedAt: new Date() },
    })
    .returning();

  await db.delete(findingsTable).where(eq(findingsTable.diffId, row.id));
  if (acked.length > 0) {
    await db.insert(findingsTable).values(
      acked.map((f, ordinal) => ({
        diffId: row.id,
        ordinal,
        ruleId: f.ruleId,
        level: f.level,
        defaultLevel: f.defaultLevel,
        jsonPointer: f.jsonPointer,
        endpoint: f.endpoint,
        method: f.method,
        side: f.side,
        fieldPath: f.fieldPath,
        message: f.message,
        why:
          notes.has(`${f.ruleId} ${f.jsonPointer}`)
            ? `Acknowledged by ${notes.get(`${f.ruleId} ${f.jsonPointer}`)!.actor}: ${notes.get(`${f.ruleId} ${f.jsonPointer}`)!.note} — original reason: ${f.why}`
            : f.why,
        diffLines: f.diffLines as never,
        vars: f.vars as never,
      })),
    );
  }

  await db.delete(consumerImpacts).where(eq(consumerImpacts.diffId, row.id));
  if (impacts.length > 0) {
    await db.insert(consumerImpacts).values(
      impacts.map((i) => ({
        diffId: row.id,
        consumerId: i.consumerId,
        impacted: i.impacted,
        worst: i.worst,
        details: i.details as never,
      })),
    );
  }

  return {
    id: row.id,
    verdict,
    summary,
    findings: acked,
    impacts,
    fromLabel: fromDeploy.versionLabel,
    toLabel: toDeploy.versionLabel,
    toEnvironment: toDeploy.environment,
    fails,
  };
}

/** Drop impact details whose finding was acknowledged, then re-roll `worst`. */
function recomputeImpacts(impacts: ConsumerImpactResult[], acked: Finding[]): ConsumerImpactResult[] {
  return impacts.map((impact) => {
    const details = impact.details
      .map((d) => ({ ...d, level: acked[d.findingIndex]?.level ?? d.level }))
      .filter((d) => d.level !== "info");
    const worst = details.some((d) => d.level === "breaking")
      ? ("breaking" as const)
      : details.some((d) => d.level === "risky")
        ? ("risky" as const)
        : details.length > 0
          ? ("compatible" as const)
          : null;
    return { ...impact, details, worst, impacted: worst === "breaking" || worst === "risky" };
  });
}

/* -------------------------------------------------------- changelog drafting */

/**
 * Auto-draft a changelog entry for any non-compatible diff. Unique on
 * `diff_id`, so a re-push or a re-compare updates the draft instead of stacking
 * duplicates — and a *published* entry is never rewritten, because at that
 * point a human owns the words.
 */
export async function draftChangelogFor(apiId: string, diff: StoredDiff): Promise<void> {
  if (diff.verdict === "compatible") return;
  // A pull-request candidate is not a release. Drafting an entry for one fills
  // the editor with announcements for changes that may never merge, and the
  // first time somebody publishes one by mistake the changelog has lied to
  // every consumer. Entries are drafted when a deploy happens.
  if (diff.toEnvironment === "pr") return;
  const db = getDb();
  const drafted = draftEntry({
    fromLabel: diff.fromLabel,
    toLabel: diff.toLabel,
    findings: diff.findings,
    impactedConsumers: diff.impacts.filter((i) => i.impacted).map((i) => i.name),
  });

  const [existing] = await db.select().from(changelogEntries).where(eq(changelogEntries.diffId, diff.id));
  if (existing) {
    if (existing.status === "published") return;
    await db
      .update(changelogEntries)
      .set({
        title: drafted.title,
        bodyMd: drafted.bodyMd,
        breaking: drafted.breaking,
        versionLabel: diff.toLabel,
        anchor: drafted.anchor,
        updatedAt: new Date(),
      })
      .where(eq(changelogEntries.id, existing.id));
    return;
  }

  await db
    .insert(changelogEntries)
    .values({
      apiId,
      diffId: diff.id,
      status: "draft",
      title: drafted.title,
      bodyMd: drafted.bodyMd,
      breaking: drafted.breaking,
      versionLabel: diff.toLabel,
      anchor: drafted.anchor,
    })
    .onConflictDoNothing({ target: changelogEntries.diffId });
}

/* -------------------------------------------------------------- alert fan-out */

export function diffUrl(apiSlug: string, diffId: string): string {
  return `${env.appUrl}/apis/${apiSlug}/diffs/${diffId}`;
}

/**
 * Queue the Slack alert and any configured outbound webhook.
 *
 * Compatible diffs are silent by design — an alert for every green deploy is
 * how a channel gets muted, and a muted channel is the same as no product.
 */
export async function notifyDiff(
  org: Organization,
  api: WatchedApi,
  diff: StoredDiff,
  environment: Environment,
): Promise<{ slack: boolean; webhook: boolean }> {
  if (diff.verdict === "compatible") return { slack: false, webhook: false };

  const settings = (org.settings ?? {}) as Record<string, unknown>;
  const slackUrl =
    api.slackWebhookUrl ??
    (typeof settings.slackWebhookUrl === "string" ? settings.slackWebhookUrl : null) ??
    (env.slackWebhookUrl || null);
  const webhookUrl = typeof settings.webhookUrl === "string" ? settings.webhookUrl : null;

  const impactedNames = diff.impacts.filter((i) => i.impacted).map((i) => i.name);
  const perFinding = diff.findings.map((f, index) => ({
    level: f.level,
    message: f.message,
    jsonPointer: f.jsonPointer,
    endpoint: f.endpoint,
    method: f.method,
    impactedConsumers: diff.impacts
      .filter((i) => i.details.some((d) => d.findingIndex === index && (d.level === "breaking" || d.level === "risky")))
      .map((i) => i.name),
  }));

  const alert = {
    apiName: api.name,
    apiSlug: api.slug,
    verdict: diff.verdict,
    counts: diff.summary,
    fromLabel: diff.fromLabel,
    toLabel: diff.toLabel,
    environment,
    diffUrl: diffUrl(api.slug, diff.id),
    findings: perFinding,
    impactedConsumers: impactedNames,
  };

  let slack = false;
  let webhook = false;
  if (slackUrl) {
    slack = await enqueueDelivery({
      organizationId: org.id,
      apiId: api.id,
      diffId: diff.id,
      channel: "slack",
      target: slackUrl,
      dedupeKey: `slack:diff:${diff.id}`,
      payload: buildSlackMessage(alert),
    });
  }
  if (webhookUrl) {
    webhook = await enqueueDelivery({
      organizationId: org.id,
      apiId: api.id,
      diffId: diff.id,
      channel: "webhook",
      target: webhookUrl,
      dedupeKey: `webhook:diff:${diff.id}`,
      payload: {
        event: "diff.completed",
        api: api.slug,
        verdict: diff.verdict,
        summary: diff.summary,
        from: diff.fromLabel,
        to: diff.toLabel,
        url: alert.diffUrl,
        findings: diff.findings.map((f) => ({
          ruleId: f.ruleId,
          level: f.level,
          message: f.message,
          jsonPointer: f.jsonPointer,
          endpoint: f.endpoint,
          method: f.method,
        })),
        impactedConsumers: impactedNames,
      },
    });
  }
  return { slack, webhook };
}

/* -------------------------------------------------------------------- push */

export interface PushInput {
  org: Organization;
  api: WatchedApi;
  versionLabel?: string | null;
  environment: Environment;
  rawSpec: string;
  pushedBy: string;
  /** 1-based position of this API in the org, for the plan gate. */
  apiRank: number;
  /** PR context, when this push came from a `check`. */
  pr?: { repository: string; number: number; headSha?: string };
}

/**
 * Record a deploy and diff it against the API's baseline.
 *
 * Order matters: the plan gate runs *before* the spec is parsed so an
 * over-limit push cannot be recorded by accident, and the spec is parsed before
 * anything is written so a malformed file leaves no trace.
 */
export async function pushSpec(input: PushInput): Promise<PushResult> {
  const db = getDb();
  const now = new Date();

  if (Buffer.byteLength(input.rawSpec, "utf8") > MAX_SPEC_BYTES) {
    return {
      ok: false,
      error: {
        code: "spec-too-large",
        message: `The spec is larger than ${Math.round(MAX_SPEC_BYTES / 1024 / 1024)}MB. Bundle it or split the API.`,
      },
    };
  }

  const apiCount = await countApis(input.org.id);
  const gate: GateResult = canPush(
    { plan: input.org.plan, trialEndsAt: input.org.trialEndsAt, apiCount },
    now,
    input.apiRank,
  );
  if (!gate.allowed) {
    return { ok: false, error: { code: "plan", message: gate.message, upgradeTo: gate.upgradeTo } };
  }

  let canonical;
  try {
    canonical = await canonicalize(input.rawSpec);
  } catch (err) {
    if (err instanceof SpecParseError) {
      return { ok: false, error: { code: "spec-invalid", message: err.message } };
    }
    throw err;
  }

  const versionLabel = (input.versionLabel ?? "").trim() || specFingerprint(input.rawSpec);

  const [existing] = await db
    .select()
    .from(deploys)
    .where(
      and(
        eq(deploys.apiId, input.api.id),
        eq(deploys.versionLabel, versionLabel),
        eq(deploys.environment, input.environment),
      ),
    );

  let deploy: Deploy;
  let idempotent = false;
  if (existing) {
    deploy = existing;
    idempotent = true;
  } else {
    const [inserted] = await db
      .insert(deploys)
      .values({
        apiId: input.api.id,
        versionLabel,
        environment: input.environment,
        specCanonical: canonical.doc as never,
        rawSpec: input.rawSpec,
        specHealth: canonical.health as never,
        specTitle: canonical.title,
        openapiVersion: canonical.version,
        pushedBy: input.pushedBy,
      })
      .returning();
    deploy = inserted;
  }

  const baseline = await resolveBaseline(input.api, deploy);
  if (!baseline) {
    // First ever push: it becomes the baseline. Nothing to diff, and saying so
    // is more useful than an empty diff screen.
    await db.update(apis).set({ baselineDeployId: deploy.id }).where(eq(apis.id, input.api.id));
    return { ok: true, deploy, idempotent, health: canonical.health, diff: null, baselineSet: true };
  }

  const scopeKeys = input.pr ? [`pr:${input.pr.repository}#${input.pr.number}`] : [];
  const diff = await computeAndStoreDiff(input.api, baseline, deploy, scopeKeys);
  await draftChangelogFor(input.api.id, diff);
  await notifyDiff(input.org, input.api, diff, input.environment);

  // A prod push moves the baseline forward, which is what "diff against the
  // previous prod deploy" means. Staging and PR pushes never move it — they are
  // candidates measured against prod, not history.
  if (input.environment === "prod" && !idempotent) {
    await db.update(apis).set({ baselineDeployId: deploy.id }).where(eq(apis.id, input.api.id));
  }

  if (input.pr) {
    await recordCheckRun(input.api, diff, input.pr);
  }

  await db.insert(auditLog).values({
    organizationId: input.org.id,
    actor: input.pushedBy,
    action: idempotent ? "spec.push.repeat" : "spec.push",
    target: `${input.api.slug}@${versionLabel}`,
    metadata: { environment: input.environment, verdict: diff.verdict, summary: diff.summary } as never,
  });

  return { ok: true, deploy, idempotent, health: canonical.health, diff, baselineSet: false };
}

async function countApis(organizationId: string): Promise<number> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(apis)
    .where(eq(apis.organizationId, organizationId));
  return row?.count ?? 0;
}

/**
 * What does this deploy get compared against?
 *
 * The API's pinned baseline, unless that is the deploy we just pushed (which
 * happens on a re-push of the current prod version), in which case the previous
 * prod deploy is used instead.
 */
async function resolveBaseline(api: WatchedApi, candidate: Deploy): Promise<Deploy | null> {
  const db = getDb();
  if (api.baselineDeployId && api.baselineDeployId !== candidate.id) {
    const [pinned] = await db.select().from(deploys).where(eq(deploys.id, api.baselineDeployId));
    if (pinned) return pinned;
  }
  const [previous] = await db
    .select()
    .from(deploys)
    .where(and(eq(deploys.apiId, api.id), eq(deploys.environment, "prod"), ne(deploys.id, candidate.id)))
    .orderBy(desc(deploys.pushedAt))
    .limit(1);
  return previous ?? null;
}

/* ------------------------------------------------------------ the CI surfaces */

async function recordCheckRun(
  api: WatchedApi,
  diff: StoredDiff,
  pr: { repository: string; number: number; headSha?: string },
): Promise<void> {
  const db = getDb();
  const commentInput = {
    apiName: api.name,
    verdict: diff.verdict,
    counts: diff.summary,
    fromLabel: diff.fromLabel,
    toLabel: diff.toLabel,
    diffUrl: diffUrl(api.slug, diff.id),
    findings: diff.findings.map((f, index) => ({
      level: f.level,
      ruleId: f.ruleId,
      message: f.message,
      jsonPointer: f.jsonPointer,
      endpoint: f.endpoint,
      method: f.method,
      why: f.why,
      ackNote: f.level === "info" ? f.why : null,
      impactedConsumers: diff.impacts
        .filter((i) => i.details.some((d) => d.findingIndex === index && (d.level === "breaking" || d.level === "risky")))
        .map((i) => i.name),
    })),
    impactedConsumers: diff.impacts.filter((i) => i.impacted).map((i) => i.name),
    fails: diff.fails,
  };

  const [prior] = await db
    .select()
    .from(checkRuns)
    .where(and(eq(checkRuns.apiId, api.id), eq(checkRuns.repository, pr.repository), eq(checkRuns.prNumber, pr.number)));

  let commentRef = prior?.commentRef ?? null;
  let externalRef = prior?.externalRef ?? null;

  if (githubConfigured()) {
    // Best effort: a GitHub outage must not fail the customer's CI step, which
    // already has the verdict in its exit code.
    try {
      commentRef = await upsertPrComment(
        { repository: pr.repository, prNumber: pr.number, headSha: pr.headSha },
        buildPrComment(commentInput),
        commentRef,
      );
      externalRef = await createCheckRun(
        { repository: pr.repository, prNumber: pr.number, headSha: pr.headSha },
        buildCheckTitle(commentInput),
        buildCheckSummary(commentInput),
        conclusionFor(commentInput),
      );
    } catch {
      // Swallowed deliberately; the check_runs row below records the attempt.
    }
  }

  await db
    .insert(checkRuns)
    .values({
      apiId: api.id,
      diffId: diff.id,
      provider: githubConfigured() ? "github" : "generic",
      conclusion: conclusionFor(commentInput),
      prNumber: pr.number,
      repository: pr.repository,
      headSha: pr.headSha ?? null,
      commentRef,
      externalRef,
    })
    .onConflictDoUpdate({
      target: [checkRuns.apiId, checkRuns.repository, checkRuns.prNumber],
      set: {
        diffId: diff.id,
        conclusion: conclusionFor(commentInput),
        headSha: pr.headSha ?? null,
        commentRef,
        externalRef,
        updatedAt: new Date(),
      },
    });
}

/* ------------------------------------------------------------- lookup helpers */

export async function findApiBySlug(organizationId: string, slug: string): Promise<WatchedApi | null> {
  const [row] = await getDb()
    .select()
    .from(apis)
    .where(and(eq(apis.organizationId, organizationId), eq(apis.slug, slug)));
  return row ?? null;
}

/** 1-based creation rank, which is what the plan gate meters. */
export async function apiRank(organizationId: string, apiId: string): Promise<number> {
  const rows = await getDb()
    .select({ id: apis.id })
    .from(apis)
    .where(eq(apis.organizationId, organizationId))
    .orderBy(apis.createdAt, apis.id);
  const index = rows.findIndex((r) => r.id === apiId);
  return index < 0 ? rows.length + 1 : index + 1;
}

export async function orgById(organizationId: string): Promise<Organization | null> {
  const [row] = await getDb().select().from(organizations).where(eq(organizations.id, organizationId));
  return row ?? null;
}
