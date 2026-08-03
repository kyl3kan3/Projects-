/**
 * src/lib/mailer.ts
 *
 * Outbound email (Resend). Two messages exist: the report is ready, and the review
 * failed and your credit is back.
 *
 * With no `RESEND_API_KEY`, or with `DRY_RUN=1`, mail is logged instead of sent — and
 * the send never throws into the pipeline. A review that succeeded must not be marked
 * failed because a mail provider was down.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users, type Contract } from "@/db/schema";
import { emailConfigured, env } from "@/lib/env";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

async function deliver(mail: Mail): Promise<void> {
  if (!emailConfigured()) {
    console.info(`[mail:dry-run] to=${mail.to} subject="${mail.subject}"`);
    return;
  }
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(env.resendApiKey);
    await resend.emails.send({
      from: env.emailFrom,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
    });
  } catch (err) {
    console.error("[mail] send failed", err);
  }
}

async function ownerEmail(accountId: string): Promise<string | null> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.accountId, accountId));
  return user?.email ?? null;
}

const DISCLAIMER =
  "ClauseCompass is a reading tool, not a law firm, and this review is not legal advice.";

export async function sendReportReady(
  contract: Contract,
  summary: { high: number; caution: number; ok: number },
): Promise<void> {
  const to = await ownerEmail(contract.accountId);
  if (!to) return;
  const url = `${env.appUrl}/contracts/${contract.id}`;
  await deliver({
    to,
    subject: `Your review of ${contract.title} is ready`,
    text: [
      `${contract.title} has been reviewed against ${contract.playbookName ?? "the default playbook"}.`,
      "",
      `${summary.high} HIGH · ${summary.caution} CAUTION · ${summary.ok} OK`,
      "",
      `Read the report: ${url}`,
      "",
      "Every flag in it quotes the contract's own words, with a section and page reference.",
      "",
      DISCLAIMER,
    ].join("\n"),
  });
}

export async function sendReviewFailed(
  contract: Contract,
  reason: string,
  refunded: boolean,
): Promise<void> {
  const to = await ownerEmail(contract.accountId);
  if (!to) return;
  await deliver({
    to,
    subject: `We could not finish reviewing ${contract.title}`,
    text: [
      `The review of ${contract.title} stopped before it finished.`,
      "",
      `What went wrong: ${reason}`,
      "",
      refunded
        ? "Your review credit has been put back on your account, so you are not charged for this."
        : "No credit was spent on this review.",
      "",
      `You can try again here: ${env.appUrl}/contracts/new`,
      "",
      DISCLAIMER,
    ].join("\n"),
  });
}
