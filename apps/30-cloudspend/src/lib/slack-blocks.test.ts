import assert from "node:assert/strict";
import test from "node:test";
import {
  ackedBlocks,
  anomalyBlocks,
  anomalyNotificationText,
  anomalyTitle,
  budgetBlocks,
  containsEmoji,
  digestBlocks,
  slackDelta,
  type AnomalyCardInput,
} from "./slack-blocks";

const card: AnomalyCardInput = {
  anomalyId: "a1b2c3",
  service: "Amazon Elastic Compute Cloud - Compute",
  region: "us-east-1",
  accountLabel: "4821-prod",
  startedAt: new Date("2026-07-14T14:00:00Z"),
  asOf: new Date("2026-07-14T23:00:00Z"),
  deltaPerDayMicros: 342_000_000,
  deploy: {
    sha: "9f3c2ab",
    serviceName: "api-server",
    leadTime: "2h before onset",
    commitUrl: "https://github.com/acme/api-server/commit/9f3c2ab",
  },
  topContributor: { label: "i-09f3c2ab7d41e8b60", detail: "g4dn.xlarge · us-east-1a" },
  trendImageUrl: "https://app.cloudspend.dev/api/trend/a1b2c3.png",
  dashboardUrl: "https://app.cloudspend.dev/anomalies/a1b2c3",
  demo: false,
};

test("the block order is exactly DESIGN.md's spec", () => {
  const blocks = anomalyBlocks(card);
  assert.deepEqual(
    blocks.map((b) => b.type),
    ["header", "section", "section", "context", "actions"],
  );
});

test("the header names the service and region in product language", () => {
  assert.equal(anomalyTitle(card.service, card.region), "Cost anomaly — EC2 in us-east-1");
  const header = anomalyBlocks(card)[0];
  assert.equal(header.type === "header" && header.text.text, "Cost anomaly — EC2 in us-east-1");
});

test("the Delta and Since fields are the specimen, with elapsed time as of now", () => {
  const section = anomalyBlocks(card)[1];
  assert.ok(section.type === "section" && section.fields);
  assert.equal(section.fields[0].text, "*Delta*\n+$342/day vs baseline");
  assert.equal(section.fields[1].text, "*Since*\nTue 14:00 UTC (9h)");
  assert.equal(slackDelta(-88_000_000), "-$88/day vs baseline");
});

test("the trend image is a 300x80 accessory on the summary section", () => {
  const section = anomalyBlocks(card)[1];
  assert.ok(section.type === "section");
  assert.equal(section.accessory?.type, "image");
  assert.equal(section.accessory?.image_url, card.trendImageUrl);
  assert.match(section.accessory?.alt_text ?? "", /baseline/);
});

test("with no trend image the card still sends, without an accessory", () => {
  const section = anomalyBlocks({ ...card, trendImageUrl: null })[1];
  assert.ok(section.type === "section");
  assert.equal(section.accessory, undefined);
});

test("the probable cause links the commit and states the lead time", () => {
  const cause = anomalyBlocks(card)[2];
  assert.ok(cause.type === "section");
  assert.equal(
    cause.text?.text,
    "*Probable cause*\nDeploy <https://github.com/acme/api-server/commit/9f3c2ab|`9f3c2ab`> of `api-server`, 2h before onset",
  );
});

test("with no correlated deploy it says so and names the contributor instead", () => {
  const cause = anomalyBlocks({ ...card, deploy: null })[2];
  assert.ok(cause.type === "section");
  assert.match(cause.text?.text ?? "", /No deploy in the 6h before onset/);
  assert.match(cause.text?.text ?? "", /i-09f3c2ab7d41e8b60/);
});

test("with neither a deploy nor a dominant resource it admits both", () => {
  const cause = anomalyBlocks({ ...card, deploy: null, topContributor: null })[2];
  assert.ok(cause.type === "section");
  assert.equal(
    cause.text?.text,
    "*Probable cause*\nNo deploy in the 6h before onset, and no single resource dominates.",
  );
});

test("the context line is CloudSpend, the account and one dashboard link", () => {
  const context = anomalyBlocks(card)[3];
  assert.ok(context.type === "context");
  assert.equal(
    context.elements[0].text,
    "CloudSpend · acct 4821-prod · <https://app.cloudspend.dev/anomalies/a1b2c3|View in dashboard>",
  );
});

test("demo figures are labelled in the Slack context too", () => {
  const context = anomalyBlocks({ ...card, demo: true })[3];
  assert.ok(context.type === "context");
  assert.match(context.elements[0].text, /CloudSpend · demo data · acct 4821-prod/);
});

test("Ack is default styling — never danger — and carries the anomaly id", () => {
  const actions = anomalyBlocks(card)[4];
  assert.ok(actions.type === "actions");
  const [ack, investigate] = actions.elements;
  assert.equal(ack.text.text, "Ack");
  assert.equal(ack.action_id, "anomaly_ack");
  assert.equal(ack.value, "a1b2c3");
  assert.equal(ack.style, undefined);
  assert.equal(investigate.text.text, "Investigate");
  assert.equal(investigate.url, card.dashboardUrl);
});

test("acking updates the message in place: prefixed header, no buttons", () => {
  const acked = ackedBlocks(card, { by: "@dana", at: new Date("2026-07-14T11:42:00Z") });
  assert.equal(acked.some((b) => b.type === "actions"), false);
  const header = acked[0];
  assert.equal(header.type === "header" && header.text.text, "Acked — Cost anomaly — EC2 in us-east-1");
  const last = acked[acked.length - 1];
  assert.ok(last.type === "context");
  assert.equal(last.elements[0].text, "Acked by @dana 11:42 UTC");
});

test("acking does not mutate the blocks a previous call returned", () => {
  const before = anomalyBlocks(card);
  ackedBlocks(card, { by: "@dana", at: new Date("2026-07-14T11:42:00Z") });
  const header = before[0];
  assert.equal(header.type === "header" && header.text.text, "Cost anomaly — EC2 in us-east-1");
});

test("the notification fallback carries the figure, since that is all a phone shows", () => {
  assert.equal(
    anomalyNotificationText(card),
    "Cost anomaly — EC2 in us-east-1 · +$342/day vs baseline",
  );
});

test("no emoji in any card, and no false positive on an ARN or a timestamp", () => {
  assert.equal(containsEmoji(anomalyBlocks(card)), false);
  assert.equal(containsEmoji(ackedBlocks(card, { by: "@dana", at: new Date() })), false);
  assert.equal(
    containsEmoji(
      anomalyBlocks({
        ...card,
        topContributor: { label: "arn:aws:ec2:us-east-1:481029384756:instance/i-09f", detail: "14:02:31" },
        deploy: null,
      }),
    ),
    false,
  );
  // And it does catch the real thing.
  assert.equal(
    containsEmoji([{ type: "context", elements: [{ type: "mrkdwn", text: "spend is up 🔥" }] }]),
    true,
  );
  assert.equal(
    containsEmoji([{ type: "context", elements: [{ type: "mrkdwn", text: "spend is up :fire:" }] }]),
    true,
  );
});

test("the digest card degrades to one honest sentence on a quiet day", () => {
  const quiet = digestBlocks({
    headline: "Daily cloud spend — Northwind",
    spendLine: "Month to date $12,483.07 · +8% vs the same point in JUNE",
    forecastLine: "Forecast $19,940",
    moverLines: [],
    anomalyLines: [],
    wasteLine: null,
    dashboardUrl: "https://app.cloudspend.dev/watch",
    accountLabel: "4821-prod",
  });
  assert.deepEqual(quiet.map((b) => b.type), ["header", "section", "section", "context"]);
  const body = quiet[2];
  assert.ok(body.type === "section");
  assert.match(body.text?.text ?? "", /Nothing moved more than a rounding error/);
  assert.equal(containsEmoji(quiet), false);
});

test("the digest card lists anomalies before movers", () => {
  const blocks = digestBlocks({
    headline: "Daily cloud spend — Northwind",
    spendLine: "s",
    forecastLine: "f",
    moverLines: ["Amazon EC2 up $1,100 (+22%)"],
    anomalyLines: ["EC2 — us-east-1 · +$342/DAY"],
    wasteLine: "$1,847/mo still recoverable in the waste report",
    dashboardUrl: "https://app.cloudspend.dev/watch",
    accountLabel: "4821-prod",
  });
  const texts = blocks.flatMap((b) => (b.type === "section" && b.text ? [b.text.text] : []));
  assert.ok(texts[0].startsWith("*Open anomalies*"));
  assert.ok(texts[1].startsWith("*Top movers*"));
});

test("the budget card states spent, limit, projection and reset", () => {
  const blocks = budgetBlocks({
    budgetName: "Platform team",
    message: "Platform team is at 78% of budget — $3,120 of $4,000.",
    scopeLabel: "Team=platform",
    spentMicros: 3_120_000_000,
    limitMicros: 4_000_000_000,
    projectedMicros: 4_400_000_000,
    daysRemaining: 9,
    dashboardUrl: "https://app.cloudspend.dev/budgets",
  });
  assert.deepEqual(blocks.map((b) => b.type), ["header", "section", "section", "context"]);
  const fields = blocks[2];
  assert.ok(fields.type === "section" && fields.fields);
  assert.equal(fields.fields[0].text, "*Spent*\n$3,120.00 of $4,000");
  assert.equal(fields.fields[1].text, "*Projected*\n$4,400 · resets in 9d");
  assert.equal(containsEmoji(blocks), false);
});
