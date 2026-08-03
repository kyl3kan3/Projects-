/**
 * POST /api/inbound/certificate — certificates that arrive by email.
 *
 * An agent's assistant will always email the COI to the address they have always
 * emailed it to. This is the endpoint a Resend inbound webhook (or any mail
 * forwarder) posts that message to, so those certificates land in the queue instead
 * of an inbox.
 *
 * Shape: verify the shared secret → find the vendor by the sender or the named
 * subject → store the PDF → enqueue the parse → ack. It refuses to run when
 * `INBOUND_PARSE_SECRET` is unset rather than defaulting to open: anything that can
 * write into a compliance file needs a credential.
 *
 * Matching is deliberately conservative. A message CertShield cannot attribute to a
 * vendor is **rejected with a reason** rather than filed against a guess — a
 * certificate on the wrong vendor's file is worse than one that bounced.
 */

import { NextResponse } from "next/server";
import { and, eq, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { vendors } from "@/db/schema";
import { intakeCertificate, parseCertificate, validatePdf } from "@/lib/certificates";
import { env } from "@/lib/env";
import { enqueue, QUEUES } from "@/lib/queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface InboundPayload {
  /** The sender's address, used to match a vendor or their agent. */
  from?: string;
  /** The address it was sent to. Its `+tag` identifies the receiving org. */
  to?: string;
  subject?: string;
  /** Base64 PDF attachments. */
  attachments?: Array<{ filename?: string; contentType?: string; content?: string }>;
}

function bearer(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  return req.headers.get("x-inbound-secret");
}

/** "Renee <renee@harborandmain.example>" → "renee@harborandmain.example" */
function addressOf(from: string): string | null {
  const angled = /<([^>]+)>/.exec(from);
  const raw = (angled?.[1] ?? from).trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw) ? raw : null;
}

/**
 * The receiving org, read from the address the mail was sent to:
 * `intake+<org-uuid>@…`. One agency represents vendors at several property
 * managers, so the sender alone is genuinely ambiguous — and a certificate filed
 * against the wrong org's vendor would be a cross-tenant leak, not a typo. The tag
 * is how the org is identified; the sender only chooses between that org's vendors.
 */
const ORG_TAG = /\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i;

function orgIdFromRecipient(to: string | undefined): string | null {
  if (!to) return null;
  return ORG_TAG.exec(to)?.[1]?.toLowerCase() ?? null;
}

export async function POST(req: Request): Promise<Response> {
  if (!env.inboundParseSecret) {
    return NextResponse.json({ error: "INBOUND_PARSE_SECRET is not set" }, { status: 503 });
  }
  if (bearer(req) !== env.inboundParseSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: InboundPayload;
  try {
    payload = (await req.json()) as InboundPayload;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const sender = payload.from ? addressOf(payload.from) : null;
  if (!sender) {
    return NextResponse.json(
      { error: "No usable sender address, so the certificate could not be attributed to a vendor." },
      { status: 422 },
    );
  }

  const pdf = (payload.attachments ?? []).find(
    (a) =>
      a.content &&
      (a.contentType === "application/pdf" || (a.filename ?? "").toLowerCase().endsWith(".pdf")),
  );
  if (!pdf?.content) {
    return NextResponse.json(
      { error: "That message had no PDF attachment." },
      { status: 422 },
    );
  }

  const bytes = Buffer.from(pdf.content, "base64");
  const invalid = validatePdf(bytes, pdf.filename);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  const db = getDb();
  const orgId = orgIdFromRecipient(payload.to);
  const senderMatch = or(
    sql`lower(${vendors.contactEmail}) = ${sender}`,
    sql`lower(${vendors.agentEmail}) = ${sender}`,
  );
  const matches = await db
    .select()
    .from(vendors)
    .where(
      orgId
        ? and(eq(vendors.orgId, orgId), eq(vendors.status, "active"), senderMatch)
        : and(eq(vendors.status, "active"), senderMatch),
    );

  // Within one org, an agency still often represents several vendors, so the
  // subject line has to name which one.
  let vendor = matches.length === 1 ? matches[0] : null;
  if (!vendor && matches.length > 1 && payload.subject) {
    const subject = payload.subject.toLowerCase();
    const named = matches.filter((v) => subject.includes(v.name.toLowerCase()));
    // Exactly one, or nothing. Without the org tag the same company name can exist
    // in more than one tenant, so anything less strict than "the subject names a
    // single vendor" means picking one — and picking wrong is a cross-tenant leak,
    // not a misfile. Everything else falls through to the 422 below, which tells the
    // sender which intake address to use.
    if (named.length === 1) vendor = named[0];
  }

  if (!vendor) {
    const orgCount = new Set(matches.map((v) => v.orgId)).size;
    return NextResponse.json(
      {
        error: matches.length
          ? orgId
            ? `${sender} is on file for ${matches.length} vendors at that company and the subject did not name one, so nothing was filed.`
            : `${sender} is on file for ${matches.length} vendors across ${orgCount} companies, and the message was not addressed to a company's intake address, so nothing was filed. Forward it to the intake address shown in that company's settings.`
          : `${sender} is not on file for any active vendor, so nothing was filed.`,
        candidates: orgId ? matches.map((v) => v.name) : [],
      },
      { status: 422 },
    );
  }

  const intake = await intakeCertificate({
    orgId: vendor.orgId,
    vendorId: vendor.id,
    bytes,
    source: "inbound",
    actor: `${sender} (inbound email)`,
    filename: pdf.filename,
  });

  if (intake.duplicate) {
    return NextResponse.json({
      ok: true,
      vendor: vendor.name,
      certificateId: intake.certificateId,
      duplicate: true,
    });
  }

  const queued = await enqueue(
    QUEUES.parseCertificate,
    { certificateId: intake.certificateId },
    { jobId: `parse:${intake.certificateId}` },
  );
  const outcome = queued ? null : await parseCertificate(intake.certificateId);

  return NextResponse.json({
    ok: true,
    vendor: vendor.name,
    certificateId: intake.certificateId,
    queued,
    status: outcome?.status ?? "queued",
  });
}
