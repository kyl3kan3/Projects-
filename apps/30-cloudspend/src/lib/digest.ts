/**
 * The daily / weekly digest: "spend so far, forecast vs last month, top movers".
 *
 * Two honesty rules are baked in here rather than left to the caller:
 *
 * - **Compare like with like.** Month-to-date is compared against the *same
 *   window* of last month, not last month's total — "you're 60% below last
 *   month" on the 5th is meaningless. The forecast is what gets compared to last
 *   month's total.
 * - **Say when there is nothing to say.** A digest with no movers and no
 *   anomalies says so in one line. Padding it with numbers nobody asked for is
 *   how a daily ritual becomes a filter rule.
 *
 * Pure module: figures in, sentences out.
 */

import { formatPercentDelta, formatPerDay, formatUsd, formatUsdWhole } from "@/lib/money";
import { monthName, previousMonthStart } from "@/lib/dates";
import type { ForecastResult, Mover } from "@/lib/forecast";

export interface DigestFigures {
  orgName: string;
  accountLabel: string;
  asOf: Date;
  frequency: "daily" | "weekly";
  mtdMicros: number;
  forecast: ForecastResult;
  /** Last month's full total, for the forecast comparison. */
  lastMonthTotalMicros: number;
  /** Last month up to the same day-of-month, for the MTD comparison. */
  lastMonthToDateMicros: number;
  movers: Mover[];
  openAnomalies: Array<{ service: string; region: string; deltaPerDayMicros: number }>;
  recoverableMicros: number;
  /** True when the figures come from the synthetic provider. */
  demo: boolean;
}

export interface Digest {
  /** Slack header text and email subject. */
  headline: string;
  /** The MTD line, always present. */
  spendLine: string;
  /** The forecast line, always present. */
  forecastLine: string;
  /** Zero to three mover lines. */
  moverLines: string[];
  /** Zero to three anomaly lines. */
  anomalyLines: string[];
  /** The waste nudge, or null when there is nothing recoverable. */
  wasteLine: string | null;
  /** One-line summary stored in the alert log. */
  summary: string;
}

export function buildDigest(f: DigestFigures): Digest {
  const period = f.frequency === "weekly" ? "This week" : "Today";
  const lastMonth = monthName(previousMonthStart(f.asOf));

  const headline = `${f.frequency === "weekly" ? "Weekly" : "Daily"} cloud spend — ${f.orgName}${
    f.demo ? " (demo data)" : ""
  }`;

  const spendLine = `Month to date ${formatUsd(f.mtdMicros)} · ${formatPercentDelta(
    f.mtdMicros,
    f.lastMonthToDateMicros,
  )} vs the same point in ${lastMonth}`;

  const method =
    f.forecast.method === "trailing"
      ? `at the last 7 days' rate (${formatUsdWhole(f.forecast.dailyRateMicros)}/day)`
      : "at this month's run rate so far";
  const forecastLine = `Forecast ${formatUsdWhole(f.forecast.projectedMicros)} ${method} · ${formatPercentDelta(
    f.forecast.projectedMicros,
    f.lastMonthTotalMicros,
  )} vs ${lastMonth}'s ${formatUsdWhole(f.lastMonthTotalMicros)}`;

  const moverLines = f.movers.map((m) => {
    const direction = m.deltaMicros > 0 ? "up" : "down";
    return `${m.key} ${direction} ${formatUsdWhole(Math.abs(m.deltaMicros))} (${formatPercentDelta(
      m.currentMicros,
      m.previousMicros,
    )})`;
  });

  const anomalyLines = f.openAnomalies
    .slice(0, 3)
    .map((a) => `${shortServiceName(a.service)} — ${a.region} · ${formatPerDay(a.deltaPerDayMicros)}`);

  const wasteLine =
    f.recoverableMicros > 0
      ? `${formatUsdWhole(f.recoverableMicros)}/mo still recoverable in the waste report`
      : null;

  const quiet = moverLines.length === 0 && anomalyLines.length === 0;
  const summary = quiet
    ? `${period}: ${formatUsd(f.mtdMicros)} MTD, nothing moved and no open anomalies.`
    : `${period}: ${formatUsd(f.mtdMicros)} MTD, ${f.openAnomalies.length} open anomal${
        f.openAnomalies.length === 1 ? "y" : "ies"
      }, top mover ${moverLines[0] ?? "none"}.`;

  return { headline, spendLine, forecastLine, moverLines, anomalyLines, wasteLine, summary };
}

/**
 * `Amazon Elastic Compute Cloud - Compute` is what Cost Explorer calls EC2. The
 * full string does not fit a phone row and reads like a database dump, so it is
 * shortened for display — but only where it is unambiguous.
 */
const SHORT_NAMES: Array<[RegExp, string]> = [
  [/^Amazon Elastic Compute Cloud/i, "EC2"],
  [/^Amazon Relational Database Service/i, "RDS"],
  [/^Amazon Simple Storage Service/i, "S3"],
  [/^Amazon Virtual Private Cloud/i, "NAT Gateway"],
  [/^Amazon Elastic Container Service/i, "ECS"],
  [/^Amazon Elastic Kubernetes Service/i, "EKS"],
  [/^AmazonCloudWatch$/i, "CloudWatch"],
  [/^AWS Data Transfer/i, "Data Transfer"],
  [/^Amazon CloudFront/i, "CloudFront"],
  [/^Amazon Simple Queue Service/i, "SQS"],
  [/^Amazon DynamoDB/i, "DynamoDB"],
  [/^Amazon ElastiCache/i, "ElastiCache"],
  [/^Amazon OpenSearch Service/i, "OpenSearch"],
];

export function shortServiceName(service: string): string {
  for (const [pattern, short] of SHORT_NAMES) {
    if (pattern.test(service)) return short;
  }
  return service;
}

/** The digest as plain text, for the email fallback. */
export function digestToText(d: Digest): string {
  const parts = [d.headline, "", d.spendLine, d.forecastLine];
  if (d.anomalyLines.length) parts.push("", "Open anomalies:", ...d.anomalyLines.map((l) => `  ${l}`));
  if (d.moverLines.length) parts.push("", "Top movers:", ...d.moverLines.map((l) => `  ${l}`));
  if (d.wasteLine) parts.push("", d.wasteLine);
  if (!d.anomalyLines.length && !d.moverLines.length) {
    parts.push("", "Nothing moved more than a rounding error. No open anomalies.");
  }
  return parts.join("\n");
}
