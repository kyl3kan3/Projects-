/**
 * Email-reply threading (ARCHITECTURE.md flow 3).
 *
 * Every thread owns a unique reply address, `<replyKey>@INBOUND_EMAIL_DOMAIN`,
 * which goes out as `Reply-To`. An inbound webhook posts the reply here and it
 * lands in the thread — a client can live entirely in email while the portal stays
 * the record.
 *
 * The parsing is provider-shaped but provider-agnostic: Resend, Postmark and
 * SendGrid all hand over some flavour of {to, from, subject, text}, so
 * `parseInboundPayload` normalises the shapes we know and `resolveThreadKey`
 * pulls the key out of any of the recipient headers.
 *
 * Authorisation is the reply key itself plus the sender's address: a message is
 * only appended when the From address matches a contact who actually has access to
 * that thread's portal. An unknown sender is dropped, not attributed — otherwise
 * anybody who learned a reply address could post as the client.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contacts, portals, threads, type Contact, type Thread } from "@/db/schema";
import { appendMessage } from "@/lib/messages";
import { notifyMessageToAgency } from "@/lib/notify";
import { workspaceForPortal } from "@/lib/notify";

export class InboundEmailError extends Error {}

export interface InboundEmail {
  to: string[];
  from: string;
  subject: string;
  text: string;
}

/** `"Sam Okafor <sam@meridian.coffee>"` -> `"sam@meridian.coffee"`. */
export function extractAddress(input: string): string {
  const angled = /<([^>]+)>/.exec(input);
  const raw = (angled ? angled[1] : input).trim().toLowerCase();
  return raw.replace(/^mailto:/, "");
}

function asArray(value: unknown): string[] {
  if (typeof value === "string") return value.split(",").map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(value)) {
    return value
      .map((v) =>
        typeof v === "string"
          ? v
          : typeof v === "object" && v && "email" in v
            ? String((v as { email: unknown }).email)
            : "",
      )
      .filter(Boolean);
  }
  if (typeof value === "object" && value && "email" in value) {
    return [String((value as { email: unknown }).email)];
  }
  return [];
}

/** Normalise the shapes the three providers we might use actually send. */
export function parseInboundPayload(payload: unknown): InboundEmail {
  if (!payload || typeof payload !== "object") throw new InboundEmailError("Empty payload");
  const p = payload as Record<string, unknown>;
  // Resend wraps the message in `data`; Postmark and SendGrid post it flat.
  const body = (p.data && typeof p.data === "object" ? (p.data as Record<string, unknown>) : p);

  const to = [
    ...asArray(body.to),
    ...asArray(body.To),
    ...asArray(body.recipient),
    ...asArray(body.OriginalRecipient),
    ...asArray(body.envelope_to),
  ].map(extractAddress);

  const fromRaw = body.from ?? body.From ?? body.sender ?? "";
  const from = extractAddress(String(fromRaw));

  const subject = String(body.subject ?? body.Subject ?? "").slice(0, 200);
  const text = String(body.text ?? body.TextBody ?? body.plain ?? body.body ?? "");

  if (!from) throw new InboundEmailError("No sender on that message");
  if (to.length === 0) throw new InboundEmailError("No recipient on that message");
  return { to, from, subject, text };
}

/** Find the thread reply key among the recipients, for our inbound domain. */
export function resolveThreadKey(to: string[], inboundDomain: string): string | null {
  const domain = inboundDomain.toLowerCase();
  for (const address of to) {
    const [local, host] = address.split("@");
    if (!local || !host) continue;
    if (host.toLowerCase() !== domain) continue;
    if (/^[a-z0-9]{4,40}$/.test(local)) return local;
  }
  return null;
}

/**
 * Strip the quoted history most clients append. Anything from the first quote
 * marker onward is dropped, so a thread doesn't grow a copy of itself each reply.
 */
export function stripQuotedReply(text: string): string {
  const markers = [
    /^\s*On .+ wrote:\s*$/im,
    /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im,
    /^\s*From:\s.+$/im,
    /^\s*>{1,}\s?/m,
  ];
  let cut = text.length;
  for (const marker of markers) {
    const match = marker.exec(text);
    if (match && match.index < cut) cut = match.index;
  }
  return text.slice(0, cut).replace(/\s+$/, "").trim();
}

export interface InboundResult {
  status: "appended" | "unknown_thread" | "unknown_sender" | "empty";
  threadId?: string;
  messageId?: string;
}

/**
 * Handle one inbound reply. Never throws for ordinary "not for us" cases — a
 * webhook that 500s gets retried forever by the provider.
 */
export async function handleInboundEmail(
  email: InboundEmail,
  inboundDomain: string,
): Promise<InboundResult> {
  const key = resolveThreadKey(email.to, inboundDomain);
  if (!key) return { status: "unknown_thread" };

  const db = getDb();
  const [thread] = await db.select().from(threads).where(eq(threads.replyKey, key));
  if (!thread) return { status: "unknown_thread" };

  const [portal] = await db.select().from(portals).where(eq(portals.id, thread.portalId));
  if (!portal || !portal.clientId || portal.status === "archived") {
    return { status: "unknown_thread" };
  }

  // The sender has to be a contact of *this portal's* client. The reply key alone
  // is not authorisation: a forwarded email would otherwise let a stranger post.
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.clientId, portal.clientId), eq(contacts.email, email.from)));
  if (!contact) return { status: "unknown_sender" };

  const body = stripQuotedReply(email.text);
  if (!body) return { status: "empty" };

  const message = await appendMessage({
    portalId: thread.portalId,
    threadId: thread.id,
    body,
    authorKind: "client",
    authorName: contact.name,
    authorContactId: contact.id,
    viaEmail: true,
  });

  await notifyAgencyOfInbound(thread, contact, message.id, body);
  return { status: "appended", threadId: thread.id, messageId: message.id };
}

async function notifyAgencyOfInbound(
  thread: Thread,
  contact: Contact,
  messageId: string,
  body: string,
): Promise<void> {
  const workspace = await workspaceForPortal(thread.portalId);
  if (!workspace) return;
  const db = getDb();
  const [portal] = await db.select().from(portals).where(eq(portals.id, thread.portalId));
  if (!portal) return;
  await notifyMessageToAgency({
    workspace,
    portal,
    thread,
    messageId,
    authorName: contact.name,
    body,
  });
}
