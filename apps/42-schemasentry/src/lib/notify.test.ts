import { test } from "node:test";
import assert from "node:assert/strict";
import { backoffSeconds, MAX_ATTEMPTS } from "./notify";
import { buildSlackMessage, type SlackAlertInput } from "./slack";
import {
  buildCheckSummary,
  buildCheckTitle,
  buildPrComment,
  COMMENT_MARKER,
  conclusionFor,
  type CommentInput,
} from "./github";
import { buildChangelogNotice } from "./email";

/* ------------------------------------------------------------------ backoff */

test("the retry ladder grows and then stops growing", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(backoffSeconds), [60, 300, 1500, 7200, 7200]);
  assert.equal(MAX_ATTEMPTS, 5);
});

/* -------------------------------------------------------------------- Slack */

const slackInput: SlackAlertInput = {
  apiName: "payments-api",
  apiSlug: "payments-api",
  verdict: "breaking",
  counts: { breaking: 2, risky: 3, compatible: 11 },
  fromLabel: "9f3c2ab",
  toLabel: "4d81e07",
  environment: "prod",
  diffUrl: "https://app.example/apis/payments-api/diffs/abc",
  impactedConsumers: ["Acme webhooks", "iOS app"],
  findings: [
    {
      level: "breaking",
      message: "Removed enum value `cancelled` from `status`",
      jsonPointer: "/paths/~1v1~1orders/get/responses/200/content/application~1json/schema/properties/status/enum",
      endpoint: "/v1/orders",
      method: "GET",
      impactedConsumers: ["Acme webhooks"],
    },
    {
      level: "breaking",
      message: "Response field `invoice_url` is no longer guaranteed",
      jsonPointer: "/paths/~1v1~1orders/get/responses/200/content/application~1json/schema/required",
      endpoint: "/v1/orders",
      method: "GET",
      impactedConsumers: ["iOS app"],
    },
    { level: "risky", message: "Deprecated GET /v1/legacy", jsonPointer: "/paths/~1v1~1legacy/get/deprecated", endpoint: "/v1/legacy", method: "GET", impactedConsumers: [] },
    { level: "risky", message: "Added enum value `refunded` to `status`", jsonPointer: "/x", endpoint: "/v1/orders", method: "GET", impactedConsumers: [] },
    { level: "risky", message: "Removed server `https://old.example`", jsonPointer: "/servers", endpoint: null, method: null, impactedConsumers: [] },
    { level: "compatible", message: "Added operation GET /v1/disputes", jsonPointer: "/paths/~1v1~1disputes/get", endpoint: "/v1/disputes", method: "GET", impactedConsumers: [] },
  ],
};

test("the Slack fallback text carries the whole verdict — it is the phone notification", () => {
  const message = buildSlackMessage(slackInput);
  assert.equal(message.text, "API change — payments-api: BREAKING (2) on 4d81e07");
});

test("the Slack message matches DESIGN.md's field layout", () => {
  const message = buildSlackMessage(slackInput);
  const json = JSON.stringify(message);
  assert.match(json, /"header"/);
  assert.match(json, /API change — payments-api/);
  assert.match(json, /\*Verdict\*\\nBREAKING \(2\)/);
  assert.match(json, /\*Deploy\*\\n`4d81e07`/);
  assert.match(json, /\*Baseline\*\\n`9f3c2ab`/);
  assert.match(json, /View diff/);
  assert.match(json, /Acknowledge/);
});

test("Slack shows the top three notable findings and counts the rest", () => {
  const message = buildSlackMessage(slackInput);
  const json = JSON.stringify(message);
  assert.match(json, /Removed enum value/);
  assert.match(json, /invoice_url/);
  assert.match(json, /Deprecated GET \/v1\/legacy/);
  assert.doesNotMatch(json, /refunded/, "the fourth finding belongs in the count, not the message");
  assert.match(json, /2 more findings in the diff/);
  assert.doesNotMatch(json, /Added operation/, "compatible findings never reach Slack");
});

test("no emoji reaches Slack, and every plain_text block says so explicitly", () => {
  const json = JSON.stringify(buildSlackMessage(slackInput));
  assert.doesNotMatch(json, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u);
  // Slack renders `:name:` shortcodes as emoji unless emoji is false.
  for (const block of JSON.parse(json).blocks as Array<Record<string, unknown>>) {
    const text = block.text as { type?: string; emoji?: boolean } | undefined;
    if (text?.type === "plain_text") assert.equal(text.emoji, false);
  }
});

test("impacted consumers are named per finding and in the summary", () => {
  const json = JSON.stringify(buildSlackMessage(slackInput));
  assert.match(json, /Breaks: Acme webhooks/);
  assert.match(json, /Impacted consumers: Acme webhooks, iOS app/);
});

/* ------------------------------------------------------------------- GitHub */

const commentInput: CommentInput = {
  apiName: "payments-api",
  verdict: "breaking",
  counts: { breaking: 2, risky: 1, compatible: 11, info: 1 },
  fromLabel: "9f3c2ab",
  toLabel: "4d81e07",
  diffUrl: "https://app.example/apis/payments-api/diffs/abc",
  impactedConsumers: ["Acme webhooks"],
  fails: true,
  findings: [
    {
      level: "breaking",
      ruleId: "response.enum.value-removed",
      message: "Removed enum value `cancelled` from `status`",
      jsonPointer: "/paths/~1v1~1orders/get/.../enum",
      endpoint: "/v1/orders",
      method: "GET",
      why: "Consumers branching on this value lose a case.",
      impactedConsumers: ["Acme webhooks"],
      ackNote: null,
    },
    {
      level: "info",
      ruleId: "response.nullable.added",
      message: "Response field `shipped_at` can now be null",
      jsonPointer: "/paths/~1v1~1orders/get/.../type",
      endpoint: "/v1/orders",
      method: "GET",
      why: "Acknowledged by dana@example.com: intentional | pipes and stuff",
      impactedConsumers: [],
      ackNote: "intentional | pipes and stuff",
    },
    {
      level: "compatible",
      ruleId: "operation.added",
      message: "Added operation GET /v1/disputes",
      jsonPointer: "/paths/~1v1~1disputes/get",
      endpoint: "/v1/disputes",
      method: "GET",
      why: "New surface.",
      impactedConsumers: [],
      ackNote: null,
    },
  ],
};

test("the PR comment carries the marker that makes it findable and single", () => {
  const body = buildPrComment(commentInput);
  assert.ok(body.startsWith(COMMENT_MARKER), "the marker must be first so a thread scan finds it");
  assert.equal(body.split(COMMENT_MARKER).length - 1, 1, "exactly one marker");
});

test("the PR comment states the verdict, the counts, and why the check is red", () => {
  const body = buildPrComment(commentInput);
  assert.match(body, /\*\*BREAKING\*\* · `9f3c2ab` → `4d81e07`/);
  assert.match(body, /2 breaking · 1 risky · 11 compatible · 1 acknowledged/);
  assert.match(body, /This check is failing/);
  assert.match(body, /Acknowledge a finding/);
  assert.match(body, /\*\*Impacted consumers:\*\* Acme webhooks/);
});

test("a pipe inside an ack note cannot break the markdown table", () => {
  const body = buildPrComment(commentInput);
  const tableRows = body.split("\n").filter((l) => l.startsWith("| "));
  assert.ok(tableRows.length >= 3);
  for (const row of tableRows) {
    const cells = row.split(/(?<!\\)\|/).length - 2;
    assert.equal(cells, 5, `row has ${cells} cells, not 5: ${row}`);
  }
  assert.match(body, /pipes and stuff/);
});

test("compatible findings stay out of the PR comment table", () => {
  const body = buildPrComment(commentInput);
  const table = body.split("<details>")[0];
  assert.doesNotMatch(table, /Added operation/);
});

test("a compatible diff says so plainly rather than showing an empty table", () => {
  const body = buildPrComment({
    ...commentInput,
    verdict: "compatible",
    fails: false,
    counts: { breaking: 0, risky: 0, compatible: 4, info: 0 },
    impactedConsumers: [],
    findings: commentInput.findings.filter((f) => f.level === "compatible"),
  });
  assert.match(body, /Nothing in this change breaks a declared consumer/);
  assert.match(body, /This check is not failing/);
});

test("no emoji in the PR comment or the check summary", () => {
  for (const text of [buildPrComment(commentInput), buildCheckSummary(commentInput), buildCheckTitle(commentInput)]) {
    assert.doesNotMatch(text, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u);
  }
});

test("check conclusions map from the policy, not from the verdict alone", () => {
  assert.equal(conclusionFor({ ...commentInput, fails: true }), "failure");
  assert.equal(conclusionFor({ ...commentInput, fails: false, verdict: "risky" }), "neutral");
  assert.equal(conclusionFor({ ...commentInput, fails: false, verdict: "breaking" }), "neutral");
  assert.equal(conclusionFor({ ...commentInput, fails: false, verdict: "compatible" }), "success");
});

test("the check title fits one line and names the API", () => {
  assert.equal(buildCheckTitle(commentInput), "BREAKING — 2 findings in payments-api");
  assert.equal(
    buildCheckTitle({ ...commentInput, verdict: "compatible" }),
    "COMPATIBLE — no consumer-visible breakage",
  );
  assert.equal(
    buildCheckTitle({ ...commentInput, verdict: "risky", counts: { ...commentInput.counts, risky: 1 } }),
    "RISKY — 1 finding in payments-api",
  );
});

/* -------------------------------------------------------------------- email */

test("the subscriber email leads with whether the reader has work to do", () => {
  const breaking = buildChangelogNotice({
    apiName: "Payments API",
    entryTitle: "Breaking: Removed enum value cancelled from status",
    entryUrl: "https://app.example/c/northwind/payments-api#v-4d81e07",
    breaking: true,
    bodyMd: "_Released as `4d81e07`._\n\n## Breaking changes\n\n- **Removed enum value `cancelled`**",
    unsubscribeUrl: "https://app.example/c/northwind/payments-api/unsubscribe?token=x",
  });
  assert.equal(breaking.subject, "Breaking change — Payments API");
  assert.match(breaking.text, /^A breaking change shipped to Payments API\./);
  assert.match(breaking.text, /Unsubscribe: https:\/\//);

  const routine = buildChangelogNotice({
    apiName: "Payments API",
    entryTitle: "Additions in 7ab9c31",
    entryUrl: "https://app.example/c/x/y",
    breaking: false,
    bodyMd: "## Compatible changes\n\n- **Added response field `receipt_url`**",
    unsubscribeUrl: "https://app.example/u",
  });
  assert.equal(routine.subject, "Payments API — Additions in 7ab9c31");
  assert.match(routine.text, /^Payments API changed\./);
});

test("the email escapes HTML so a customer's changelog cannot inject markup", () => {
  const notice = buildChangelogNotice({
    apiName: "Payments API",
    entryTitle: '<script>alert("x")</script> & more',
    entryUrl: "https://app.example/c/x/y",
    breaking: false,
    bodyMd: "- **<img onerror=alert(1)>** removed",
    unsubscribeUrl: "https://app.example/u",
  });
  assert.doesNotMatch(notice.html, /<script>/);
  assert.doesNotMatch(notice.html, /<img /);
  assert.match(notice.html, /&lt;script&gt;/);
  assert.match(notice.html, /&amp; more/);
});

test("the excerpt drops the italic dateline and caps its length", () => {
  const long = Array.from({ length: 40 }, (_, i) => `- line ${i}`).join("\n");
  const notice = buildChangelogNotice({
    apiName: "A",
    entryTitle: "T",
    entryUrl: "u",
    breaking: false,
    bodyMd: `_Released as \`x\`._\n\n${long}`,
    unsubscribeUrl: "u",
  });
  assert.doesNotMatch(notice.text, /Released as/);
  assert.match(notice.text, /- line 0/);
  assert.doesNotMatch(notice.text, /- line 20/);
});
