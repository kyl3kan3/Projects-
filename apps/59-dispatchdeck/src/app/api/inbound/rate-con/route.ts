/**
 * POST /api/inbound/rate-con?secret=…
 *
 * The forward-the-rate-con intake. Resend's inbound webhook posts the parsed
 * MIME here when a carrier forwards a broker email to
 * `loads+{slug}@mail.dispatchdeck.app`.
 *
 * Webhook law, same as Stripe's: authenticate → persist idempotently → enqueue
 * → ack. The handler never parses inline; a 30-second Claude call inside a
 * webhook is a webhook that times out and gets retried for ever.
 *
 * Refuses to run when INBOUND_PARSE_SECRET is unset rather than defaulting to
 * open — an unauthenticated endpoint that writes documents and spends model
 * tokens is the most expensive thing to leave ajar.
 */

import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { carriers, documents } from "@/db/schema";
import { env, features } from "@/lib/env";
import { documentFilename, isoDayIn } from "@/lib/format";
import { enqueue } from "@/lib/queue";
import { isAllowedContentType, maxBytesFor, objectKey, putObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

const AttachmentSchema = z.object({
  filename: z.string().max(200).optional(),
  contentType: z.string().max(120).optional(),
  content_type: z.string().max(120).optional(),
  /** base64, which is how Resend delivers attachment bytes. */
  content: z.string().optional(),
});

const PayloadSchema = z.object({
  to: z.union([z.string(), z.array(z.string())]).optional(),
  from: z.union([z.string(), z.array(z.string())]).optional(),
  subject: z.string().max(500).optional(),
  text: z.string().optional(),
  html: z.string().optional(),
  attachments: z.array(AttachmentSchema).max(10).optional(),
});

export async function POST(request: Request): Promise<Response> {
  if (!features.inbound) {
    return NextResponse.json(
      { error: "Inbound parsing is not configured on this deployment." },
      { status: 503 },
    );
  }

  const given = new URL(request.url).searchParams.get("secret") ?? "";
  if (!constantTimeEqual(given, env.inboundParseSecret)) {
    return NextResponse.json({ error: "No." }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400 });
  }
  const parsed = PayloadSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Unrecognised payload." }, { status: 400 });
  const payload = parsed.data;

  const slug = slugFromRecipients(payload.to);
  if (!slug) {
    // Politely ack: a bounce loop with an email provider is worse than a
    // silently dropped message, and there is nothing to retry.
    return NextResponse.json({ ok: true, ignored: "no parse address in the recipients" });
  }

  const db = getDb();
  const [carrier] = await db.select().from(carriers).where(eq(carriers.slug, slug));
  if (!carrier) {
    return NextResponse.json({ ok: true, ignored: `no carrier for parse address ${slug}` });
  }

  const pdfs = (payload.attachments ?? []).filter((a) => {
    const type = a.contentType ?? a.content_type ?? "";
    return type === "application/pdf" || (a.filename ?? "").toLowerCase().endsWith(".pdf");
  });

  const bodyText = [payload.subject, payload.text ?? stripHtml(payload.html ?? "")]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 40_000);

  const created: string[] = [];
  const day = isoDayIn(new Date(), carrier.timezone);

  for (const attachment of pdfs.slice(0, 5)) {
    if (!attachment.content) continue;
    const bytes = Buffer.from(attachment.content, "base64");
    if (bytes.byteLength === 0) continue;
    if (bytes.byteLength > maxBytesFor("application/pdf")) continue;
    if (!isAllowedContentType("application/pdf")) continue;

    // Idempotency: the same attachment forwarded twice writes one document.
    const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
    const key = `${carrier.id}/misc/inbound-${digest}.pdf`;
    const [existing] = await db.select({ id: documents.id }).from(documents).where(eq(documents.r2Key, key));
    if (existing) {
      created.push(existing.id);
      continue;
    }

    await putObject(key, new Uint8Array(bytes), "application/pdf");
    const filename =
      attachment.filename?.replace(/[^A-Za-z0-9._-]+/g, "-") ??
      documentFilename("rate_con", { reference: null, contentType: "application/pdf", day });

    const [document] = await db
      .insert(documents)
      .values({
        carrierId: carrier.id,
        kind: "rate_con",
        r2Key: key,
        filename,
        contentType: "application/pdf",
        sizeBytes: bytes.byteLength,
      })
      .returning({ id: documents.id });
    created.push(document.id);
    await enqueue("parse-rate-con", {
      carrierId: carrier.id,
      documentId: document.id,
      text: bodyText,
    });
  }

  // A forwarded email with the rate in the body and no PDF still builds a draft:
  // some brokers send the confirmation as plain text.
  if (created.length === 0 && bodyText.trim().length > 120) {
    const key = `${carrier.id}/misc/inbound-${createHash("sha256").update(bodyText).digest("hex").slice(0, 32)}.txt`;
    const [existing] = await db.select({ id: documents.id }).from(documents).where(eq(documents.r2Key, key));
    if (!existing) {
      await putObject(key, new TextEncoder().encode(bodyText), "text/plain");
      const [document] = await db
        .insert(documents)
        .values({
          carrierId: carrier.id,
          kind: "rate_con",
          r2Key: key,
          filename: `RATECON_EMAIL_${day}.txt`,
          contentType: "text/plain",
          sizeBytes: Buffer.byteLength(bodyText),
        })
        .returning({ id: documents.id });
      created.push(document.id);
      await enqueue("parse-rate-con", {
        carrierId: carrier.id,
        documentId: document.id,
        text: bodyText,
      });
    }
  }

  return NextResponse.json({ ok: true, carrier: carrier.slug, documents: created.length });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (!b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** loads+bishop-hauling@… → "bishop-hauling" */
export function slugFromRecipients(to: string | string[] | undefined): string | null {
  const list = Array.isArray(to) ? to : to ? [to] : [];
  for (const entry of list) {
    // Handles "Name <loads+slug@host>" as well as a bare address.
    const address = /<([^>]+)>/.exec(entry)?.[1] ?? entry;
    const m = /^loads\+([a-z0-9-]{1,40})@/i.exec(address.trim());
    if (m) return m[1].toLowerCase();
  }
  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n");
}
