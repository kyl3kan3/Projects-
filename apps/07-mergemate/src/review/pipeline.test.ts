/**
 * The pipeline, end to end, against a recorded GitHub and the deterministic model.
 *
 * What these tests are really checking is the shape of MergeMate's output: that a
 * confident finding becomes exactly one inline comment on exactly the right line,
 * that a low-confidence one produces *no bytes at all* on the pull request, that a
 * model failure is reported rather than papered over, and that the summary comment
 * is edited rather than duplicated on the next push.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { runReviewPipeline } from "./pipeline";
import { FakeReviewModel } from "./model-fake";
import type { AnalysisRequest, ReviewModel, ScoringRequest } from "./model";
import type { AnalysisOutcome, ScoringOutcome } from "./types";
import { DEFAULT_RULEBOOK, parseRulebook, resolvePolicy } from "../rules/rulebook";
import { fixtureEntry, loadPatch } from "../diff/fixtures";
import type {
  CheckRunInput,
  FileEntry,
  GitHubGateway,
  InlineCommentInput,
  PostedComment,
  PullRequestInfo,
  RepoRef,
} from "../github/client";
import { extractFingerprint } from "../github/comments";

/* ------------------------------------------------------- recorded GitHub --- */

interface Recorded {
  reviews: { commitId: string; body: string; comments: InlineCommentInput[] }[];
  issueComments: { id: number; body: string }[];
  issueEdits: { id: number; body: string }[];
  checkRuns: CheckRunInput[];
}

function fakeGateway(files: FileEntry[], contents: Record<string, string> = {}) {
  const recorded: Recorded = { reviews: [], issueComments: [], issueEdits: [], checkRuns: [] };
  let nextCommentId = 9_000;

  const gateway: GitHubGateway = {
    async getRepo() {
      return { id: 1, fullName: "acme/checkout", isPrivate: false, defaultBranch: "main" };
    },
    async getPullRequest() {
      return pullRequest();
    },
    async listPullRequestFiles() {
      return files;
    },
    async getFileContent(_ref, path) {
      return contents[path] ?? null;
    },
    async listCommitFiles() {
      return files;
    },
    async createReview(_ref, _number, input) {
      recorded.reviews.push(input);
      return 42;
    },
    async listReviewComments(): Promise<PostedComment[]> {
      const review = recorded.reviews[recorded.reviews.length - 1];
      if (!review) return [];
      return review.comments.map((c) => ({
        id: nextCommentId++,
        path: c.path,
        line: c.line,
        body: c.body,
      }));
    },
    async getReviewComment() {
      return null;
    },
    async createIssueComment(_ref, _number, body) {
      const id = 100;
      recorded.issueComments.push({ id, body });
      return id;
    },
    async updateIssueComment(_ref, commentId, body) {
      recorded.issueEdits.push({ id: commentId, body });
    },
    async updateReviewComment() {
      /* not used here */
    },
    async listReviewCommentReactions() {
      return [];
    },
    async createCheckRun(_ref, input) {
      recorded.checkRuns.push(input);
    },
  };

  return { gateway, recorded };
}

function pullRequest(overrides: Partial<PullRequestInfo> = {}): PullRequestInfo {
  return {
    number: 482,
    title: "fix: session refresh race",
    body: "Speeds up the session lookup.",
    authorLogin: "dana",
    headSha: "0f1e2d3c4b5a69788796a5b4c3d2e1f009182736",
    baseRef: "main",
    state: "open",
    isForkPr: false,
    changedFiles: 1,
    ...overrides,
  };
}

const ref: RepoRef = { owner: "acme", repo: "checkout" };

const rulebookYaml = `version: 1
confidence:
  threshold: 0.8
  max_comments_per_pr: 6
rules:
  - id: no-raw-sql
    category: security
    description: SQL must be built with bound parameters, never string interpolation.
  - id: no-console-in-server
    category: standards
    description: Server code logs through the structured logger, not console.
`;

function policyFrom(yaml = rulebookYaml, overrides: Parameters<typeof resolvePolicy>[0] = { config: DEFAULT_RULEBOOK }) {
  const parsed = parseRulebook(yaml);
  assert.equal(parsed.valid, true, parsed.errors.join("; "));
  return resolvePolicy({ ...overrides, config: parsed.config });
}

function baseInput(gateway: GitHubGateway, policy = policyFrom()) {
  return {
    gateway,
    model: new FakeReviewModel(),
    ref,
    pr: pullRequest(),
    policy,
    rulebookVersion: 12,
    rulebookInvalid: false,
    suppressions: new Map<string, string>(),
    alreadyPosted: new Set<string>(),
    existingSummaryCommentId: null,
    maxDiffLines: 3_000,
    dashboardUrl: "https://mergemate.dev",
    seatNotice: null,
    post: true,
  };
}

const sessionFiles = [fixtureEntry({ path: "src/auth/session.ts", patch: loadPatch("session-raw-sql") })];

/* ------------------------------------------------------------------ tests --- */

test("a confident finding becomes one inline comment on the exact line", async () => {
  const { gateway, recorded } = fakeGateway(sessionFiles);
  const result = await runReviewPipeline(baseInput(gateway));

  assert.equal(result.status, "posted");
  assert.equal(recorded.reviews.length, 1, "one review, not one comment per finding");

  const review = recorded.reviews[0];
  assert.ok(review);
  assert.equal(review.commitId, pullRequest().headSha);

  // Three confident findings live in this fixture: interpolated SQL (line 112),
  // loose equality (113) and a committed credential (148). The console.log on 116
  // scores 0.55 and must not appear at all.
  const paths = review.comments.map((c) => `${c.path}:${c.line}`);
  assert.deepEqual(paths.sort(), [
    "src/auth/session.ts:112",
    "src/auth/session.ts:113",
    "src/auth/session.ts:148",
  ]);

  for (const comment of review.comments) {
    assert.equal(comment.side, "RIGHT");
    assert.ok(extractFingerprint(comment.body), "every comment carries its fingerprint marker");
  }

  // The line we claim is the line the defect is actually on.
  const sqlComment = review.comments.find((c) => c.line === 112);
  assert.ok(sqlComment, "the interpolated SQL is on post-image line 112");
  assert.match(sqlComment.body, /SECURITY/);
  assert.match(sqlComment.body, /select \* from sessions/);
  assert.match(sqlComment.body, /rule `no-raw-sql`/);

  const credential = review.comments.find((c) => c.line === 148);
  assert.ok(credential);
  assert.match(credential.body, /Credential committed in source/);
});

test("a low-confidence finding posts nothing whatsoever", async () => {
  // A diff whose only issue is a console.log: the fake scores it 0.55.
  const files = [
    fixtureEntry({
      path: "src/server/handler.ts",
      patch: "@@ -1,3 +1,4 @@\n export function handler() {\n+  console.log(\"handling\");\n   return 1;\n }\n",
    }),
  ];
  const { gateway, recorded } = fakeGateway(files);
  const result = await runReviewPipeline(baseInput(gateway));

  assert.equal(result.status, "silent");
  assert.equal(result.counts.posted, 0);
  assert.equal(result.counts.below_threshold, 1);

  // The important assertions: nothing was sent to GitHub at all.
  assert.equal(recorded.reviews.length, 0, "no review was created");
  assert.equal(recorded.issueComments.length, 0, "no summary comment was created");
  assert.equal(recorded.issueEdits.length, 0);
  assert.equal(result.summaryBody, null, "not even a summary body was rendered");

  // And the finding is still recorded, with its reason, for the dashboard.
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.posted, false);
  assert.equal(result.findings[0]?.dropReason, "below_threshold");
});

test("the summary comment lists only what was posted, never what was gated", async () => {
  const { gateway, recorded } = fakeGateway([
    ...sessionFiles,
    fixtureEntry({
      path: "src/server/handler.ts",
      patch: "@@ -1,3 +1,4 @@\n export function handler() {\n+  console.log(\"handling\");\n   return 1;\n }\n",
    }),
  ]);
  const result = await runReviewPipeline(baseInput(gateway));

  assert.equal(result.status, "posted");
  const summary = recorded.issueComments[0];
  assert.ok(summary, "a summary comment is posted when there are findings");

  const gated = result.findings.filter((f) => !f.posted);
  assert.ok(gated.length > 0);
  for (const finding of gated) {
    assert.ok(
      !summary.body.includes(finding.title),
      `the summary must not mention the gated finding "${finding.title}"`,
    );
  }
  assert.ok(!/gated|withheld|not sure|below the threshold/i.test(summary.body));
  assert.match(summary.body, /rulebook v12/);
  assert.match(summary.body, /pattern fallback/, "a fake-model review says so out loud");
});

test("the summary comment is edited in place on the next push, never duplicated", async () => {
  const { gateway, recorded } = fakeGateway(sessionFiles);
  const input = { ...baseInput(gateway), existingSummaryCommentId: 100 };
  const result = await runReviewPipeline(input);

  assert.equal(result.summaryCommentId, 100);
  assert.equal(recorded.issueComments.length, 0, "no new comment");
  assert.equal(recorded.issueEdits.length, 1, "the existing one is edited");
  assert.equal(recorded.issueEdits[0]?.id, 100);
});

test("a re-review that finds the same defects again posts nothing new", async () => {
  const first = fakeGateway(sessionFiles);
  const firstRun = await runReviewPipeline(baseInput(first.gateway));
  const fingerprints = new Set(firstRun.findings.filter((f) => f.posted).map((f) => f.fingerprint));
  assert.equal(fingerprints.size, 3);

  const second = fakeGateway(sessionFiles);
  const result = await runReviewPipeline({
    ...baseInput(second.gateway),
    alreadyPosted: fingerprints,
    existingSummaryCommentId: 100,
  });

  assert.equal(second.recorded.reviews.length, 0, "no duplicate inline comments");
  assert.equal(result.counts.already_posted, 3);
  // The summary is refreshed, and still describes the findings standing on the PR
  // rather than claiming the pull request is now clean.
  assert.equal(result.standing.length, 3);
  const edit = second.recorded.issueEdits[0];
  assert.ok(edit);
  assert.match(edit.body, /3 findings on this diff/);
});

test("a suppressed fingerprint stays silent across runs", async () => {
  const first = fakeGateway(sessionFiles);
  const firstRun = await runReviewPipeline(baseInput(first.gateway));
  const target = firstRun.findings.find((f) => f.posted);
  assert.ok(target);

  const second = fakeGateway(sessionFiles);
  const result = await runReviewPipeline({
    ...baseInput(second.gateway),
    suppressions: new Map([[target.fingerprint, "suppression-1"]]),
  });

  const posted = second.recorded.reviews[0]?.comments ?? [];
  assert.equal(posted.length, 2, "the other findings still post; the dismissed one does not");
  assert.ok(!posted.some((c) => extractFingerprint(c.body) === target.fingerprint));
  assert.equal(result.counts.suppressed, 1);
});

test("shadow mode computes everything and posts nothing", async () => {
  const { gateway, recorded } = fakeGateway(sessionFiles);
  const result = await runReviewPipeline({
    ...baseInput(gateway, policyFrom(rulebookYaml, { config: DEFAULT_RULEBOOK, shadowMode: true })),
  });
  assert.equal(result.status, "silent");
  assert.ok(result.findings.length >= 2, "findings are still produced for the dashboard");
  assert.equal(recorded.reviews.length, 0);
  assert.equal(recorded.issueComments.length, 0);
});

test("shadow mode does not even edit a summary comment that already exists", async () => {
  // Regression: turning shadow mode on for a pull request MergeMate had already
  // commented on used to keep editing that comment. Shadow mode means no writes.
  const { gateway, recorded } = fakeGateway(sessionFiles);
  const result = await runReviewPipeline({
    ...baseInput(gateway, policyFrom(rulebookYaml, { config: DEFAULT_RULEBOOK, shadowMode: true })),
    existingSummaryCommentId: 100,
  });
  assert.equal(result.status, "silent");
  assert.equal(recorded.issueEdits.length, 0);
  assert.equal(recorded.issueComments.length, 0);
  assert.equal(recorded.reviews.length, 0);
});

test("a suggestion block is only attached when it replaces the anchored lines safely", async () => {
  const files = [
    fixtureEntry({
      path: "src/orders.ts",
      patch: "@@ -1,4 +1,5 @@\n export function statusFor(order) {\n+  if (order.dueAt == null) {\n   return \"open\";\n }\n",
    }),
  ];
  const { gateway, recorded } = fakeGateway(files);
  const result = await runReviewPipeline(baseInput(gateway));

  assert.equal(result.status, "posted");
  const comment = recorded.reviews[0]?.comments[0];
  assert.ok(comment);
  assert.match(comment.body, /```suggestion\n {2}if \(order\.dueAt === null\) \{\n```/);
});

test("suggestions are withheld when the rulebook switches them off", async () => {
  const files = [
    fixtureEntry({
      path: "src/orders.ts",
      patch: "@@ -1,4 +1,5 @@\n export function statusFor(order) {\n+  if (order.dueAt == null) {\n   return \"open\";\n }\n",
    }),
  ];
  const { gateway, recorded } = fakeGateway(files);
  const policy = policyFrom("version: 1\nsuggested_patches: false\n");
  const result = await runReviewPipeline(baseInput(gateway, policy));
  assert.equal(result.status, "posted");
  assert.ok(!recorded.reviews[0]?.comments[0]?.body.includes("```suggestion"));
});

test("an analysis failure posts nothing and is reported as failed", async () => {
  const { gateway, recorded } = fakeGateway(sessionFiles);
  const broken: ReviewModel = {
    id: "claude-sonnet-5",
    isFake: false,
    async analyse(): Promise<AnalysisOutcome> {
      return {
        ok: false,
        reason: "timeout",
        message: "request timed out after 120000ms",
        usage: { inputTokens: 30_000, outputTokens: 0 },
      };
    },
    async score(): Promise<ScoringOutcome> {
      throw new Error("scoring should never run after a failed analysis");
    },
  };

  const result = await runReviewPipeline({ ...baseInput(gateway), model: broken });
  assert.equal(result.status, "failed");
  assert.match(result.detail ?? "", /analysis timeout/);
  assert.equal(recorded.reviews.length, 0);
  assert.equal(recorded.issueComments.length, 0);
  // The tokens we paid for are still recorded.
  assert.equal(result.usage.inputTokens, 30_000);
  assert.ok(result.costMicroUsd > 0);
});

test("a scoring failure posts nothing: unscored findings do not get to speak", async () => {
  const { gateway, recorded } = fakeGateway(sessionFiles);
  const fake = new FakeReviewModel();
  const halfBroken: ReviewModel = {
    id: "claude-sonnet-5",
    isFake: false,
    analyse: (request: AnalysisRequest) => fake.analyse(request),
    async score(): Promise<ScoringOutcome> {
      return { ok: false, reason: "invalid_output", message: "no JSON object in scoring response", usage: { inputTokens: 500, outputTokens: 20 } };
    },
  };

  const result = await runReviewPipeline({ ...baseInput(gateway), model: halfBroken });
  assert.equal(result.status, "failed");
  assert.match(result.detail ?? "", /confidence scoring invalid_output/);
  assert.equal(recorded.reviews.length, 0);
  assert.equal(recorded.issueComments.length, 0);
});

test("a finding the scorer forgot scores zero and is dropped", async () => {
  const { gateway, recorded } = fakeGateway(sessionFiles);
  const fake = new FakeReviewModel();
  const forgetful: ReviewModel = {
    id: "claude-sonnet-5",
    isFake: false,
    analyse: (request: AnalysisRequest) => fake.analyse(request),
    async score(request: ScoringRequest): Promise<ScoringOutcome> {
      // Scores only the first finding, silently omitting the rest.
      const first = request.findings[0];
      return {
        ok: true,
        scores: first ? [{ id: first.id, confidenceBp: 9_500, reason: "proven" }] : [],
        usage: { inputTokens: 100, outputTokens: 10 },
        discarded: [],
      };
    },
  };

  const result = await runReviewPipeline({ ...baseInput(gateway), model: forgetful });
  assert.equal(recorded.reviews[0]?.comments.length, 1);
  const unscored = result.findings.filter((f) => f.confidenceBp === 0);
  assert.ok(unscored.length >= 1);
  assert.equal(unscored[0]?.dropReason, "below_threshold");
  assert.match(unscored[0]?.scoreReason ?? "", /not scored/);
});

test("a diff with nothing reviewable is skipped, not failed", async () => {
  const { gateway, recorded } = fakeGateway([
    { filename: "assets/logo.png", status: "modified", additions: 0, deletions: 0, patch: null },
  ]);
  const result = await runReviewPipeline(baseInput(gateway));
  assert.equal(result.status, "skipped");
  assert.match(result.detail ?? "", /no reviewable text changes/);
  assert.equal(recorded.reviews.length, 0);
});

test("an oversized diff is reviewed in part and says so in the summary", async () => {
  const big = Array.from({ length: 400 }, (_, i) => `+const value${i} = ${i};`).join("\n");
  const files = [
    fixtureEntry({ path: "src/auth/session.ts", patch: loadPatch("session-raw-sql") }),
    fixtureEntry({ path: "src/generated/constants.ts", patch: `@@ -1,1 +1,401 @@\n const start = 0;\n${big}\n` }),
  ];
  const { gateway, recorded } = fakeGateway(files);
  const result = await runReviewPipeline({ ...baseInput(gateway), maxDiffLines: 50 });

  assert.deepEqual(result.truncatedFiles, ["src/generated/constants.ts"]);
  assert.equal(result.status, "posted");
  const summary = recorded.issueComments[0];
  assert.ok(summary);
  assert.match(summary.body, /1 file was not reviewed/);
  assert.match(summary.body, /src\/generated\/constants\.ts/);
});

test("context expansion is fetched from the head sha and reaches the prompt", async () => {
  const contents: Record<string, string> = {
    "src/auth/session.ts": Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join("\n"),
  };
  const { gateway } = fakeGateway(sessionFiles, contents);
  let seenContexts = 0;
  const spy: ReviewModel = {
    id: "spy",
    isFake: true,
    async analyse(request: AnalysisRequest): Promise<AnalysisOutcome> {
      seenContexts = request.contexts.length;
      assert.match(request.contexts[0]?.numberedBody ?? "", /@@ lines \d+-\d+ @@/);
      return { ok: true, findings: [], usage: { inputTokens: 1, outputTokens: 0 }, discarded: [] };
    },
    async score(): Promise<ScoringOutcome> {
      throw new Error("no findings, so scoring must not run");
    },
  };
  const result = await runReviewPipeline({ ...baseInput(gateway), model: spy });
  assert.equal(seenContexts, 1);
  assert.equal(result.status, "silent");
  assert.equal(result.detail, "no candidate findings");
});

test("a dry run computes the whole review and writes nothing", async () => {
  const { gateway, recorded } = fakeGateway(sessionFiles);
  const result = await runReviewPipeline({ ...baseInput(gateway), post: false });
  assert.equal(result.status, "posted", "the decision is unchanged…");
  assert.equal(result.plannedComments.length, 3, "…and the comments are computed…");
  assert.equal(recorded.reviews.length, 0, "…but nothing is sent");
  assert.equal(recorded.issueComments.length, 0);
  assert.ok(result.summaryBody);
});

test("a fork PR is marked hostile in the prompt", async () => {
  const { gateway } = fakeGateway(sessionFiles);
  let promptSeen = "";
  const spy: ReviewModel = {
    id: "spy",
    isFake: true,
    async analyse(request: AnalysisRequest): Promise<AnalysisOutcome> {
      promptSeen = JSON.stringify(request.pr);
      return { ok: true, findings: [], usage: { inputTokens: 1, outputTokens: 0 }, discarded: [] };
    },
    async score(): Promise<ScoringOutcome> {
      return { ok: true, scores: [], usage: { inputTokens: 0, outputTokens: 0 }, discarded: [] };
    },
  };
  await runReviewPipeline({
    ...baseInput(gateway),
    model: spy,
    pr: pullRequest({ isForkPr: true }),
  });
  assert.match(promptSeen, /"isForkPr":true/);
});
