/**
 * Slack alerts.
 *
 * The message is built as pure data by `buildSlackMessage`, which is what the
 * tests assert on and what the in-app "Alert preview" renders — DESIGN.md asks
 * for the Slack alert and its in-app mirror to be the same artifact, and the
 * only way to keep that true is for both to read one builder.
 *
 * No emoji, per DESIGN.md's iconography rule, which explicitly extends to Slack
 * and PR comments: verdicts are words and figures, never sirens.
 *
 * Delivery uses an incoming-webhook URL. A full workspace-install OAuth flow is
 * ARCHITECTURE.md's target but needs a registered Slack app; a webhook URL is
 * the same payload over the same API and is something a customer can paste in
 * during onboarding.
 */

export interface SlackFinding {
  level: "breaking" | "risky" | "compatible" | "info";
  message: string;
  jsonPointer: string;
  endpoint: string | null;
  method: string | null;
  impactedConsumers: string[];
}

export interface SlackAlertInput {
  apiName: string;
  apiSlug: string;
  verdict: "breaking" | "risky" | "compatible";
  counts: { breaking: number; risky: number; compatible: number };
  fromLabel: string;
  toLabel: string;
  environment: string;
  diffUrl: string;
  findings: SlackFinding[];
  impactedConsumers: string[];
}

export interface SlackMessage {
  text: string;
  blocks: unknown[];
}

const VERDICT_WORD = {
  breaking: "BREAKING",
  risky: "RISKY",
  compatible: "COMPATIBLE",
} as const;

/** Top three non-compatible findings — the alert is a summons, not a report. */
const TOP_N = 3;

export function buildSlackMessage(input: SlackAlertInput): SlackMessage {
  const verdictWord = VERDICT_WORD[input.verdict];
  const count =
    input.verdict === "breaking"
      ? input.counts.breaking
      : input.verdict === "risky"
        ? input.counts.risky
        : input.counts.compatible;

  // The fallback text is what lands in a mobile notification, so it carries the
  // whole verdict on its own.
  const text = `API change — ${input.apiName}: ${verdictWord} (${count}) on ${input.toLabel}`;

  const top = input.findings.filter((f) => f.level === "breaking" || f.level === "risky").slice(0, TOP_N);
  const remaining = input.findings.filter((f) => f.level === "breaking" || f.level === "risky").length - top.length;

  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `API change — ${input.apiName}`, emoji: false },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Verdict*\n${verdictWord} (${count})` },
        { type: "mrkdwn", text: `*Deploy*\n\`${input.toLabel}\`` },
        { type: "mrkdwn", text: `*Baseline*\n\`${input.fromLabel}\`` },
        { type: "mrkdwn", text: `*Environment*\n${input.environment}` },
      ],
    },
  ];

  for (const finding of top) {
    const where = finding.endpoint ? `${finding.method ?? ""} ${finding.endpoint}`.trim() : "API-wide";
    const lines = [
      `*${finding.level.toUpperCase()}* · ${where}`,
      finding.message,
      `\`${finding.jsonPointer}\``,
    ];
    if (finding.impactedConsumers.length > 0) {
      lines.push(`Breaks: ${finding.impactedConsumers.join(" · ")}`);
    }
    blocks.push({ type: "section", text: { type: "mrkdwn", text: lines.join("\n") } });
  }

  if (remaining > 0) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `${remaining} more finding${remaining === 1 ? "" : "s"} in the diff.` }],
    });
  }

  if (input.impactedConsumers.length > 0) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `Impacted consumers: ${input.impactedConsumers.join(", ")}` }],
    });
  }

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "View diff", emoji: false },
        url: input.diffUrl,
        style: input.verdict === "breaking" ? "danger" : undefined,
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Acknowledge", emoji: false },
        url: `${input.diffUrl}#acknowledge`,
      },
    ].map((el) => Object.fromEntries(Object.entries(el).filter(([, v]) => v !== undefined))),
  });

  return { text, blocks };
}

/** POST to a Slack incoming webhook. Throws on a non-2xx so retry can happen. */
export async function postSlackWebhook(url: string, message: SlackMessage): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Slack responded ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
}
