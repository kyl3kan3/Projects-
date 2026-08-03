import assert from "node:assert/strict";
import test from "node:test";
import { buildDigest, digestToText, shortServiceName, type DigestFigures } from "./digest";

const base: DigestFigures = {
  orgName: "Northwind",
  accountLabel: "4821-prod",
  asOf: new Date("2026-07-14T09:00:00Z"),
  frequency: "daily",
  mtdMicros: 12_483_070_000,
  forecast: { projectedMicros: 19_940_000_000, method: "trailing", dailyRateMicros: 440_000_000 },
  lastMonthTotalMicros: 18_463_000_000,
  lastMonthToDateMicros: 11_558_000_000,
  movers: [
    { key: "Amazon EC2", currentMicros: 6_200_000_000, previousMicros: 5_100_000_000, deltaMicros: 1_100_000_000 },
    { key: "Amazon S3", currentMicros: 800_000_000, previousMicros: 940_000_000, deltaMicros: -140_000_000 },
  ],
  openAnomalies: [
    { service: "Amazon Elastic Compute Cloud - Compute", region: "us-east-1", deltaPerDayMicros: 342_000_000 },
    { service: "Amazon Virtual Private Cloud", region: "us-east-1", deltaPerDayMicros: 88_000_000 },
  ],
  recoverableMicros: 1_847_000_000,
  demo: false,
};

test("MTD is compared with the same window last month, not last month's total", () => {
  const d = buildDigest(base);
  assert.equal(
    d.spendLine,
    "Month to date $12,483.07 · +8% vs the same point in JUNE",
  );
});

test("the forecast is compared with last month's total, and names its method", () => {
  const d = buildDigest(base);
  assert.match(d.forecastLine, /^Forecast \$19,940 at the last 7 days' rate \(\$440\/day\)/);
  assert.match(d.forecastLine, /\+8% vs JUNE's \$18,463/);

  const runRate = buildDigest({
    ...base,
    forecast: { projectedMicros: 19_940_000_000, method: "run-rate", dailyRateMicros: 440_000_000 },
  });
  assert.match(runRate.forecastLine, /at this month's run rate so far/);
});

test("movers read as dollars up or down with the percentage second", () => {
  const d = buildDigest(base);
  assert.deepEqual(d.moverLines, ["Amazon EC2 up $1,100 (+22%)", "Amazon S3 down $140 (-15%)"]);
});

test("anomaly lines use short service names and a signed per-day delta", () => {
  const d = buildDigest(base);
  assert.deepEqual(d.anomalyLines, [
    "EC2 — us-east-1 · +$342/DAY",
    "NAT Gateway — us-east-1 · +$88/DAY",
  ]);
});

test("at most three anomalies are listed", () => {
  const d = buildDigest({
    ...base,
    openAnomalies: Array.from({ length: 6 }, (_, i) => ({
      service: "AWS Lambda",
      region: "us-east-1",
      deltaPerDayMicros: (i + 1) * 1_000_000,
    })),
  });
  assert.equal(d.anomalyLines.length, 3);
});

test("a quiet day says so instead of padding", () => {
  const d = buildDigest({ ...base, movers: [], openAnomalies: [], recoverableMicros: 0 });
  assert.equal(d.wasteLine, null);
  assert.match(d.summary, /nothing moved and no open anomalies/);
  assert.match(digestToText(d), /Nothing moved more than a rounding error/);
});

test("demo figures are labelled in the headline", () => {
  assert.equal(buildDigest(base).headline, "Daily cloud spend — Northwind");
  assert.equal(
    buildDigest({ ...base, demo: true }).headline,
    "Daily cloud spend — Northwind (demo data)",
  );
  assert.equal(
    buildDigest({ ...base, frequency: "weekly" }).headline,
    "Weekly cloud spend — Northwind",
  );
});

test("a first-month org with no history reads as new, not as a fall of 100%", () => {
  const d = buildDigest({ ...base, lastMonthToDateMicros: 0, lastMonthTotalMicros: 0 });
  assert.match(d.spendLine, /new vs the same point in JUNE/);
  assert.match(d.forecastLine, /new vs JUNE's \$0/);
});

test("Cost Explorer's service names are shortened only where unambiguous", () => {
  assert.equal(shortServiceName("Amazon Elastic Compute Cloud - Compute"), "EC2");
  assert.equal(shortServiceName("AmazonCloudWatch"), "CloudWatch");
  assert.equal(shortServiceName("Amazon Virtual Private Cloud"), "NAT Gateway");
  // Anything unrecognised is left exactly as AWS reported it.
  assert.equal(shortServiceName("AWS Elemental MediaConvert"), "AWS Elemental MediaConvert");
});

test("the text rendering carries every section that has content", () => {
  const text = digestToText(buildDigest(base));
  assert.match(text, /Open anomalies:/);
  assert.match(text, /Top movers:/);
  assert.match(text, /\$1,847\/mo still recoverable/);
});
