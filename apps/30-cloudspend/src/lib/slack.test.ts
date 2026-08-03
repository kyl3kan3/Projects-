import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { postBlocks, SLACK_MAX_SKEW_SECONDS, verifySlackRequest } from "./slack";
import type { SlackBlock } from "./slack-blocks";

const blocks: SlackBlock[] = [
  { type: "section", text: { type: "mrkdwn", text: "Cost anomaly — EC2 in us-east-1" } },
];

test("with no Slack connection the send is logged, not lost or thrown", async () => {
  assert.deepEqual(await postBlocks({ botToken: null, channelId: null }, blocks, "x"), {
    status: "logged",
  });
  assert.deepEqual(await postBlocks({ botToken: "xoxb-1", channelId: null }, blocks, "x"), {
    status: "logged",
  });
});

test("an emoji that slipped into interpolated content refuses to send", async () => {
  const out = await postBlocks({ botToken: "xoxb-1", channelId: "C1" }, [
    { type: "section", text: { type: "mrkdwn", text: "spend is up 🔥" } },
  ], "x");
  assert.equal(out.status, "failed");
  assert.match(out.error ?? "", /emoji/);
});

/* ---------------------------------------------------- inbound verification */

const secret = "8f2a4c1e9b7d3506a1c8f4e2b9d70351";

function sign(timestamp: string, body: string, withSecret = secret): string {
  return `v0=${createHmac("sha256", withSecret).update(`v0:${timestamp}:${body}`, "utf8").digest("hex")}`;
}

test("a correctly signed, fresh request verifies", () => {
  const now = 1_784_000_000;
  const body = "payload=%7B%22type%22%3A%22block_actions%22%7D";
  const timestamp = String(now - 5);
  assert.equal(
    verifySlackRequest({
      signingSecret: secret,
      timestamp,
      rawBody: body,
      signature: sign(timestamp, body),
      nowSeconds: now,
    }),
    true,
  );
});

test("a stale timestamp is rejected even with a valid signature", () => {
  const now = 1_784_000_000;
  const body = "payload=%7B%7D";
  const timestamp = String(now - SLACK_MAX_SKEW_SECONDS - 1);
  assert.equal(
    verifySlackRequest({
      signingSecret: secret,
      timestamp,
      rawBody: body,
      signature: sign(timestamp, body),
      nowSeconds: now,
    }),
    false,
  );
});

test("missing pieces fail closed", () => {
  const now = 1_784_000_000;
  const body = "payload=%7B%7D";
  const timestamp = String(now);
  const good = sign(timestamp, body);
  assert.equal(
    verifySlackRequest({ signingSecret: "", timestamp, rawBody: body, signature: good, nowSeconds: now }),
    false,
  );
  assert.equal(
    verifySlackRequest({ signingSecret: secret, timestamp: null, rawBody: body, signature: good, nowSeconds: now }),
    false,
  );
  assert.equal(
    verifySlackRequest({ signingSecret: secret, timestamp, rawBody: body, signature: null, nowSeconds: now }),
    false,
  );
  assert.equal(
    verifySlackRequest({ signingSecret: secret, timestamp: "not-a-number", rawBody: body, signature: good, nowSeconds: now }),
    false,
  );
});

test("a body or secret mismatch fails", () => {
  const now = 1_784_000_000;
  const timestamp = String(now);
  const body = "payload=%7B%7D";
  assert.equal(
    verifySlackRequest({
      signingSecret: secret,
      timestamp,
      rawBody: `${body}&extra=1`,
      signature: sign(timestamp, body),
      nowSeconds: now,
    }),
    false,
  );
  assert.equal(
    verifySlackRequest({
      signingSecret: secret,
      timestamp,
      rawBody: body,
      signature: sign(timestamp, body, "another-secret-of-the-same-length"),
      nowSeconds: now,
    }),
    false,
  );
});
