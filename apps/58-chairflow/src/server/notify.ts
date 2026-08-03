/**
 * src/server/notify.ts
 *
 * Every outbound comm goes through `sendMessage`: confirmations, 48h/2h reminders,
 * rebooking nudges, waitlist offers, fee receipts, cancellation notices.
 *
 * Three rules are enforced here rather than at call sites, because a rule that lives
 * at call sites is a rule that gets forgotten at the seventh one:
 *
 *  1. **Consent.** SMS needs `sms_consent` captured at booking and no
 *     `sms_opted_out_at`. Email needs an address. A client with neither is not
 *     reachable, and the caller is told so instead of the message vanishing.
 *  2. **One row per (appointment, kind, channel).** The database's unique index does
 *     this, not a memory of having sent it — which is what stops a sweep re-sending
 *     the same 48h reminder every time it runs.
 *  3. **Recorded, not pretended.** With no provider configured the row is written,
 *     the body is stored verbatim, and `simulated` is set. The message ledger shows
 *     "recorded, not sent" for those, because a stylist believing a reminder went out
 *     when it did not is worse than knowing it did not.
 *
 * Transactional messages about a booking a client made are not marketing: a
 * confirmation and a reminder go by SMS on the consent given at booking. A *nudge* is
 * a different thing and passes the cadence engine's own gate first.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, messages, type Appointment, type Client, type Stylist } from "@/db/schema";
import { emailConfigured, env, smsConfigured } from "@/lib/env";
import { formatWhen } from "@/lib/dates";
import { money, moneyShort } from "@/lib/format";

export type MessageKind =
  | "confirmation"
  | "reminder_48h"
  | "reminder_2h"
  | "nudge"
  | "waitlist_offer"
  | "receipt"
  | "cancellation";

export type Channel = "sms" | "email";

export interface SendInput {
  stylistId: string;
  clientId: string;
  appointmentId?: string | null;
  kind: MessageKind;
  /** Which channels to try, in order. Consent decides what actually goes. */
  channels?: Channel[];
  subject: string;
  body: string;
}

export type SendOutcome =
  | { sent: true; channel: Channel; messageId: string; simulated: boolean }
  | { sent: false; reason: "duplicate" | "no_channel" | "opted_out" | "provider_failed"; detail: string };

/**
 * Send one message on the best available channel.
 *
 * SMS first when it is allowed — this is a trade that lives in text messages — and
 * email as the fallback. Only one channel is used per message: a client who gets the
 * same reminder twice, once per channel, learns to ignore both.
 */
export async function sendMessage(input: SendInput): Promise<SendOutcome> {
  const db = getDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, input.clientId));
  if (!client) return { sent: false, reason: "no_channel", detail: "No such client." };

  const wanted = input.channels ?? ["sms", "email"];
  const smsUsable = Boolean(client.phone) && client.smsConsent && !client.smsOptedOutAt;
  const emailUsable = Boolean(client.email);

  const channel = wanted.find((c) => (c === "sms" ? smsUsable : emailUsable));
  if (!channel) {
    if (client.phone && client.smsOptedOutAt) {
      return { sent: false, reason: "opted_out", detail: "This client replied STOP." };
    }
    return {
      sent: false,
      reason: "no_channel",
      detail: client.email
        ? "No SMS consent on file."
        : "No SMS consent and no email address on file.",
    };
  }

  // The row goes in first, so the unique index — not our memory — is what makes this
  // idempotent. A duplicate insert is the signal that this message already went.
  const inserted = await db
    .insert(messages)
    .values({
      stylistId: input.stylistId,
      clientId: input.clientId,
      appointmentId: input.appointmentId ?? null,
      kind: input.kind,
      channel,
      body: input.body,
      status: "queued",
    })
    .onConflictDoNothing()
    .returning({ id: messages.id });

  const row = inserted[0];
  if (!row) {
    return { sent: false, reason: "duplicate", detail: `${input.kind} already sent on ${channel}.` };
  }

  const dispatch =
    channel === "sms"
      ? await sendSms(client.phone, input.body)
      : await sendEmail(client.email ?? "", input.subject, input.body);

  await db
    .update(messages)
    .set({
      status: dispatch.ok ? "sent" : "failed",
      providerMessageId: dispatch.ok ? dispatch.providerMessageId : null,
      failureReason: dispatch.ok ? null : dispatch.message,
      simulated: dispatch.simulated,
    })
    .where(eq(messages.id, row.id));

  if (!dispatch.ok) {
    return { sent: false, reason: "provider_failed", detail: dispatch.message };
  }
  return { sent: true, channel, messageId: row.id, simulated: dispatch.simulated };
}

type Dispatch =
  | { ok: true; providerMessageId: string; simulated: boolean }
  | { ok: false; message: string; simulated: boolean };

async function sendSms(to: string, body: string): Promise<Dispatch> {
  if (!smsConfigured()) {
    console.log(`[notify] sms recorded, not sent: to=${maskPhone(to)} chars=${body.length}`);
    return { ok: true, providerMessageId: `sim_${Date.now()}`, simulated: true };
  }
  try {
    // Imported lazily so a deployment with no SMS provider never loads the SDK.
    const { default: twilio } = await import("twilio");
    const client = twilio(env.twilio.accountSid, env.twilio.authToken);
    const message = await client.messages.create({
      to,
      from: env.twilio.fromNumber,
      body,
      statusCallback: `${env.appUrl}/api/webhooks/twilio`,
    });
    return { ok: true, providerMessageId: message.sid, simulated: false };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Twilio rejected the message.",
      simulated: false,
    };
  }
}

async function sendEmail(to: string, subject: string, body: string): Promise<Dispatch> {
  if (!to) return { ok: false, message: "No email address.", simulated: !emailConfigured() };
  if (!emailConfigured()) {
    console.log(`[notify] email recorded, not sent: to=${maskEmail(to)} subject="${subject}"`);
    return { ok: true, providerMessageId: `sim_${Date.now()}`, simulated: true };
  }
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(env.resendApiKey);
    const result = await resend.emails.send({
      from: env.emailFrom,
      to,
      subject,
      text: body,
    });
    if (result.error) return { ok: false, message: result.error.message, simulated: false };
    return { ok: true, providerMessageId: result.data?.id ?? "", simulated: false };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Resend rejected the message.",
      simulated: false,
    };
  }
}

function maskPhone(phone: string): string {
  return phone.length > 4 ? `***${phone.slice(-4)}` : "***";
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  return `${user.slice(0, 1)}***@${domain}`;
}

/* ------------------------------------------------------------------ */
/* Templates — plain, policy-quoting, no marketing voice               */
/* ------------------------------------------------------------------ */

export interface TemplateContext {
  stylist: Pick<Stylist, "displayName" | "handle" | "timezone" | "chairLocation">;
  client: Pick<Client, "firstName">;
  appointment?: Pick<Appointment, "startsAt" | "priceCents" | "depositCents">;
  serviceName?: string;
  manageUrl?: string;
  policySummary?: string;
}

export function confirmationBody(ctx: TemplateContext): { subject: string; body: string } {
  const when = ctx.appointment
    ? formatWhen(ctx.stylist.timezone, ctx.appointment.startsAt)
    : "your appointment";
  const lines = [
    `${ctx.client.firstName} — you're booked with ${ctx.stylist.displayName}.`,
    "",
    `${ctx.serviceName ?? "Appointment"} · ${when}`,
  ];
  if (ctx.stylist.chairLocation) lines.push(ctx.stylist.chairLocation);
  if (ctx.appointment && ctx.appointment.depositCents > 0) {
    lines.push(
      `Deposit paid: ${money(ctx.appointment.depositCents)} (applied to your service).`,
    );
  }
  if (ctx.policySummary) {
    lines.push("", `The policy you agreed to: ${ctx.policySummary}`);
  }
  if (ctx.manageUrl) {
    lines.push("", `Reschedule or cancel: ${ctx.manageUrl}`);
  }
  lines.push("", "Reply STOP to stop texts.");
  return {
    subject: `Booked: ${ctx.serviceName ?? "your appointment"} · ${when}`,
    body: lines.join("\n"),
  };
}

export function reminderBody(
  ctx: TemplateContext,
  kind: "reminder_48h" | "reminder_2h",
): { subject: string; body: string } {
  const when = ctx.appointment
    ? formatWhen(ctx.stylist.timezone, ctx.appointment.startsAt)
    : "soon";
  const lead = kind === "reminder_48h" ? "in two days" : "in about two hours";
  const lines = [
    `${ctx.client.firstName} — ${ctx.serviceName ?? "your appointment"} with ${ctx.stylist.displayName} is ${lead}.`,
    "",
    when,
  ];
  if (ctx.stylist.chairLocation) lines.push(ctx.stylist.chairLocation);
  if (ctx.manageUrl) {
    lines.push("", `Need to change it? ${ctx.manageUrl}`);
  }
  if (ctx.policySummary && kind === "reminder_48h") {
    lines.push("", ctx.policySummary);
  }
  lines.push("", "Reply STOP to stop texts.");
  return { subject: `Reminder: ${ctx.serviceName ?? "appointment"} ${when}`, body: lines.join("\n") };
}

export function nudgeBody(input: {
  stylist: Pick<Stylist, "displayName">;
  client: Pick<Client, "firstName">;
  serviceName: string;
  weeksSince: number;
  bookingUrl: string;
}): { subject: string; body: string } {
  const gap =
    input.weeksSince >= 2 ? `It's been ${input.weeksSince} weeks` : "It's been a while";
  return {
    subject: `${gap} — book your ${input.serviceName.toLowerCase()}?`,
    body: [
      `${input.client.firstName} — ${gap} since your ${input.serviceName.toLowerCase()} with ${input.stylist.displayName}.`,
      "",
      `Pick a time: ${input.bookingUrl}`,
      "",
      "Reply STOP to stop texts.",
    ].join("\n"),
  };
}

export function waitlistOfferBody(input: {
  stylist: Pick<Stylist, "displayName" | "timezone">;
  client: Pick<Client, "firstName">;
  serviceName: string;
  startsAt: Date;
  claimUrl: string;
  expiresInMinutes: number;
}): { subject: string; body: string } {
  const when = formatWhen(input.stylist.timezone, input.startsAt);
  return {
    subject: `A ${input.serviceName.toLowerCase()} opened up: ${when}`,
    body: [
      `${input.client.firstName} — ${when} just opened up with ${input.stylist.displayName}.`,
      "",
      `First tap gets it: ${input.claimUrl}`,
      `This offer expires in ${input.expiresInMinutes} minutes.`,
      "",
      "Reply STOP to stop texts.",
    ].join("\n"),
  };
}

/**
 * The fee receipt. It quotes the policy text the client agreed to, verbatim, because
 * that sentence is the entire point: the charge is not the stylist's decision, it is
 * the policy the client accepted at booking.
 */
export function feeReceiptBody(input: {
  stylist: Pick<Stylist, "displayName" | "timezone">;
  client: Pick<Client, "firstName">;
  serviceName: string;
  startsAt: Date;
  kindLabel: string;
  priceCents: number;
  percent: number;
  feeCents: number;
  depositAppliedCents: number;
  chargedCents: number;
  policyText: string;
  policyAgreedAt: Date;
}): { subject: string; body: string } {
  const when = formatWhen(input.stylist.timezone, input.startsAt);
  const lines = [
    `${input.client.firstName} — a ${input.kindLabel} was charged for ${input.serviceName} on ${when}.`,
    "",
    `${input.serviceName} ${moneyShort(input.priceCents)}`,
    `${input.kindLabel} at ${input.percent}%: ${money(input.feeCents)}`,
  ];
  if (input.depositAppliedCents > 0) {
    lines.push(`Deposit applied: -${money(input.depositAppliedCents)}`);
  }
  lines.push(`Charged: ${money(input.chargedCents)}`);
  lines.push(
    "",
    `This is the policy you agreed to when you booked, on ${input.policyAgreedAt.toISOString().slice(0, 10)}:`,
    "",
    input.policyText,
  );
  return { subject: `${input.kindLabel} receipt · ${money(input.chargedCents)}`, body: lines.join("\n") };
}

export function cancellationBody(input: {
  stylist: Pick<Stylist, "displayName" | "timezone">;
  client: Pick<Client, "firstName">;
  serviceName: string;
  startsAt: Date;
  feeNote: string | null;
  bookingUrl: string;
}): { subject: string; body: string } {
  const when = formatWhen(input.stylist.timezone, input.startsAt);
  const lines = [
    `${input.client.firstName} — your ${input.serviceName.toLowerCase()} on ${when} is cancelled.`,
  ];
  if (input.feeNote) lines.push("", input.feeNote);
  lines.push("", `Book again any time: ${input.bookingUrl}`);
  return { subject: `Cancelled: ${input.serviceName} · ${when}`, body: lines.join("\n") };
}

/**
 * Global STOP. One phone number can appear in several stylists' books — a client who
 * sees two barbers in the same shop — and STOP means every one of them.
 */
export async function optOutPhone(phone: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .update(clients)
    .set({ smsOptedOutAt: new Date(), smsConsent: false, updatedAt: new Date() })
    .where(and(eq(clients.phone, phone)))
    .returning({ id: clients.id });
  return rows.length;
}

/** START re-opts in. Consent returns; the opt-out timestamp is cleared. */
export async function optInPhone(phone: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .update(clients)
    .set({ smsOptedOutAt: null, smsConsent: true, updatedAt: new Date() })
    .where(eq(clients.phone, phone))
    .returning({ id: clients.id });
  return rows.length;
}
