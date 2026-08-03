/**
 * src/lib/chase-copy.ts
 *
 * The words the ladder sends. Pure functions of the facts, so the copy is
 * testable and the same sentences appear in the app, the email, and the chase
 * timeline.
 *
 * Tone escalates from a reminder to a plain statement of consequence, and never
 * becomes robotic-legal: the person reading this is usually an agent's assistant
 * who can fix it in four minutes if the email tells them exactly what is wrong.
 * Deficiency sentences are quoted **verbatim** from the engine — never re-worded
 * for the email — so the sentence the coordinator sees is the sentence the agent
 * gets.
 */

import { formatDate, relativeDays } from "@/lib/dates";
import { CHASE_LABEL } from "@/lib/ladder";
import type { ChaseKind, Deficiency } from "@/db/schema";

export interface ChaseContext {
  orgName: string;
  vendorName: string;
  /** Properties or projects this engagement covers, for the subject line. */
  propertyName: string;
  uploadUrl: string;
  /** The soonest required-line expiry, when known. */
  expiresOn: string | null;
  daysToExpiry: number | null;
  deficiencies: Deficiency[];
  /** Who to name as the sender — the org's compliance contact. */
  signature: string;
}

export interface ChaseMessage {
  subject: string;
  /** Plain text; every chase is readable in a phone's preview pane. */
  text: string;
}

function deficiencyBlock(deficiencies: Deficiency[]): string {
  if (!deficiencies.length) return "";
  return `\nWhat is wrong, exactly:\n${deficiencies
    .map((d) => `  - ${d.reason}`)
    .join("\n")}\n`;
}

function footer(ctx: ChaseContext): string {
  return [
    "",
    `Upload the certificate here — no account needed:`,
    ctx.uploadUrl,
    "",
    ctx.signature,
    ctx.orgName,
  ].join("\n");
}

export function chaseMessage(kind: ChaseKind, ctx: ChaseContext): ChaseMessage {
  const expiry = ctx.expiresOn ? formatDate(ctx.expiresOn) : "an unknown date";
  const when = ctx.daysToExpiry != null ? relativeDays(ctx.daysToExpiry) : "soon";

  switch (kind) {
    case "renewal_t30":
      return {
        subject: `Insurance certificate for ${ctx.vendorName} expires ${expiry}`,
        text: [
          `Hello,`,
          ``,
          `${ctx.vendorName}'s certificate of insurance on file with ${ctx.orgName} for ${ctx.propertyName} expires ${expiry} — ${when}.`,
          ``,
          `Please send the renewal certificate when your carrier issues it. Thirty days is plenty of time, and getting it in early means nobody has to stop work over paperwork.`,
          footer(ctx),
        ].join("\n"),
      };

    case "renewal_t14":
      return {
        subject: `Two weeks: renewal certificate needed for ${ctx.vendorName}`,
        text: [
          `Hello,`,
          ``,
          `We still do not have the renewal certificate for ${ctx.vendorName} at ${ctx.propertyName}. The current one expires ${expiry} — ${when}.`,
          ``,
          `If the policy has already renewed, the certificate is a two-minute request to your agent. Send it whenever it lands.`,
          footer(ctx),
        ].join("\n"),
      };

    case "renewal_t7":
      return {
        subject: `One week left: ${ctx.vendorName} insurance expires ${expiry}`,
        text: [
          `Hello,`,
          ``,
          `${ctx.vendorName}'s certificate for ${ctx.propertyName} expires ${expiry} — ${when} — and ${ctx.orgName} has not received the renewal.`,
          ``,
          `Once it lapses we have to hold work orders until a valid certificate is on file. We would much rather not do that.`,
          footer(ctx),
        ].join("\n"),
      };

    case "renewal_t1":
      return {
        subject: `Tomorrow: ${ctx.vendorName} insurance lapses without a renewal`,
        text: [
          `Hello,`,
          ``,
          `This is the last reminder before the certificate lapses. ${ctx.vendorName}'s coverage on file with ${ctx.orgName} for ${ctx.propertyName} expires ${expiry}.`,
          ``,
          `Send the renewal certificate today and nothing changes. Without it, work orders are held from tomorrow.`,
          footer(ctx),
        ].join("\n"),
      };

    case "lapsed":
      return {
        subject: `Lapsed: no valid insurance on file for ${ctx.vendorName}`,
        text: [
          `Hello,`,
          ``,
          `${ctx.vendorName}'s certificate of insurance for ${ctx.propertyName} expired ${expiry}. ${ctx.orgName} has no valid certificate on file, so ${ctx.vendorName} is flagged as non-compliant and new work orders are held.`,
          deficiencyBlock(ctx.deficiencies),
          `Send a current certificate and the flag clears as soon as it is reviewed — usually the same day.`,
          footer(ctx),
        ].join("\n"),
      };

    case "deficiency":
      return {
        subject: `Certificate for ${ctx.vendorName} does not meet the requirement`,
        text: [
          `Hello,`,
          ``,
          `${ctx.orgName} reviewed the certificate of insurance for ${ctx.vendorName} at ${ctx.propertyName}. It does not meet the insurance requirement in the contract, so ${ctx.vendorName} is flagged as non-compliant.`,
          deficiencyBlock(ctx.deficiencies),
          `Please ask your agent to reissue the certificate with the items above corrected, then upload it. We will re-check it the same day.`,
          footer(ctx),
        ].join("\n"),
      };
  }
}

/** The one-line description shown on the chase timeline. */
export function chaseTimelineLabel(kind: ChaseKind): string {
  return CHASE_LABEL[kind];
}
