/**
 * Inbound email: every message forwarded to `docs+{slug}@in.ledgerlens.app` lands here.
 *
 * Verify, persist, enqueue, return 200 in under a second. No extraction inline — a
 * provider that does not get a fast 200 retries, and a retry storm on an endpoint that
 * calls a model is an expensive way to learn that.
 *
 * The status codes are deliberate:
 *  - **401** only for a failed or missing signature.
 *  - **200 and drop** for an unknown slug, a non-financial message, or an org over its
 *    hourly limit. A 404 on an unknown address turns this endpoint into an oracle for
 *    enumerating customers' forwarding addresses.
 *  - **500** only for a genuine transient failure, so the provider retries that and
 *    nothing else.
 */

import { after } from "next/server";
import { audit, SYSTEM } from "@/lib/audit";
import { extractDocument } from "@/lib/extract-run";
import {
  orgForSlug,
  overHourlyLimit,
  persistAndEnqueue,
  resolveOrgSlug,
  verifyInboundSignature,
  type InboundPayload,
} from "@/lib/inbound-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();

  const signature = verifyInboundSignature(request.headers, raw);
  if (!signature.ok) {
    // An unset secret is a refusal, not a bypass: an unauthenticated ingest endpoint is a
    // way to write into someone else's books.
    return Response.json({ error: signature.reason }, { status: 401 });
  }

  let payload: InboundPayload;
  try {
    const body = JSON.parse(raw) as InboundPayload & { data?: InboundPayload };
    // Providers wrap the message in an event envelope; both shapes are accepted.
    payload = body.data ?? body;
  } catch {
    return Response.json({ ok: true, dropped: "unparseable" });
  }

  const slug = resolveOrgSlug(payload);
  if (!slug) return Response.json({ ok: true, dropped: "no_matching_recipient" });

  const org = await orgForSlug(slug);
  if (!org) return Response.json({ ok: true, dropped: "unknown_slug" });

  if ((payload.spamScore ?? 0) >= 5) {
    await audit(org.id, SYSTEM, "email.dropped", null, { reason: "spam", from: payload.from });
    return Response.json({ ok: true, dropped: "spam" });
  }

  if (await overHourlyLimit(org.id)) {
    await audit(org.id, SYSTEM, "email.dropped", null, { reason: "rate_limited" });
    return Response.json({ ok: true, dropped: "rate_limited" });
  }

  try {
    const result = await persistAndEnqueue(org, payload);
    if (result.skipped.length > 0) {
      await audit(org.id, SYSTEM, "email.attachments_skipped", null, { skipped: result.skipped });
    }
    if (result.ingested.length === 0) {
      await audit(org.id, SYSTEM, "email.dropped", null, {
        reason: "nothing_financial",
        from: payload.from,
        subject: payload.subject,
      });
      return Response.json({ ok: true, dropped: "nothing_financial" });
    }

    const toExtract = result.ingested.filter((r) => r.needsExtraction).map((r) => r.documentId);
    after(async () => {
      for (const documentId of toExtract) {
        try {
          await extractDocument(documentId);
        } catch (err) {
          console.error("[inbound-email] extraction failed", documentId, err);
        }
      }
    });

    return Response.json({
      ok: true,
      documents: result.ingested.length,
      duplicates: result.duplicates,
      queued: toExtract.length,
    });
  } catch (err) {
    // A 500 is a request to retry, so it is reserved for failures a retry could fix.
    console.error("[inbound-email] persist failed", err);
    return Response.json({ error: "transient" }, { status: 500 });
  }
}
