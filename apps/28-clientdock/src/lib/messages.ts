/**
 * Portal messages: threads the client can answer from their inbox.
 *
 * Each thread owns a unique reply address (`replyKey@INBOUND_EMAIL_DOMAIN`) that
 * goes out as `Reply-To` on every notification, so a client who never opens the
 * portal still lands in the record — README's "clients can just reply to email".
 * The inbound side is src/lib/inbound-email.ts.
 *
 * Scoped by `portalId` throughout, including the thread lookup: a thread id from
 * another portal resolves to null.
 */

import { randomBytes } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { messages, threads, type Message, type Thread, type Uploader } from "@/db/schema";
import { env } from "@/lib/env";
import { isUuid, touchPortal } from "@/lib/files";

export class MessageError extends Error {}

export interface ThreadWithMessages {
  thread: Thread;
  messages: Message[];
  lastMessage: Message | null;
}

/** Opaque, unguessable, and short enough to survive an email client's wrapping. */
function newReplyKey(): string {
  return `t${randomBytes(9).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

export function replyAddressFor(thread: Pick<Thread, "replyKey">): string {
  return `${thread.replyKey}@${env.inboundDomain}`;
}

export async function startThread(input: {
  portalId: string;
  subject: string;
  body: string;
  authorKind: Uploader;
  authorName: string;
  authorContactId?: string | null;
}): Promise<ThreadWithMessages> {
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject) throw new MessageError("Give the thread a subject");
  if (!body) throw new MessageError("Write something to send");

  const db = getDb();
  const [thread] = await db
    .insert(threads)
    .values({ portalId: input.portalId, subject: subject.slice(0, 200), replyKey: newReplyKey() })
    .returning();

  const message = await appendMessage({
    portalId: input.portalId,
    threadId: thread.id,
    body,
    authorKind: input.authorKind,
    authorName: input.authorName,
    authorContactId: input.authorContactId ?? null,
  });

  return { thread, messages: [message], lastMessage: message };
}

export async function appendMessage(input: {
  portalId: string;
  threadId: string;
  body: string;
  authorKind: Uploader;
  authorName: string;
  authorContactId?: string | null;
  viaEmail?: boolean;
}): Promise<Message> {
  const body = input.body.trim();
  if (!body) throw new MessageError("Write something to send");
  if (!isUuid(input.threadId)) throw new MessageError("That thread no longer exists");

  const db = getDb();
  // Scoped: the thread must belong to this portal.
  const [thread] = await db
    .select()
    .from(threads)
    .where(and(eq(threads.id, input.threadId), eq(threads.portalId, input.portalId)));
  if (!thread) throw new MessageError("That thread isn't in this portal");

  const [row] = await db
    .insert(messages)
    .values({
      threadId: thread.id,
      portalId: input.portalId,
      authorKind: input.authorKind,
      authorName: input.authorName.slice(0, 120),
      authorContactId: input.authorContactId ?? null,
      body: body.slice(0, 8000),
      viaEmail: input.viaEmail ?? false,
    })
    .returning();

  const now = new Date();
  await db.update(threads).set({ lastMessageAt: now }).where(eq(threads.id, thread.id));
  if (input.authorKind === "agency") await touchPortal(input.portalId);
  return row;
}

export async function listThreads(portalId: string): Promise<ThreadWithMessages[]> {
  const db = getDb();
  const threadRows = await db
    .select()
    .from(threads)
    .where(eq(threads.portalId, portalId))
    .orderBy(desc(threads.lastMessageAt));
  if (threadRows.length === 0) return [];

  const messageRows = await db
    .select()
    .from(messages)
    .where(eq(messages.portalId, portalId))
    .orderBy(asc(messages.createdAt));

  return threadRows.map((thread) => {
    const own = messageRows.filter((m) => m.threadId === thread.id);
    return { thread, messages: own, lastMessage: own[own.length - 1] ?? null };
  });
}

export async function getThreadScoped(
  portalId: string,
  threadId: string,
): Promise<ThreadWithMessages | null> {
  if (!isUuid(threadId)) return null;
  const db = getDb();
  const [thread] = await db
    .select()
    .from(threads)
    .where(and(eq(threads.id, threadId), eq(threads.portalId, portalId)));
  if (!thread) return null;
  const own = await db
    .select()
    .from(messages)
    .where(and(eq(messages.threadId, thread.id), eq(messages.portalId, portalId)))
    .orderBy(asc(messages.createdAt));
  return { thread, messages: own, lastMessage: own[own.length - 1] ?? null };
}

/** Threads whose last word came from the client — the agency owes a reply. */
export function threadsAwaitingAgency(list: ThreadWithMessages[]): ThreadWithMessages[] {
  return list.filter((t) => t.lastMessage?.authorKind === "client");
}
