/**
 * `npm run review:dry-run -- owner/repo#123`
 *
 * Runs a real review against a real pull request using **read-only** GitHub calls
 * and prints exactly what would have been posted. Nothing is written: the gateway is
 * the real one, but the pipeline runs with `post: false`, and the only endpoints
 * touched are GETs.
 *
 * Two uses. For a prospective customer it is shadow mode without installing
 * anything. For us it is the only way to exercise the real Octokit client, the real
 * pagination, and real diffs — including the ones that break parsers — against
 * fixtures nobody wrote.
 *
 * Auth: a token in GITHUB_TOKEN (a personal access token is fine; `public_repo` is
 * enough for a public repository). No GitHub App installation is required.
 */

import "../lib/load-env";
import { ProbotOctokit } from "probot";
import { octokitGateway, type OctokitLike } from "../github/client";
import { runReviewPipeline } from "../review/pipeline";
import { selectModel } from "../review/model";
import { DEFAULT_RULEBOOK, parseRulebook, resolvePolicy } from "../rules/rulebook";
import { formatMicroUsd } from "../review/cost";
import { changedLineCount } from "../diff/parse";

function parseTarget(arg: string | undefined): { owner: string; repo: string; number: number } {
  const m = /^([^/\s]+)\/([^#\s]+)#(\d+)$/.exec(arg ?? "");
  if (!m || !m[1] || !m[2] || !m[3]) {
    throw new Error("usage: npm run review:dry-run -- owner/repo#123");
  }
  return { owner: m[1], repo: m[2], number: Number(m[3]) };
}

async function main() {
  const target = parseTarget(process.argv[2]);
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
  if (token === "") throw new Error("GITHUB_TOKEN is required for a dry run");

  const octokit = new ProbotOctokit({ auth: { token }, log: { debug() {}, info() {}, warn() {}, error() {} } });
  const gateway = octokitGateway(octokit as unknown as OctokitLike);
  const model = selectModel();

  const ref = { owner: target.owner, repo: target.repo };
  const repo = await gateway.getRepo(ref);
  const pr = await gateway.getPullRequest(ref, target.number);

  // The rulebook on the repository's default branch, if it has one.
  const raw = await gateway.getFileContent(ref, ".mergemate.yml", repo.defaultBranch);
  const parsed = raw === null ? null : parseRulebook(raw);
  const policy = resolvePolicy({
    config: parsed?.valid ? parsed.config : DEFAULT_RULEBOOK,
    defaultThreshold: Number(process.env.CONFIDENCE_POST_THRESHOLD ?? 0.8),
  });

  const started = Date.now();
  const result = await runReviewPipeline({
    gateway,
    model,
    ref,
    pr,
    policy,
    rulebookVersion: parsed?.valid ? 1 : null,
    rulebookInvalid: parsed !== null && !parsed.valid,
    suppressions: new Map(),
    alreadyPosted: new Set(),
    existingSummaryCommentId: null,
    maxDiffLines: Number(process.env.MAX_DIFF_LINES ?? 3_000),
    dashboardUrl: process.env.DASHBOARD_URL ?? "http://localhost:3007",
    seatNotice: null,
    post: false,
  });

  const out: string[] = [];
  out.push(`${repo.fullName}#${pr.number}  ${pr.title}`);
  out.push(
    `${repo.isPrivate ? "private" : "public"} · ${pr.isForkPr ? "fork PR" : "branch PR"} · head ${pr.headSha.slice(0, 8)} · author ${pr.authorLogin}`,
  );
  out.push(
    `${result.files.length} changed files, ${changedLineCount(result.files)} changed lines · rulebook ${
      raw === null ? "absent" : parsed?.valid ? "valid" : "invalid"
    }`,
  );
  out.push("");
  out.push(
    `model ${result.model}${model.isFake ? " (deterministic fallback — no ANTHROPIC_API_KEY)" : ""} · status ${result.status} · ${formatMicroUsd(
      result.costMicroUsd,
    )} · ${((Date.now() - started) / 1000).toFixed(1)}s wall`,
  );
  out.push(
    `${result.findings.length} candidate findings · ${result.counts.posted} would be posted · ${
      result.findings.length - result.counts.posted
    } gated`,
  );
  if (result.truncatedFiles.length > 0) {
    out.push(`over the diff budget, reviewed in part: ${result.truncatedFiles.join(", ")}`);
  }
  for (const note of result.discarded) out.push(`  discarded: ${note}`);
  out.push("");

  if (result.plannedComments.length === 0) {
    out.push("No comment would be posted. On a clean diff that is the intended outcome.");
  }
  for (const comment of result.plannedComments) {
    out.push(`--- ${comment.path}:${comment.startLine ? `${comment.startLine}-${comment.line}` : comment.line} (${comment.side})`);
    out.push(comment.body);
    out.push("");
  }

  const gated = result.findings.filter((f) => !f.posted);
  if (gated.length > 0) {
    out.push("Gated (dashboard only, never posted):");
    for (const finding of gated) {
      out.push(
        `  ${(finding.confidenceBp / 10_000).toFixed(2)}  ${finding.filePath}:${finding.startLine}  ${finding.dropReason}  ${finding.title}`,
      );
    }
    out.push("");
  }

  if (result.summaryBody) {
    out.push("--- summary comment");
    out.push(result.summaryBody);
  }

  process.stdout.write(out.join("\n") + "\n");
}

main().catch((err: unknown) => {
  process.stderr.write(`dry run failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
