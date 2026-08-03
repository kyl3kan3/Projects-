/**
 * Deploy markers — the input side of the deploy-correlation feature README.md
 * calls "the feature competitors skip".
 *
 * Two shapes are accepted on one endpoint, because a team either has a GitHub
 * App installed or a `curl` at the end of their deploy script, and asking them to
 * care which is a reason not to adopt:
 *
 * - **GitHub webhooks** (`push`, `deployment_status`), verified with the
 *   `x-hub-signature-256` HMAC.
 * - **A generic JSON post**, verified by the URL token, optionally with the same
 *   HMAC header.
 *
 * Parsing is pure and total: it never throws, and it never invents a timestamp
 * from `Date.now()` when the payload had one — a deploy marker in the wrong place
 * on the timeline is worse than no marker, because it produces a confident wrong
 * correlation.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export interface ParsedDeploy {
  serviceName: string;
  sha: string;
  deployedAt: Date;
  source: "github" | "webhook";
  repo: string | null;
  commitUrl: string | null;
  actor: string | null;
  environment: string | null;
}

export type ParseResult = { ok: true; deploy: ParsedDeploy } | { ok: false; error: string };

/** `9f3c2ab` — the display form; the stored value keeps whatever we were given. */
export function shortSha(sha: string): string {
  return sha.trim().slice(0, 7);
}

function serviceFromRepo(repo: string): string {
  const name = repo.includes("/") ? repo.split("/").pop() ?? repo : repo;
  return name.trim() || repo;
}

const genericSchema = z.object({
  // `service` is what the timeline is grouped by, so it is the one required field
  // beyond the sha.
  service: z.string().min(1).max(120),
  sha: z.string().min(4).max(80),
  deployed_at: z.string().optional(),
  repo: z.string().max(200).optional(),
  commit_url: z.string().url().max(500).optional(),
  actor: z.string().max(120).optional(),
  environment: z.string().max(60).optional(),
});

const pushSchema = z.object({
  after: z.string().min(7),
  repository: z.object({ full_name: z.string().min(1), html_url: z.string().optional() }),
  head_commit: z
    .object({ timestamp: z.string().optional(), url: z.string().optional() })
    .nullable()
    .optional(),
  pusher: z.object({ name: z.string().optional() }).optional(),
  ref: z.string().optional(),
});

const deploymentStatusSchema = z.object({
  action: z.string().optional(),
  deployment_status: z.object({
    state: z.string(),
    updated_at: z.string().optional(),
    creator: z.object({ login: z.string().optional() }).nullable().optional(),
  }),
  deployment: z.object({
    sha: z.string().min(7),
    environment: z.string().optional(),
    task: z.string().optional(),
  }),
  repository: z.object({ full_name: z.string().min(1), html_url: z.string().optional() }),
});

function parseDate(value: string | undefined, fallback: Date): Date | null {
  if (!value) return fallback;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

/**
 * `receivedAt` is the fallback timestamp, passed in rather than read from the
 * clock so this stays pure and testable.
 */
export function parseDeployPayload(
  githubEvent: string | null,
  body: unknown,
  receivedAt: Date,
): ParseResult {
  if (githubEvent === "ping") return { ok: false, error: "ping" };

  if (githubEvent === "push") {
    const parsed = pushSchema.safeParse(body);
    if (!parsed.success) return { ok: false, error: "Unrecognised GitHub push payload" };
    const p = parsed.data;
    // Branch deletions post an all-zero sha with no commit; nothing was deployed.
    if (/^0+$/.test(p.after)) return { ok: false, error: "Branch deleted; no deploy recorded" };
    const at = parseDate(p.head_commit?.timestamp, receivedAt);
    if (!at) return { ok: false, error: "Unparseable commit timestamp" };
    return {
      ok: true,
      deploy: {
        serviceName: serviceFromRepo(p.repository.full_name),
        sha: p.after,
        deployedAt: at,
        source: "github",
        repo: p.repository.full_name,
        commitUrl: p.head_commit?.url ?? `${p.repository.html_url ?? ""}/commit/${p.after}` || null,
        actor: p.pusher?.name ?? null,
        environment: p.ref?.replace("refs/heads/", "") ?? null,
      },
    };
  }

  if (githubEvent === "deployment_status") {
    const parsed = deploymentStatusSchema.safeParse(body);
    if (!parsed.success) return { ok: false, error: "Unrecognised GitHub deployment payload" };
    const p = parsed.data;
    // Only a successful deployment changes what is running, and therefore what
    // can move the bill.
    if (p.deployment_status.state !== "success") {
      return { ok: false, error: `Ignored deployment state "${p.deployment_status.state}"` };
    }
    const at = parseDate(p.deployment_status.updated_at, receivedAt);
    if (!at) return { ok: false, error: "Unparseable deployment timestamp" };
    return {
      ok: true,
      deploy: {
        serviceName: p.deployment.task || serviceFromRepo(p.repository.full_name),
        sha: p.deployment.sha,
        deployedAt: at,
        source: "github",
        repo: p.repository.full_name,
        commitUrl: `${p.repository.html_url ?? ""}/commit/${p.deployment.sha}` || null,
        actor: p.deployment_status.creator?.login ?? null,
        environment: p.deployment.environment ?? null,
      },
    };
  }

  if (githubEvent) {
    return { ok: false, error: `Ignored GitHub event "${githubEvent}"` };
  }

  const parsed = genericSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Expected {"service","sha"} — ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    };
  }
  const g = parsed.data;
  const at = parseDate(g.deployed_at, receivedAt);
  if (!at) return { ok: false, error: `Unparseable deployed_at "${g.deployed_at}"` };
  return {
    ok: true,
    deploy: {
      serviceName: g.service.trim(),
      sha: g.sha.trim(),
      deployedAt: at,
      source: "webhook",
      repo: g.repo ?? null,
      commitUrl: g.commit_url ?? null,
      actor: g.actor ?? null,
      environment: g.environment ?? null,
    },
  };
}

/**
 * GitHub's `x-hub-signature-256`. Constant-time compare, and a missing signature
 * is a failure rather than a pass — this endpoint writes to the timeline that the
 * anomaly correlation reads, so an unauthenticated write is a way to blame an
 * innocent commit.
 */
export function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  signature: string | null,
): boolean {
  if (!secret || !signature) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** `9f3c2ab · api-server · TUE 14:02` — the deploy row and chart chip. */
export function deployChip(deploy: { sha: string; serviceName: string }, stamp: string): string {
  return `${shortSha(deploy.sha)} · ${deploy.serviceName} · ${stamp}`;
}
