/**
 * The Slack alert card — DESIGN.md calls it a co-flagship and specifies it block
 * by block, so this module is a literal implementation of that spec and is
 * tested against it.
 *
 * Rules that are easy to get wrong and are therefore asserted in the tests:
 *
 * - **No emoji, anywhere.** Severity is a label and a figure, never a siren.
 * - **`Ack` is default styling, never `danger`.** A cost anomaly is information,
 *   not a fire alarm.
 * - **Ack updates the message in place** — header prefixed `Acked —`, actions
 *   replaced by a context line. It never posts a second message; a channel that
 *   fills with duplicates is a channel that gets muted.
 * - **The probable cause never guesses.** With no deploy in the window it says
 *   there was no deploy, and names the top contributor instead.
 *
 * Pure module — no SDK import, no db — so it can be unit tested and reused by the
 * in-app card, which DESIGN.md requires to mirror it.
 */

import { formatUsd, formatUsdWhole } from "@/lib/money";
import { durationShort, stampUtc } from "@/lib/dates";
import { shortServiceName } from "@/lib/digest";

/* Minimal Block Kit types — only the subset this product emits. */
export interface SlackText {
  type: "mrkdwn" | "plain_text";
  text: string;
  emoji?: false;
}
export interface SlackImageAccessory {
  type: "image";
  image_url: string;
  alt_text: string;
}
export interface SlackButton {
  type: "button";
  text: SlackText;
  action_id: string;
  value?: string;
  url?: string;
  style?: "primary" | "danger";
}
export type SlackBlock =
  | { type: "header"; text: SlackText }
  | { type: "section"; text?: SlackText; fields?: SlackText[]; accessory?: SlackImageAccessory }
  | { type: "context"; elements: SlackText[] }
  | { type: "actions"; elements: SlackButton[] }
  | { type: "divider" };

export interface AnomalyCardInput {
  anomalyId: string;
  service: string;
  region: string;
  accountLabel: string;
  startedAt: Date;
  asOf: Date;
  deltaPerDayMicros: number;
  deploy: { sha: string; serviceName: string; leadTime: string; commitUrl?: string | null } | null;
  topContributor: { label: string; detail: string } | null;
  trendImageUrl: string | null;
  dashboardUrl: string;
  demo: boolean;
}

export function anomalyTitle(service: string, region: string): string {
  return `Cost anomaly — ${shortServiceName(service)} in ${region}`;
}

/** `+$342/day vs baseline` — the Slack specimen (in-app uses `/DAY`). */
export function slackDelta(deltaPerDayMicros: number): string {
  const sign = deltaPerDayMicros >= 0 ? "+" : "-";
  return `${sign}${formatUsdWhole(Math.abs(deltaPerDayMicros))}/day vs baseline`;
}

function probableCause(input: AnomalyCardInput): string {
  if (input.deploy) {
    const link = input.deploy.commitUrl
      ? `<${input.deploy.commitUrl}|\`${input.deploy.sha}\`>`
      : `\`${input.deploy.sha}\``;
    return `*Probable cause*\nDeploy ${link} of \`${input.deploy.serviceName}\`, ${input.deploy.leadTime}`;
  }
  if (input.topContributor) {
    return `*Probable cause*\nNo deploy in the 6h before onset. Largest contributor: \`${input.topContributor.label}\` (${input.topContributor.detail})`;
  }
  return "*Probable cause*\nNo deploy in the 6h before onset, and no single resource dominates.";
}

export function anomalyBlocks(input: AnomalyCardInput): SlackBlock[] {
  const since = `${stampUtc(input.startedAt)} (${durationShort(
    input.startedAt.getTime(),
    input.asOf.getTime(),
  )})`;

  const summary: SlackBlock = {
    type: "section",
    fields: [
      { type: "mrkdwn", text: `*Delta*\n${slackDelta(input.deltaPerDayMicros)}` },
      { type: "mrkdwn", text: `*Since*\n${since}` },
    ],
  };
  if (input.trendImageUrl) {
    summary.accessory = {
      type: "image",
      image_url: input.trendImageUrl,
      alt_text: `${shortServiceName(input.service)} spend against its baseline, with the anomaly flare at the peak`,
    };
  }

  const context = [
    "CloudSpend",
    `acct ${input.accountLabel}`,
    `<${input.dashboardUrl}|View in dashboard>`,
  ];
  if (input.demo) context.splice(1, 0, "demo data");

  return [
    { type: "header", text: { type: "plain_text", text: anomalyTitle(input.service, input.region), emoji: false } },
    summary,
    { type: "section", text: { type: "mrkdwn", text: probableCause(input) } },
    { type: "context", elements: [{ type: "mrkdwn", text: context.join(" · ") }] },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          // Default styling, deliberately: DESIGN.md forbids `danger` here.
          text: { type: "plain_text", text: "Ack", emoji: false },
          action_id: "anomaly_ack",
          value: input.anomalyId,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Investigate", emoji: false },
          action_id: "anomaly_investigate",
          url: `${input.dashboardUrl}`,
        },
      ],
    },
  ];
}

/**
 * The acked message. Same blocks, header prefixed, actions replaced by a context
 * line naming who acked it and when.
 */
export function ackedBlocks(
  input: AnomalyCardInput,
  ack: { by: string; at: Date },
): SlackBlock[] {
  const blocks = anomalyBlocks(input);
  const header = blocks[0];
  if (header.type === "header") {
    header.text = { type: "plain_text", text: `Acked — ${header.text.text}`, emoji: false };
  }
  const withoutActions = blocks.filter((b) => b.type !== "actions");
  const hh = String(ack.at.getUTCHours()).padStart(2, "0");
  const mm = String(ack.at.getUTCMinutes()).padStart(2, "0");
  withoutActions.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `Acked by ${ack.by} ${hh}:${mm} UTC` }],
  });
  return withoutActions;
}

/** Plain-text fallback, which is what a mobile notification actually shows. */
export function anomalyNotificationText(input: AnomalyCardInput): string {
  return `${anomalyTitle(input.service, input.region)} · ${slackDelta(input.deltaPerDayMicros)}`;
}

/* ----------------------------------------------------------- the digest */

export interface DigestCardInput {
  headline: string;
  spendLine: string;
  forecastLine: string;
  moverLines: string[];
  anomalyLines: string[];
  wasteLine: string | null;
  dashboardUrl: string;
  accountLabel: string;
}

export function digestBlocks(input: DigestCardInput): SlackBlock[] {
  const blocks: SlackBlock[] = [
    { type: "header", text: { type: "plain_text", text: input.headline, emoji: false } },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Spend*\n${input.spendLine}` },
        { type: "mrkdwn", text: `*Forecast*\n${input.forecastLine}` },
      ],
    },
  ];
  if (input.anomalyLines.length) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Open anomalies*\n${input.anomalyLines.map((l) => `• ${l}`).join("\n")}`,
      },
    });
  }
  if (input.moverLines.length) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Top movers*\n${input.moverLines.map((l) => `• ${l}`).join("\n")}`,
      },
    });
  }
  if (!input.anomalyLines.length && !input.moverLines.length) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Nothing moved more than a rounding error, and no anomalies are open.",
      },
    });
  }
  if (input.wasteLine) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: input.wasteLine }] });
  }
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `CloudSpend · acct ${input.accountLabel} · <${input.dashboardUrl}|View in dashboard>`,
      },
    ],
  });
  return blocks;
}

/* ----------------------------------------------------------- the budget */

export interface BudgetCardInput {
  budgetName: string;
  message: string;
  scopeLabel: string;
  spentMicros: number;
  limitMicros: number;
  projectedMicros: number;
  daysRemaining: number;
  dashboardUrl: string;
}

export function budgetBlocks(input: BudgetCardInput): SlackBlock[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: `Budget — ${input.budgetName}`, emoji: false },
    },
    { type: "section", text: { type: "mrkdwn", text: input.message } },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Spent*\n${formatUsd(input.spentMicros)} of ${formatUsdWhole(input.limitMicros)}`,
        },
        {
          type: "mrkdwn",
          text: `*Projected*\n${formatUsdWhole(input.projectedMicros)} · resets in ${input.daysRemaining}d`,
        },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `CloudSpend · ${input.scopeLabel} · <${input.dashboardUrl}|View budgets>`,
        },
      ],
    },
  ];
}

/**
 * Guardrail against the one rule that cannot be caught by reading a diff: an
 * emoji sneaking into a block through interpolated content. Used by the tests
 * and by the delivery path, which refuses to send a block that trips it.
 */
const EMOJI = /\p{Extended_Pictographic}|(?<![\w:/]):[a-z0-9_+-]+:(?![\w/])/u;

export function containsEmoji(blocks: SlackBlock[]): boolean {
  return EMOJI.test(JSON.stringify(blocks));
}
