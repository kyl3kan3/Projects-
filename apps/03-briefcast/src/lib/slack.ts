/**
 * Slack delivery. Post-meeting DM to the organizer with summary, action
 * items, and pending CRM proposals (approve/dismiss). Block Kit, formatted
 * for both desktop and mobile Slack.
 */

import { WebClient } from "@slack/web-api";
import { env } from "@/lib/env";

export interface SlackBrief {
  botToken: string;
  slackUserId: string;
  title: string;
  meta: string;
  overview: string;
  actionItems: { text: string; owner: string | null; due: string | null }[];
  pendingProposals: number;
  meetingUrl: string;
}

export async function postBriefToSlack(brief: SlackBrief): Promise<{ ts: string } | null> {
  if (env.dryRun) return { ts: "dry-run" };
  const client = new WebClient(brief.botToken);

  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: brief.title } },
    { type: "context", elements: [{ type: "mrkdwn", text: brief.meta }] },
    { type: "section", text: { type: "mrkdwn", text: brief.overview } },
  ];

  if (brief.actionItems.length) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Action items*\n" + brief.actionItems
          .map((a) => `• ${a.text}${a.owner ? ` — _${a.owner}_` : ""}${a.due ? ` (${a.due})` : ""}`)
          .join("\n"),
      },
    });
  }

  if (brief.pendingProposals > 0) {
    blocks.push({
      type: "actions",
      elements: [
        { type: "button", text: { type: "plain_text", text: `Review ${brief.pendingProposals} CRM update${brief.pendingProposals > 1 ? "s" : ""}` }, url: brief.meetingUrl, style: "primary" },
      ],
    });
  } else {
    blocks.push({ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open brief" }, url: brief.meetingUrl }] });
  }

  const res = await client.chat.postMessage({
    channel: brief.slackUserId,
    text: `Brief ready: ${brief.title}`,
    blocks: blocks as never,
  });
  return res.ts ? { ts: res.ts } : null;
}
