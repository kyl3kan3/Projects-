/**
 * src/lib/email.ts
 *
 * Outbound mail through Resend, with a safety switch.
 *
 * `DRY_RUN` defaults to on, so an environment pointed at real carrier data
 * cannot accidentally mail a real broker. When it is on — or when there is no
 * Resend key — the message is logged with its recipient and attachment size and
 * the caller is told plainly that nothing left the building. The invoice still
 * moves to "sent" in that case, because the state machine is about what the
 * carrier decided, and the screen says "logged, not sent" beside it.
 */

import { env, features } from "@/lib/env";
import { formatCents } from "@/lib/money";
import { getObject } from "@/lib/storage";

export interface SendOutcome {
  logged: boolean;
  id: string | null;
}

interface Attachment {
  filename: string;
  content: Buffer;
}

async function deliver(opts: {
  to: string;
  subject: string;
  text: string;
  attachments?: Attachment[];
}): Promise<SendOutcome> {
  const attachmentNote = (opts.attachments ?? [])
    .map((a) => `${a.filename} (${Math.round(a.content.byteLength / 1024)}KB)`)
    .join(", ");

  if (!features.resend) {
    console.log(
      `[email:dry-run] to=${opts.to} subject="${opts.subject}"` +
        (attachmentNote ? ` attachments=[${attachmentNote}]` : ""),
    );
    console.log(opts.text);
    return { logged: true, id: null };
  }

  const { Resend } = await import("resend");
  const resend = new Resend(env.resendApiKey);
  const response = await resend.emails.send({
    from: env.emailFrom,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    attachments: (opts.attachments ?? []).map((a) => ({
      filename: a.filename,
      content: a.content.toString("base64"),
    })),
  });
  if (response.error) throw new Error(`Resend refused the message: ${response.error.message}`);
  return { logged: false, id: response.data?.id ?? null };
}

export async function sendInvoiceEmail(opts: {
  to: string;
  carrierName: string;
  invoiceNumber: number;
  amountCents: number;
  reference: string | null;
  termsDays: number;
  packet: { key: string; filename: string } | null;
}): Promise<SendOutcome> {
  const attachments: Attachment[] = [];
  if (opts.packet) {
    const bytes = await getObject(opts.packet.key);
    if (bytes) attachments.push({ filename: opts.packet.filename, content: Buffer.from(bytes) });
  }

  const subject = opts.reference
    ? `Invoice ${opts.invoiceNumber} — load ${opts.reference} — ${opts.carrierName}`
    : `Invoice ${opts.invoiceNumber} — ${opts.carrierName}`;

  const text = [
    `Invoice ${opts.invoiceNumber} from ${opts.carrierName}.`,
    ``,
    `Amount due: ${formatCents(opts.amountCents)}`,
    `Terms: Net ${opts.termsDays}`,
    opts.reference ? `Your load number: ${opts.reference}` : null,
    ``,
    attachments.length > 0
      ? `Attached: the invoice, the signed rate confirmation and the signed BOL in one PDF.`
      : `The packet PDF could not be attached — reply to this message and we will resend it.`,
    ``,
    `Prepared with DispatchDeck.`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return deliver({ to: opts.to, subject, text, attachments });
}

/** Used by the settings screen to prove the mail path before a real send. */
export async function sendTestEmail(to: string, carrierName: string): Promise<SendOutcome> {
  return deliver({
    to,
    subject: `DispatchDeck test — ${carrierName}`,
    text: `This is the test message from ${carrierName}'s DispatchDeck account. If it reached you, invoice packets will too.`,
  });
}
