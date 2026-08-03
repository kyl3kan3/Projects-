import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { deployChip, parseDeployPayload, shortSha, verifyWebhookSignature } from "./deploys";

const RECEIVED = new Date("2026-07-14T12:00:00Z");

test("a generic post needs only a service and a sha", () => {
  const result = parseDeployPayload(null, { service: "api-server", sha: "9f3c2ab" }, RECEIVED);
  assert.ok(result.ok);
  assert.equal(result.deploy.serviceName, "api-server");
  assert.equal(result.deploy.sha, "9f3c2ab");
  assert.equal(result.deploy.source, "webhook");
  // No timestamp given: the receive time is used, not a guess.
  assert.equal(result.deploy.deployedAt.getTime(), RECEIVED.getTime());
});

test("a generic post's own timestamp wins over the receive time", () => {
  const result = parseDeployPayload(
    null,
    { service: "api-server", sha: "9f3c2ab", deployed_at: "2026-07-14T12:02:00Z" },
    RECEIVED,
  );
  assert.ok(result.ok);
  assert.equal(result.deploy.deployedAt.toISOString(), "2026-07-14T12:02:00.000Z");
});

test("a bad timestamp is rejected rather than silently replaced with now", () => {
  const result = parseDeployPayload(
    null,
    { service: "api-server", sha: "9f3c2ab", deployed_at: "last tuesday" },
    RECEIVED,
  );
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.error : "", /Unparseable deployed_at/);
});

test("a generic post missing fields explains what was expected", () => {
  const result = parseDeployPayload(null, { sha: "9f3c2ab" }, RECEIVED);
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.error : "", /service/);
  const notJson = parseDeployPayload(null, "hello", RECEIVED);
  assert.equal(notJson.ok, false);
});

test("a GitHub push becomes a deploy on the repo's short name", () => {
  const result = parseDeployPayload(
    "push",
    {
      after: "9f3c2ab1122334455667788990011223344556677",
      ref: "refs/heads/main",
      repository: { full_name: "acme/api-server", html_url: "https://github.com/acme/api-server" },
      head_commit: {
        timestamp: "2026-07-14T11:58:00Z",
        url: "https://github.com/acme/api-server/commit/9f3c2ab1122334455667788990011223344556677",
      },
      pusher: { name: "dana" },
    },
    RECEIVED,
  );
  assert.ok(result.ok);
  assert.equal(result.deploy.serviceName, "api-server");
  assert.equal(result.deploy.source, "github");
  assert.equal(result.deploy.repo, "acme/api-server");
  assert.equal(result.deploy.actor, "dana");
  assert.equal(result.deploy.environment, "main");
  assert.equal(result.deploy.deployedAt.toISOString(), "2026-07-14T11:58:00.000Z");
  assert.equal(shortSha(result.deploy.sha), "9f3c2ab");
});

test("a branch deletion is not a deploy", () => {
  const result = parseDeployPayload(
    "push",
    {
      after: "0000000000000000000000000000000000000000",
      repository: { full_name: "acme/api-server" },
      head_commit: null,
    },
    RECEIVED,
  );
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.error : "", /Branch deleted/);
});

test("only a successful deployment_status counts", () => {
  const payload = (state: string) => ({
    deployment_status: { state, updated_at: "2026-07-14T11:58:00Z", creator: { login: "dana" } },
    deployment: { sha: "9f3c2ab1122334455667788990011223344556677", environment: "production", task: "api-server" },
    repository: { full_name: "acme/api-server", html_url: "https://github.com/acme/api-server" },
  });
  const ok = parseDeployPayload("deployment_status", payload("success"), RECEIVED);
  assert.ok(ok.ok);
  assert.equal(ok.deploy.serviceName, "api-server");
  assert.equal(ok.deploy.environment, "production");
  assert.equal(
    ok.deploy.commitUrl,
    "https://github.com/acme/api-server/commit/9f3c2ab1122334455667788990011223344556677",
  );

  for (const state of ["pending", "in_progress", "failure", "error"]) {
    const result = parseDeployPayload("deployment_status", payload(state), RECEIVED);
    assert.equal(result.ok, false, state);
    assert.match(result.ok === false ? result.error : "", new RegExp(state));
  }
});

test("unrelated GitHub events are ignored with a reason, not recorded", () => {
  for (const event of ["ping", "issues", "pull_request", "star"]) {
    const result = parseDeployPayload(event, {}, RECEIVED);
    assert.equal(result.ok, false, event);
  }
});

test("a malformed GitHub payload is rejected, not coerced", () => {
  assert.equal(parseDeployPayload("push", { after: "abc" }, RECEIVED).ok, false);
  assert.equal(parseDeployPayload("deployment_status", { deployment: {} }, RECEIVED).ok, false);
});

/* ------------------------------------------------------------- signature */

test("the HMAC must match, and a missing signature fails closed", () => {
  const secret = "s3cret-webhook-key";
  const body = JSON.stringify({ service: "api-server", sha: "9f3c2ab" });
  const good = `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
  assert.equal(verifyWebhookSignature(secret, body, good), true);
  assert.equal(verifyWebhookSignature(secret, body, null), false);
  assert.equal(verifyWebhookSignature(secret, body, "sha256=deadbeef"), false);
  assert.equal(verifyWebhookSignature(secret, `${body} `, good), false);
  assert.equal(verifyWebhookSignature("", body, good), false);
  // A signature of the right length but wrong content must not pass.
  const wrong = `sha256=${createHmac("sha256", "other").update(body, "utf8").digest("hex")}`;
  assert.equal(verifyWebhookSignature(secret, body, wrong), false);
});

test("the deploy chip is the DESIGN.md row specimen", () => {
  assert.equal(
    deployChip({ sha: "9f3c2ab1122", serviceName: "api-server" }, "TUE 14:02"),
    "9f3c2ab · api-server · TUE 14:02",
  );
});
