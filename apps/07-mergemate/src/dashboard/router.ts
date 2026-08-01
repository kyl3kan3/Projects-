/**
 * The dashboard's HTTP surface, mounted on the Probot server's express app.
 *
 * Typed against a deliberately tiny `HttpRouter` interface rather than express's
 * own types. Express is a transitive dependency of Probot, not a declared one, and
 * the four verbs used here are stable across express 4 and 5; the alternative is
 * adding a framework and its type package to a manifest that does not list them.
 *
 * Authorisation is checked on every route: a session may only see installations
 * GitHub said it can administer (`GET /user/installations` at sign-in). There is no
 * route that takes an installation id without that check.
 */

import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { and, count, eq, gte } from "drizzle-orm";
import { getDb } from "../db";
import { findings, installations, pullRequests, repositories, reviewRuns, seats } from "../db/schema";
import {
  activeRulebookVersion,
  findSubscription,
  listRecentRuns,
  listRepositories,
  listRulebookVersions,
  listRunFindings,
  listSuppressions,
  noiseStats,
  setRepositoryEnabled,
  updateInstallationSettings,
} from "../db/store";
import { queueDepth, queueEnabled } from "../review/queue";
import { billingPeriodStart, thresholdOverrideFor } from "../lib/plans";
import { DEFAULT_RULEBOOK, parseRulebook, resolvePolicy } from "../rules/rulebook";
import { RULEBOOK_TEMPLATES, TEMPLATE_IDS, type TemplateId } from "../rules/templates";
import { env } from "../lib/env";
import { log } from "../lib/logger";
import { CSS } from "./styles";
import { APP_ICON_SVG } from "./layout";
import { landingPage, type Receipts } from "./landing";
import { runGoldenSet } from "../eval/harness";
import {
  accountPage,
  errorPage,
  installationsPage,
  repositoriesPage,
  reviewsPage,
  runDetailPage,
  rulebookPage,
  signInPage,
} from "./views";
import {
  authorizeUrl,
  canSeeInstallation,
  clearCookieHeader,
  cookieHeader,
  exchangeOAuthCode,
  oauthConfigured,
  parseCookies,
  signSession,
  verifySession,
  type Session,
} from "./auth";

/* --------------------------------------------------------- tiny http api --- */

export interface HttpRequest {
  method: string;
  params: Record<string, string>;
  query: Record<string, unknown>;
  headers: Record<string, unknown>;
  /** Populated by the form-body middleware below. */
  formBody?: Record<string, string>;
  protocol?: string;
  on(event: string, listener: (chunk?: unknown) => void): void;
  setEncoding?(encoding: string): void;
}

export interface HttpResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

type Handler = (req: HttpRequest, res: HttpResponse) => void | Promise<void>;

export interface HttpRouter {
  get(path: string, handler: Handler): unknown;
  post(path: string, handler: Handler): unknown;
  use(handler: (req: HttpRequest, res: HttpResponse, next: () => void) => void): unknown;
}

const FONT_DIR = join(__dirname, "..", "..", "public", "fonts");
const oauthStates = new Map<string, number>();
const STATE_TTL_MS = 10 * 60 * 1000;

function html(res: HttpResponse, status: number, body: string, extraHeaders: [string, string][] = []) {
  res.statusCode = status;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  // A dashboard that renders model output and repository names has no business
  // loading anything from anywhere else.
  res.setHeader(
    "content-security-policy",
    "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  );
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("x-content-type-options", "nosniff");
  for (const [name, value] of extraHeaders) res.setHeader(name, value);
  res.end(body);
}

function redirect(res: HttpResponse, location: string, extraHeaders: [string, string][] = []) {
  res.statusCode = 302;
  res.setHeader("location", location);
  for (const [name, value] of extraHeaders) res.setHeader(name, value);
  res.end();
}

function readCookie(req: HttpRequest): string | undefined {
  const raw = req.headers["cookie"];
  return parseCookies(typeof raw === "string" ? raw : undefined)["mergemate_session"];
}

async function session(req: HttpRequest): Promise<Session | null> {
  return verifySession(readCookie(req));
}

function param(req: HttpRequest, name: string): string {
  return req.params[name] ?? "";
}

function queryString(req: HttpRequest, name: string): string | null {
  const value = req.query[name];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

/** Minimal application/x-www-form-urlencoded parser, so no body-parser is needed. */
export function formBodyMiddleware(
  req: HttpRequest,
  res: HttpResponse,
  next: () => void,
): void {
  if (req.method !== "POST") return next();
  const contentType = String(req.headers["content-type"] ?? "");
  if (!contentType.startsWith("application/x-www-form-urlencoded")) return next();

  let raw = "";
  let size = 0;
  req.setEncoding?.("utf8");
  req.on("data", (chunk) => {
    const text = String(chunk ?? "");
    size += text.length;
    // A form on this dashboard is never larger than a few hundred bytes.
    if (size > 16_384) return;
    raw += text;
  });
  req.on("end", () => {
    const parsed: Record<string, string> = {};
    for (const [key, value] of new URLSearchParams(raw)) parsed[key] = value;
    req.formBody = parsed;
    next();
  });
  req.on("error", () => next());
}

/* -------------------------------------------------------------- mounting --- */

export function mountDashboard(router: HttpRouter): void {
  router.use(formBodyMiddleware);

  /**
   * The landing page.
   *
   * Its numbers come from the golden set, computed once per process rather than
   * hard-coded, so a marketing claim cannot drift away from what the harness
   * actually measures. If the harness fails, the page is served without receipts
   * instead of with invented ones.
   */
  router.get("/", async (_req, res) => {
    html(res, 200, landingPage(await receipts()));
  });

  /* ---- assets ---- */
  router.get("/assets/app.css", (_req, res) => {
    res.statusCode = 200;
    res.setHeader("content-type", "text/css; charset=utf-8");
    res.setHeader("cache-control", "public, max-age=3600");
    res.end(CSS);
  });

  router.get("/assets/icon.svg", (_req, res) => {
    res.statusCode = 200;
    res.setHeader("content-type", "image/svg+xml");
    res.setHeader("cache-control", "public, max-age=86400");
    res.end(APP_ICON_SVG);
  });

  router.get("/fonts/:file", async (req, res) => {
    const file = param(req, "file");
    // Whitelisted, not sanitised: the only two fonts that exist.
    if (file !== "inter-latin-var.woff2" && file !== "jetbrains-mono-latin-var.woff2") {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    try {
      const body = await readFile(join(FONT_DIR, file));
      res.statusCode = 200;
      res.setHeader("content-type", "font/woff2");
      res.setHeader("cache-control", "public, max-age=31536000, immutable");
      res.end(body as unknown as string);
    } catch {
      res.statusCode = 404;
      res.end("not found");
    }
  });

  router.get("/templates/:id", (req, res) => {
    const id = param(req, "id").replace(/\.yml$/, "") as TemplateId;
    if (!TEMPLATE_IDS.includes(id)) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    res.statusCode = 200;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.setHeader("cache-control", "public, max-age=3600");
    res.end(RULEBOOK_TEMPLATES[id].yaml);
  });

  router.get("/healthz", (_req, res) => {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, queue: queueEnabled() ? "redis" : "inline" }));
  });

  /* ---- auth ---- */
  router.get("/login", async (req, res) => {
    const existing = await session(req);
    if (existing) return redirect(res, "/app");
    html(
      res,
      200,
      signInPage({
        oauthAvailable: oauthConfigured(),
        devLogin: env.devLoginEnabled,
        ...(queryString(req, "error") ? { error: String(queryString(req, "error")) } : {}),
      }),
    );
  });

  router.post("/login/dev", async (req, res) => {
    if (!env.devLoginEnabled) {
      html(res, 403, errorPage(403, "Local sign-in is disabled. Set MERGEMATE_DEV_LOGIN=1 outside production."));
      return;
    }
    const login = (req.formBody?.["login"] ?? "").trim().slice(0, 40) || "local-dev";
    const token = await signSession({ login, installationIds: [], allInstallations: true });
    redirect(res, "/app", [["set-cookie", cookieHeader(token, false)]]);
  });

  router.post("/logout", (_req, res) => {
    redirect(res, "/login", [["set-cookie", clearCookieHeader()]]);
  });

  router.get("/auth/github", (req, res) => {
    if (!oauthConfigured()) return redirect(res, "/login?error=GitHub+sign-in+is+not+configured");
    const state = randomBytes(16).toString("hex");
    oauthStates.set(state, Date.now());
    for (const [key, at] of oauthStates) if (Date.now() - at > STATE_TTL_MS) oauthStates.delete(key);
    redirect(res, authorizeUrl(state, callbackUrl(req)));
  });

  router.get("/auth/github/callback", async (req, res) => {
    const code = queryString(req, "code");
    const state = queryString(req, "state");
    if (!code || !state || !oauthStates.has(state)) {
      return redirect(res, "/login?error=Sign-in+could+not+be+verified.+Try+again.");
    }
    oauthStates.delete(state);
    try {
      const identity = await exchangeOAuthCode(code, callbackUrl(req));
      const token = await signSession({
        login: identity.login,
        installationIds: identity.installationIds,
        allInstallations: false,
      });
      redirect(res, "/app", [["set-cookie", cookieHeader(token, true)]]);
    } catch (err) {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, "oauth callback failed");
      redirect(res, "/login?error=GitHub+sign-in+failed.+Try+again.");
    }
  });

  /* ---- installations ---- */
  router.get("/app", async (req, res) => {
    const s = await session(req);
    if (!s) return redirect(res, "/login");

    const db = getDb();
    const rows = await db.select().from(installations).orderBy(installations.accountLogin).limit(100);
    const visible = rows.filter((r) => r.deletedAt === null && canSeeInstallation(s, r.githubInstallationId));

    const since = daysAgo(30);
    const enriched = [];
    for (const installation of visible) {
      const repoRows = await db
        .select({ n: count() })
        .from(repositories)
        .where(eq(repositories.installationId, installation.id));
      const postedRows = await db
        .select({ n: count() })
        .from(findings)
        .innerJoin(reviewRuns, eq(reviewRuns.id, findings.reviewRunId))
        .innerJoin(pullRequests, eq(pullRequests.id, reviewRuns.pullRequestId))
        .innerJoin(repositories, eq(repositories.id, pullRequests.repositoryId))
        .where(
          and(
            eq(repositories.installationId, installation.id),
            eq(findings.posted, true),
            gte(findings.createdAt, since),
          ),
        );
      enriched.push({
        installation,
        repoCount: Number(repoRows[0]?.n ?? 0),
        postedLast30: Number(postedRows[0]?.n ?? 0),
      });
    }

    html(res, 200, installationsPage({ login: s.login, installations: enriched }));
  });

  router.get("/app/installations/:id", async (req, res) => {
    const ctx = await installationContext(req, res);
    if (!ctx) return;
    const stats = await noiseStats({ installationId: ctx.installation.id, since: daysAgo(30) });
    const runs = await listRecentRuns(ctx.installation.id, 25);
    const weekly = await weeklyCommentAverages(ctx.installation.id);
    const queue = queueEnabled() ? await queueDepth().catch(() => null) : null;
    html(
      res,
      200,
      reviewsPage({ login: ctx.session.login, installation: ctx.installation, stats, weekly, runs, queue }),
    );
  });

  router.get("/app/installations/:id/repositories", async (req, res) => {
    const ctx = await installationContext(req, res);
    if (!ctx) return;
    const repos = await listRepositories(ctx.installation.id);
    const db = getDb();
    const enriched = [];
    for (const repo of repos) {
      const runRows = await db
        .select({ n: count() })
        .from(reviewRuns)
        .innerJoin(pullRequests, eq(pullRequests.id, reviewRuns.pullRequestId))
        .where(eq(pullRequests.repositoryId, repo.id));
      const postedRows = await db
        .select({ n: count() })
        .from(findings)
        .innerJoin(reviewRuns, eq(reviewRuns.id, findings.reviewRunId))
        .innerJoin(pullRequests, eq(pullRequests.id, reviewRuns.pullRequestId))
        .where(and(eq(pullRequests.repositoryId, repo.id), eq(findings.posted, true)));
      const active = await activeRulebookVersion(repo);
      enriched.push({
        repo,
        runs: Number(runRows[0]?.n ?? 0),
        posted: Number(postedRows[0]?.n ?? 0),
        rulebookVersion: active?.version ?? null,
      });
    }
    html(
      res,
      200,
      repositoriesPage({ login: ctx.session.login, installation: ctx.installation, repositories: enriched }),
    );
  });

  router.get("/app/installations/:id/rulebook", async (req, res) => {
    const ctx = await installationContext(req, res);
    if (!ctx) return;
    const repos = await listRepositories(ctx.installation.id);
    const requested = queryString(req, "repo");
    // Default to a repository that actually has a rulebook: landing on the empty
    // state when a sibling repo has 12 versions of rules reads as a bug.
    const selected =
      repos.find((r) => r.id === requested) ??
      repos.find((r) => r.activeRulebookVersionId !== null) ??
      repos[0] ??
      null;
    const active = selected ? await activeRulebookVersion(selected) : null;
    const versions = selected ? await listRulebookVersions(selected.id, 20) : [];
    const fireCounts = selected ? await ruleFireCounts(selected.id) : {};
    html(
      res,
      200,
      rulebookPage({
        login: ctx.session.login,
        installation: ctx.installation,
        repositories: repos,
        selected,
        active,
        versions,
        ruleFireCounts: fireCounts,
      }),
    );
  });

  router.get("/app/installations/:id/account", async (req, res) => {
    const ctx = await installationContext(req, res);
    if (!ctx) return;
    const subscription = await findSubscription(ctx.installation.id);
    const suppressions = await listSuppressions(ctx.installation.id, 50);
    const seatsUsed = await currentSeatCount(ctx.installation.id);
    const policy = resolvePolicy({
      config: DEFAULT_RULEBOOK,
      installationThreshold: thresholdOverrideFor(
        ctx.installation.plan,
        ctx.installation.settings.confidenceThreshold,
      ),
      defaultThreshold: env.confidenceThreshold,
      defaultMaxComments: env.maxCommentsPerPr,
    });
    html(
      res,
      200,
      accountPage({
        login: ctx.session.login,
        installation: ctx.installation,
        seatsUsed,
        seatLimit: subscription?.seatLimit ?? 0,
        suppressions,
        thresholdBp: policy.thresholdBp,
      }),
    );
  });

  router.get("/app/runs/:id", async (req, res) => {
    const s = await session(req);
    if (!s) return redirect(res, "/login");
    const runId = param(req, "id");
    if (!isUuid(runId)) return html(res, 404, errorPage(404, "No such review."));

    const db = getDb();
    const rows = await db
      .select({
        run: reviewRuns,
        prNumber: pullRequests.githubPrNumber,
        prTitle: pullRequests.title,
        repoFullName: repositories.fullName,
        repositoryId: repositories.id,
        installationId: repositories.installationId,
        githubInstallationId: installations.githubInstallationId,
      })
      .from(reviewRuns)
      .innerJoin(pullRequests, eq(pullRequests.id, reviewRuns.pullRequestId))
      .innerJoin(repositories, eq(repositories.id, pullRequests.repositoryId))
      .innerJoin(installations, eq(installations.id, repositories.installationId))
      .where(eq(reviewRuns.id, runId))
      .limit(1);
    const row = rows[0];
    if (!row) return html(res, 404, errorPage(404, "No such review."));
    if (!canSeeInstallation(s, row.githubInstallationId)) {
      return html(res, 404, errorPage(404, "No such review."));
    }

    const installation = await db
      .select()
      .from(installations)
      .where(eq(installations.id, row.installationId))
      .limit(1);
    const installationRow = installation[0];
    if (!installationRow) return html(res, 404, errorPage(404, "No such review."));

    const runFindings = await listRunFindings(runId);
    const repo = await db
      .select()
      .from(repositories)
      .where(eq(repositories.id, row.repositoryId))
      .limit(1);
    const active = repo[0] ? await activeRulebookVersion(repo[0]) : null;
    const config = active?.isValid ? parseRulebook(active.rawYaml).config : DEFAULT_RULEBOOK;
    const policy = resolvePolicy({
      config,
      installationThreshold: thresholdOverrideFor(
        installationRow.plan,
        installationRow.settings.confidenceThreshold,
      ),
      defaultThreshold: env.confidenceThreshold,
      defaultMaxComments: env.maxCommentsPerPr,
    });

    html(
      res,
      200,
      runDetailPage({
        login: s.login,
        installation: installationRow,
        run: {
          runId: row.run.id,
          status: row.run.status,
          detail: row.run.detail,
          trigger: row.run.trigger,
          model: row.run.model,
          costMicroUsd: row.run.costMicroUsd,
          latencyMs: row.run.latencyMs,
          findingsTotal: row.run.findingsTotal,
          findingsPosted: row.run.findingsPosted,
          createdAt: row.run.createdAt,
          prNumber: row.prNumber,
          prTitle: row.prTitle,
          repoFullName: row.repoFullName,
          repositoryId: row.repositoryId,
        },
        findings: runFindings,
        thresholdBp: policy.thresholdBp,
        rulebookVersion: active?.version ?? null,
      }),
    );
  });

  /* ---- mutations ---- */
  router.post("/app/installations/:id/shadow", async (req, res) => {
    const ctx = await installationContext(req, res);
    if (!ctx) return;
    const on = req.formBody?.["shadow"] === "1";
    await updateInstallationSettings(ctx.installation.id, {
      ...ctx.installation.settings,
      shadowMode: on,
    });
    redirect(res, `/app/installations/${ctx.installation.id}/account`);
  });

  router.post("/app/repositories/:id/enabled", async (req, res) => {
    const s = await session(req);
    if (!s) return redirect(res, "/login");
    const repositoryId = param(req, "id");
    if (!isUuid(repositoryId)) return html(res, 404, errorPage(404, "No such repository."));

    const db = getDb();
    const rows = await db
      .select({
        repo: repositories,
        installationId: installations.id,
        githubInstallationId: installations.githubInstallationId,
      })
      .from(repositories)
      .innerJoin(installations, eq(installations.id, repositories.installationId))
      .where(eq(repositories.id, repositoryId))
      .limit(1);
    const row = rows[0];
    if (!row || !canSeeInstallation(s, row.githubInstallationId)) {
      return html(res, 404, errorPage(404, "No such repository."));
    }

    await setRepositoryEnabled(repositoryId, req.formBody?.["enabled"] === "1");
    redirect(res, `/app/installations/${row.installationId}/repositories`);
  });
}

/* --------------------------------------------------------------- helpers --- */

let cachedReceipts: Receipts | null = null;

/** Golden-set numbers for the landing page, computed once and cached. */
async function receipts(): Promise<Receipts> {
  if (cachedReceipts) return cachedReceipts;
  try {
    const report = await runGoldenSet();
    const t = report.totals;
    cachedReceipts = {
      cases: t.cases,
      cleanSilent: t.cleanSilent,
      cleanCases: t.cleanCases,
      postedFindings: t.postedFindings,
      falsePositiveRate: t.falsePositiveRate,
      commentsPerPr: t.postedFindings / Math.max(1, t.cases),
      model: report.model,
      usingFakeModel: report.usingFakeModel,
    };
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, "golden set failed; landing page has no receipts");
    cachedReceipts = {
      cases: 0,
      cleanSilent: 0,
      cleanCases: 0,
      postedFindings: 0,
      falsePositiveRate: 0,
      commentsPerPr: 0,
      model: "unknown",
      usingFakeModel: true,
    };
  }
  return cachedReceipts;
}

interface InstallationContext {
  session: Session;
  installation: NonNullable<Awaited<ReturnType<typeof loadInstallation>>>;
}

async function loadInstallation(id: string) {
  const db = getDb();
  const rows = await db.select().from(installations).where(eq(installations.id, id)).limit(1);
  return rows[0] ?? null;
}

async function installationContext(
  req: HttpRequest,
  res: HttpResponse,
): Promise<InstallationContext | null> {
  const s = await session(req);
  if (!s) {
    redirect(res, "/login");
    return null;
  }
  const id = param(req, "id");
  if (!isUuid(id)) {
    html(res, 404, errorPage(404, "No such installation."));
    return null;
  }
  const installation = await loadInstallation(id);
  if (!installation || installation.deletedAt !== null) {
    html(res, 404, errorPage(404, "No such installation."));
    return null;
  }
  if (!canSeeInstallation(s, installation.githubInstallationId)) {
    // 404 rather than 403: whether an installation exists is itself information.
    html(res, 404, errorPage(404, "No such installation."));
    return null;
  }
  return { session: s, installation };
}

/** Unique pull-request authors this billing period — the seat count. */
async function currentSeatCount(installationId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ n: count() })
    .from(seats)
    .where(and(eq(seats.installationId, installationId), eq(seats.billablePeriod, billingPeriodStart(new Date()))));
  return Number(rows[0]?.n ?? 0);
}

async function ruleFireCounts(repositoryId: string): Promise<Record<string, number>> {
  const db = getDb();
  const rows = await db
    .select({ ruleId: findings.ruleId, n: count() })
    .from(findings)
    .innerJoin(reviewRuns, eq(reviewRuns.id, findings.reviewRunId))
    .innerJoin(pullRequests, eq(pullRequests.id, reviewRuns.pullRequestId))
    .where(and(eq(pullRequests.repositoryId, repositoryId), gte(findings.createdAt, daysAgo(30))))
    .groupBy(findings.ruleId);
  const out: Record<string, number> = {};
  for (const row of rows) if (row.ruleId) out[row.ruleId] = Number(row.n);
  return out;
}

/**
 * Posted comments per completed review, bucketed by week, oldest first.
 *
 * Derived at read time rather than stored: a rolled-up column would go stale the
 * moment a review lands, and a stale noise number is the one statistic a customer
 * will actually check.
 */
async function weeklyCommentAverages(installationId: string, weeks = 12): Promise<number[]> {
  const db = getDb();
  const since = daysAgo(weeks * 7);
  const rows = await db
    .select({ createdAt: reviewRuns.createdAt, posted: reviewRuns.findingsPosted, status: reviewRuns.status })
    .from(reviewRuns)
    .innerJoin(pullRequests, eq(pullRequests.id, reviewRuns.pullRequestId))
    .innerJoin(repositories, eq(repositories.id, pullRequests.repositoryId))
    .where(and(eq(repositories.installationId, installationId), gte(reviewRuns.createdAt, since)));

  const buckets: { total: number; runs: number }[] = Array.from({ length: weeks }, () => ({
    total: 0,
    runs: 0,
  }));
  const now = Date.now();
  for (const row of rows) {
    if (row.status !== "posted" && row.status !== "silent") continue;
    const ageWeeks = Math.floor((now - row.createdAt.getTime()) / (7 * 24 * 60 * 60 * 1000));
    const index = weeks - 1 - Math.min(weeks - 1, Math.max(0, ageWeeks));
    const bucket = buckets[index];
    if (!bucket) continue;
    bucket.total += row.posted;
    bucket.runs += 1;
  }
  const populated = buckets.filter((b) => b.runs > 0);
  if (populated.length < 2) return [];
  return buckets.map((b) => (b.runs === 0 ? 0 : Number((b.total / b.runs).toFixed(2))));
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function callbackUrl(req: HttpRequest): string {
  const base = env.dashboardUrl.replace(/\/$/, "");
  void req;
  return `${base}/auth/github/callback`;
}
