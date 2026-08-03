/**
 * The `/v1` surface, expressed as transport-agnostic handlers.
 *
 * ARCHITECTURE.md puts the API on Fastify because the CLI and CI call it far
 * more than a browser does; the portfolio deploys to Vercel, where a Next route
 * handler is the thing that exists. Rather than write the endpoints twice, the
 * logic lives here as `(request) => response` and both `src/app/api/v1/*` and
 * `src/api/index.ts` are ten-line adapters over it. One implementation, one set
 * of tests, two ways to host it.
 *
 * Every handler authenticates with a hashed API token, and every response is
 * JSON with a `message` a CLI can print verbatim.
 */

import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { apis } from "@/db/schema";
import { ENGINE_VERSION } from "@/core";
import { apiRank, diffUrl, pushSpec, type StoredDiff } from "@/lib/ingest";
import { resolveToken, tokenCoversApi, touchToken, type TokenContext } from "@/lib/tokens";
import { drainDeliveries } from "@/lib/notify";

export interface ServiceRequest {
  authorization?: string | null;
  body: unknown;
}

export interface ServiceResponse {
  status: number;
  body: Record<string, unknown>;
}

const json = (status: number, body: Record<string, unknown>): ServiceResponse => ({ status, body });

const UNAUTHORIZED = json(401, {
  error: "unauthorized",
  message:
    "No valid API token. Pass SCHEMASENTRY_TOKEN or --token, and create one in Settings if you have not yet.",
});

/* --------------------------------------------------------------- schemas */

const environment = z.enum(["prod", "staging", "pr"]);

const pushBody = z.object({
  api: z.string().min(1, "Name the API with --api <slug>."),
  spec: z.string().min(1, "The spec body is empty."),
  version: z.string().max(120).optional().nullable(),
  environment: environment.default("prod"),
});

const checkBody = z.object({
  api: z.string().min(1, "Name the API with --api <slug>."),
  spec: z.string().min(1, "The spec body is empty."),
  version: z.string().max(120).optional().nullable(),
  pr: z
    .object({
      repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/, "Use owner/repo."),
      number: z.number().int().positive(),
      headSha: z.string().max(80).optional(),
    })
    .optional(),
});

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue?.message ?? "The request body was not understood.";
}

/* ------------------------------------------------------------------- auth */

async function authenticate(req: ServiceRequest): Promise<TokenContext | null> {
  const ctx = await resolveToken(req.authorization);
  if (ctx) void touchToken(ctx.token.id);
  return ctx;
}

async function resolveApi(ctx: TokenContext, slug: string) {
  const db = getDb();
  const [api] = await db
    .select()
    .from(apis)
    .where(and(eq(apis.organizationId, ctx.org.id), eq(apis.slug, slug)));
  if (!api) {
    const available = await db
      .select({ slug: apis.slug })
      .from(apis)
      .where(eq(apis.organizationId, ctx.org.id))
      .orderBy(asc(apis.createdAt));
    return {
      api: null,
      response: json(404, {
        error: "api-not-found",
        message:
          available.length > 0
            ? `No API called "${slug}". This token can reach: ${available.map((a) => a.slug).join(", ")}.`
            : `No API called "${slug}". Add one in the dashboard first — it takes a name and a slug.`,
      }),
    };
  }
  if (!tokenCoversApi(ctx, api.id)) {
    return {
      api: null,
      response: json(403, {
        error: "token-scope",
        message: `This token is scoped to "${ctx.scopedApi?.slug}" and cannot touch "${slug}".`,
      }),
    };
  }
  return { api, response: null };
}

/* --------------------------------------------------------------- payloads */

function diffPayload(diff: StoredDiff, apiSlug: string) {
  return {
    id: diff.id,
    verdict: diff.verdict,
    summary: diff.summary,
    fails: diff.fails,
    from: diff.fromLabel,
    to: diff.toLabel,
    url: diffUrl(apiSlug, diff.id),
    findings: diff.findings.map((f) => ({
      ruleId: f.ruleId,
      level: f.level,
      defaultLevel: f.defaultLevel,
      jsonPointer: f.jsonPointer,
      endpoint: f.endpoint,
      method: f.method,
      side: f.side,
      fieldPath: f.fieldPath,
      message: f.message,
      why: f.why,
    })),
    consumers: diff.impacts.map((i) => ({
      name: i.name,
      impacted: i.impacted,
      worst: i.worst,
      reasons: i.details.map((d) => ({ level: d.level, message: d.message, reason: d.reason })),
    })),
  };
}

/* -------------------------------------------------------------- POST /v1/specs */

/** Record a deploy. The CLI's `push`. */
export async function handlePush(req: ServiceRequest): Promise<ServiceResponse> {
  const ctx = await authenticate(req);
  if (!ctx) return UNAUTHORIZED;

  const parsed = pushBody.safeParse(req.body);
  if (!parsed.success) return json(400, { error: "bad-request", message: firstIssue(parsed.error) });

  const { api, response } = await resolveApi(ctx, parsed.data.api);
  if (!api) return response!;

  const result = await pushSpec({
    org: ctx.org,
    api,
    versionLabel: parsed.data.version ?? null,
    environment: parsed.data.environment,
    rawSpec: parsed.data.spec,
    pushedBy: `token:${ctx.token.label}`,
    apiRank: await apiRank(ctx.org.id, api.id),
  });

  if (!result.ok) {
    const status = result.error.code === "plan" ? 402 : result.error.code === "spec-invalid" ? 422 : 413;
    return json(status, { error: result.error.code, message: result.error.message, upgradeTo: result.error.upgradeTo ?? null });
  }

  // Deliveries are drained inline so a push in a normal (non-serverless) deploy
  // gets its Slack alert in seconds rather than waiting for the next cron tick.
  await drainDeliveries(5, 5_000).catch(() => undefined);

  return json(result.idempotent ? 200 : 201, {
    engineVersion: ENGINE_VERSION,
    deploy: {
      id: result.deploy.id,
      version: result.deploy.versionLabel,
      environment: result.deploy.environment,
      pushedAt: result.deploy.pushedAt.toISOString(),
      idempotent: result.idempotent,
    },
    specHealth: result.health,
    baselineSet: result.baselineSet,
    diff: result.diff ? diffPayload(result.diff, api.slug) : null,
    message: result.baselineSet
      ? `Recorded ${result.deploy.versionLabel} as the baseline for ${api.slug}. The next push produces the first diff.`
      : result.idempotent
        ? `${result.deploy.versionLabel} was already recorded for ${api.slug} (${result.deploy.environment}). Nothing changed.`
        : `Recorded ${result.deploy.versionLabel} for ${api.slug}: ${result.diff?.verdict.toUpperCase()}.`,
  });
}

/* -------------------------------------------------------------- POST /v1/check */

/**
 * The synchronous PR gate. Runs the engine inline — no queue — and returns the
 * verdict plus everything the CLI needs to decide its exit code.
 */
export async function handleCheck(req: ServiceRequest): Promise<ServiceResponse> {
  const ctx = await authenticate(req);
  if (!ctx) return UNAUTHORIZED;

  const parsed = checkBody.safeParse(req.body);
  if (!parsed.success) return json(400, { error: "bad-request", message: firstIssue(parsed.error) });

  const { api, response } = await resolveApi(ctx, parsed.data.api);
  if (!api) return response!;

  const result = await pushSpec({
    org: ctx.org,
    api,
    versionLabel: parsed.data.version ?? parsed.data.pr?.headSha ?? null,
    environment: "pr",
    rawSpec: parsed.data.spec,
    pushedBy: `token:${ctx.token.label}`,
    apiRank: await apiRank(ctx.org.id, api.id),
    pr: parsed.data.pr,
  });

  if (!result.ok) {
    const status = result.error.code === "plan" ? 402 : result.error.code === "spec-invalid" ? 422 : 413;
    return json(status, { error: result.error.code, message: result.error.message, upgradeTo: result.error.upgradeTo ?? null });
  }

  if (!result.diff) {
    return json(200, {
      engineVersion: ENGINE_VERSION,
      verdict: "compatible",
      baselineSet: true,
      specHealth: result.health,
      diff: null,
      message: `${api.slug} has no baseline yet, so there is nothing to check against. This spec is now the baseline.`,
    });
  }

  return json(200, {
    engineVersion: ENGINE_VERSION,
    verdict: result.diff.verdict,
    specHealth: result.health,
    diff: diffPayload(result.diff, api.slug),
    message: `${result.diff.verdict.toUpperCase()} — ${result.diff.summary.breaking} breaking, ${result.diff.summary.risky} risky, ${result.diff.summary.compatible} compatible.`,
  });
}

/* --------------------------------------------------------------- GET /v1/apis */

/** What can this token see? The CLI prints it when `--api` is wrong. */
export async function handleListApis(req: ServiceRequest): Promise<ServiceResponse> {
  const ctx = await authenticate(req);
  if (!ctx) return UNAUTHORIZED;

  const rows = await getDb()
    .select({ slug: apis.slug, name: apis.name, visibility: apis.visibility })
    .from(apis)
    .where(eq(apis.organizationId, ctx.org.id))
    .orderBy(asc(apis.createdAt));

  const scoped = ctx.scopedApi ? rows.filter((r) => r.slug === ctx.scopedApi!.slug) : rows;
  return json(200, {
    organization: { name: ctx.org.name, slug: ctx.org.slug, plan: ctx.org.plan },
    apis: scoped,
    message: scoped.length === 0 ? "No APIs are registered on this organization yet." : "",
  });
}
