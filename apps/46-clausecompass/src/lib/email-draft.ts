/**
 * src/lib/email-draft.ts
 *
 * The "requested changes" email: the accepted redlines, assembled into a message a
 * freelancer can send to the person who sent the contract.
 *
 * Polite by construction rather than by tone-of-voice instructions to a model. The
 * greeting, the framing, the ordering and the sign-off are fixed; only the asks change.
 * That also makes it testable, which matters — this is the artefact that leaves the
 * product and goes to a client.
 *
 * It never says the contract is unacceptable and never tells the reader what to do with
 * it. It asks for specific changes and offers wording.
 */

import type { Severity } from "@/db/schema";

export interface DraftAsk {
  clauseLabel: string;
  citation: string | null;
  severity: Severity;
  emailSnippet: string;
  suggestedText: string;
}

export interface DraftInput {
  contractTitle: string;
  counterparty: string | null;
  senderName: string;
  asks: DraftAsk[];
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, caution: 1, ok: 2 };

/**
 * Build the email body. Highest severity first, at most one paragraph per ask, and the
 * suggested wording quoted underneath it so the other side can paste it straight into
 * the document.
 */
export function buildRequestedChangesEmail(input: DraftInput): string {
  const asks = [...input.asks].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const who = input.counterparty ? ` at ${input.counterparty}` : "";

  if (asks.length === 0) {
    return [
      `Hi,`,
      "",
      `Thanks for sending over the ${input.contractTitle}. I have read it through and I am happy with the terms as drafted.`,
      "",
      "Happy to sign whenever you are ready.",
      "",
      "Best,",
      input.senderName,
    ].join("\n");
  }

  const lines: string[] = [
    "Hi,",
    "",
    `Thanks for sending the ${input.contractTitle}. I have read it and I would like to suggest ${
      asks.length === 1 ? "one change" : `${asks.length} changes`
    } before signing. Everything else looks workable to me.`,
    "",
  ];

  asks.forEach((ask, i) => {
    const ref = ask.citation ? ` (${ask.citation})` : "";
    lines.push(`${i + 1}. ${ask.clauseLabel}${ref} — ${ask.emailSnippet}`);
    lines.push("");
    lines.push(`   Suggested wording: ${collapse(ask.suggestedText)}`);
    lines.push("");
  });

  lines.push(
    `Happy to talk any of these through${who} if it is easier, and happy to sign once we have landed on wording that works for both of us.`,
    "",
    "Best,",
    input.senderName,
  );
  return lines.join("\n");
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function draftSubject(contractTitle: string): string {
  return `${contractTitle} — a few suggested changes`;
}
