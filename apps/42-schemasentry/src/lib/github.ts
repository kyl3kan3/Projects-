/**
 * GitHub surfaces: the check run and the one PR comment.
 *
 * `buildCheckSummary` and `buildPrComment` are pure — they are what the tests
 * assert on, what the CLI prints with `--format markdown`, and what a customer
 * on a CI system other than GitHub Actions can post themselves. The network
 * side is a thin wrapper over the REST API with `fetch`; ARCHITECTURE.md calls
 * for a GitHub App with installation tokens, and that is the right end state,
 * but a PAT-shaped token exercises exactly the same endpoints and does not
 * require an app registration to be useful.
 *
 * **The single-comment rule.** ROADMAP acceptance: "PR comment updates in place
 * across force-pushes — never a second comment." That is guaranteed two ways: a
 * unique index on `check_runs (api_id, repository, pr_number)` holds the comment
 * id, and the comment body carries an HTML marker so a lost id can be recovered
 * by searching the thread rather than by posting again.
 *
 * No emoji anywhere in the comment (DESIGN.md).
 */

import { env } from "@/lib/env";

export const COMMENT_MARKER = "<!-- schemasentry:diff -->";

export interface CommentFinding {
  level: "breaking" | "risky" | "compatible" | "info";
  ruleId: string;
  message: string;
  jsonPointer: string;
  endpoint: string | null;
  method: string | null;
  why: string;
  impactedConsumers: string[];
  ackNote: string | null;
}

export interface CommentInput {
  apiName: string;
  verdict: "breaking" | "risky" | "compatible";
  counts: { breaking: number; risky: number; compatible: number; info: number };
  fromLabel: string;
  toLabel: string;
  diffUrl: string;
  findings: CommentFinding[];
  impactedConsumers: string[];
  /** True when the policy makes this verdict fail the check. */
  fails: boolean;
}

const VERDICT_WORD = { breaking: "BREAKING", risky: "RISKY", compatible: "COMPATIBLE" } as const;

function escapePipes(s: string): string {
  return s.replace(/\|/g, "\\|");
}

/** The check run's title — one line, read in the PR's checks list. */
export function buildCheckTitle(input: CommentInput): string {
  const word = VERDICT_WORD[input.verdict];
  if (input.verdict === "compatible") return `${word} — no consumer-visible breakage`;
  const n = input.verdict === "breaking" ? input.counts.breaking : input.counts.risky;
  return `${word} — ${n} finding${n === 1 ? "" : "s"} in ${input.apiName}`;
}

export function conclusionFor(input: CommentInput): "success" | "neutral" | "failure" {
  if (input.fails) return "failure";
  return input.verdict === "compatible" ? "success" : "neutral";
}

/** The findings table, shared by the check-run summary and the PR comment. */
function findingsTable(findings: CommentFinding[]): string[] {
  if (findings.length === 0) return ["No findings."];
  const rows = [
    "| Level | Endpoint | Change | Pointer | Affects |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const f of findings) {
    const where = f.endpoint ? `\`${f.method ?? ""} ${f.endpoint}\``.replace("` ", "`") : "API-wide";
    const affects =
      f.ackNote !== null
        ? `acknowledged — ${escapePipes(f.ackNote)}`
        : f.impactedConsumers.length > 0
          ? escapePipes(f.impactedConsumers.join(", "))
          : "—";
    rows.push(
      `| **${f.level.toUpperCase()}** | ${escapePipes(where)} | ${escapePipes(f.message)} | \`${f.jsonPointer}\` | ${affects} |`,
    );
  }
  return rows;
}

export function buildCheckSummary(input: CommentInput): string {
  const shown = input.findings.filter((f) => f.level !== "compatible").slice(0, 20);
  const lines = [
    `**${VERDICT_WORD[input.verdict]}** — \`${input.fromLabel}\` → \`${input.toLabel}\``,
    "",
    `${input.counts.breaking} breaking · ${input.counts.risky} risky · ${input.counts.compatible} compatible${input.counts.info > 0 ? ` · ${input.counts.info} acknowledged` : ""}`,
    "",
    ...findingsTable(shown),
  ];
  if (input.impactedConsumers.length > 0) {
    lines.push("", `**Impacted consumers:** ${input.impactedConsumers.join(", ")}`);
  }
  lines.push("", `[Full diff](${input.diffUrl})`);
  return lines.join("\n");
}

/**
 * The PR comment. Longer than the check summary because it is where the
 * reasoning lives — a reviewer should be able to agree or disagree without
 * leaving the page.
 */
export function buildPrComment(input: CommentInput): string {
  // Acknowledged findings belong in the table. They are the reason the check is
  // neutral rather than red, and hiding them would make the comment look like
  // SchemaSentry simply stopped noticing.
  const notable = input.findings.filter(
    (f) => f.level === "breaking" || f.level === "risky" || f.level === "info",
  );
  const lines: string[] = [
    COMMENT_MARKER,
    `### SchemaSentry — ${input.apiName}`,
    "",
    `**${VERDICT_WORD[input.verdict]}** · \`${input.fromLabel}\` → \`${input.toLabel}\``,
    "",
    `${input.counts.breaking} breaking · ${input.counts.risky} risky · ${input.counts.compatible} compatible${input.counts.info > 0 ? ` · ${input.counts.info} acknowledged` : ""}`,
    "",
  ];

  if (notable.length === 0) {
    lines.push("Nothing in this change breaks a declared consumer.", "");
  } else {
    lines.push(...findingsTable(notable), "");
    lines.push("<details><summary>Why each of these is classified this way</summary>", "");
    for (const f of notable) {
      lines.push(`- **${f.message}** (rule \`${f.ruleId}\`) — ${f.why}`);
    }
    lines.push("", "</details>", "");
  }

  if (input.impactedConsumers.length > 0) {
    lines.push(`**Impacted consumers:** ${input.impactedConsumers.join(", ")}`, "");
  }

  lines.push(
    input.fails
      ? "This check is failing. Acknowledge a finding with a note if the change is intentional — the intent is recorded in the timeline, not silenced."
      : "This check is not failing under your policy.",
    "",
    `[Open the diff](${input.diffUrl}) · [Acknowledge a finding](${input.diffUrl}#acknowledge)`,
  );
  return lines.join("\n");
}

/* ------------------------------------------------------------------ network */

export interface GitHubTarget {
  /** `owner/repo` */
  repository: string;
  prNumber: number;
  headSha?: string;
}

export interface GitHubResult {
  commentId: string | null;
  checkRunId: string | null;
}

export function githubConfigured(): boolean {
  return Boolean(env.githubToken);
}

async function gh(path: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${env.githubToken}`,
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub ${init.method ?? "GET"} ${path} responded ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return res.json().catch(() => null);
}

/**
 * Post or update the single comment. `knownCommentId` comes from `check_runs`;
 * when it is absent the thread is searched for the marker before posting, so a
 * cleared database still cannot produce a second comment.
 */
export async function upsertPrComment(
  target: GitHubTarget,
  body: string,
  knownCommentId: string | null,
): Promise<string | null> {
  if (!githubConfigured()) return null;

  if (knownCommentId) {
    try {
      await gh(`/repos/${target.repository}/issues/comments/${knownCommentId}`, {
        method: "PATCH",
        body: JSON.stringify({ body }),
      });
      return knownCommentId;
    } catch {
      // The comment was deleted; fall through to search-then-create.
    }
  }

  const existing = (await gh(
    `/repos/${target.repository}/issues/${target.prNumber}/comments?per_page=100`,
    { method: "GET" },
  )) as Array<{ id: number; body?: string }> | null;
  const mine = existing?.find((c) => typeof c.body === "string" && c.body.includes(COMMENT_MARKER));
  if (mine) {
    await gh(`/repos/${target.repository}/issues/comments/${mine.id}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    });
    return String(mine.id);
  }

  const created = (await gh(`/repos/${target.repository}/issues/${target.prNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  })) as { id: number } | null;
  return created ? String(created.id) : null;
}

export async function createCheckRun(
  target: GitHubTarget,
  title: string,
  summary: string,
  conclusion: "success" | "neutral" | "failure",
): Promise<string | null> {
  if (!githubConfigured() || !target.headSha) return null;
  const created = (await gh(`/repos/${target.repository}/check-runs`, {
    method: "POST",
    body: JSON.stringify({
      name: "SchemaSentry",
      head_sha: target.headSha,
      status: "completed",
      conclusion,
      completed_at: new Date().toISOString(),
      output: { title, summary },
    }),
  })) as { id: number } | null;
  return created ? String(created.id) : null;
}
