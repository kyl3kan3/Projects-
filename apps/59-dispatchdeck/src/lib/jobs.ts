/**
 * src/lib/jobs.ts
 *
 * Every background job in ARCHITECTURE.md's queue table, as plain async
 * functions with typed payloads. Nothing here knows about BullMQ.
 *
 * That separation is what lets the same code run three ways without a fork:
 * consumed by the worker process against Redis, run inline when no Redis is
 * configured, and driven directly by the cron route on a platform with no
 * always-on process. The handler is the single definition of what the job does.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, rateConDrafts } from "@/db/schema";
import { processStripeEvent } from "@/lib/billing";
import { sweepDetention } from "@/lib/detention";
import { buildPacket } from "@/lib/packets";
import { getExtractor } from "@/lib/parse";
import { rollupBrokerStats, sendInvoice } from "@/lib/invoicing";
import { getObject } from "@/lib/storage";

export interface JobPayloads {
  "parse-rate-con": { carrierId: string; documentId: string; text?: string | null };
  "render-packet": { carrierId: string; invoiceId: string; actor: string };
  "detention-tick": { carrierId?: string; deadline?: number };
  "send-invoice": { carrierId: string; invoiceId: string; actor: string; to?: string };
  "rollup-broker-stats": { carrierId?: string };
  "process-stripe-event": { webhookEventId: string };
}

export type JobName = keyof JobPayloads;

export const JOB_NAMES: JobName[] = [
  "parse-rate-con",
  "render-packet",
  "detention-tick",
  "send-invoice",
  "rollup-broker-stats",
  "process-stripe-event",
];

export const handlers: {
  [K in JobName]: (payload: JobPayloads[K]) => Promise<unknown>;
} = {
  "parse-rate-con": parseRateConJob,
  "render-packet": async (payload) => buildPacket(payload),
  "detention-tick": async (payload) =>
    sweepDetention({ carrierId: payload.carrierId, deadline: payload.deadline }),
  "send-invoice": async (payload) => sendInvoice(payload),
  "rollup-broker-stats": async (payload) => rollupBrokerStats(payload.carrierId),
  "process-stripe-event": async (payload) => processStripeEvent(payload.webhookEventId),
};

export async function runJob<K extends JobName>(name: K, payload: JobPayloads[K]): Promise<unknown> {
  return handlers[name](payload);
}

/**
 * Extract a rate confirmation into a reviewable draft.
 *
 * The draft row is written whether the parse succeeds or fails: a failure is a
 * draft with confidence 0 and a sentence saying what went wrong, which is what
 * the review screen shows beside the document that did land. That is the whole
 * of the parse-honesty rule — the document is never lost and the app never
 * pretends it read something it did not.
 */
async function parseRateConJob(payload: JobPayloads["parse-rate-con"]) {
  const db = getDb();
  const [document] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, payload.documentId), eq(documents.carrierId, payload.carrierId)));
  if (!document) throw new Error(`No document ${payload.documentId} on carrier ${payload.carrierId}`);

  const bytes = document.contentType === "application/pdf" ? await getObject(document.r2Key) : null;
  const extractor = getExtractor();
  const outcome = await extractor.extract({
    pdf: bytes,
    text: payload.text ?? null,
    filename: document.filename,
  });

  const values =
    outcome.ok === true
      ? { extracted: outcome.extracted, confidence: outcome.confidence }
      : {
          extracted: {
            references: [],
            stops: [],
            fieldConfidence: {},
            source: outcome.source,
            failureReason: outcome.reason,
          },
          confidence: 0,
        };

  const [draft] = await db
    .insert(rateConDrafts)
    .values({
      carrierId: payload.carrierId,
      documentId: document.id,
      extracted: values.extracted,
      confidence: values.confidence,
      status: "pending",
    })
    // One draft per document: a retried job refreshes the draft rather than
    // stacking a second one beside it.
    .onConflictDoUpdate({
      target: rateConDrafts.documentId,
      set: { extracted: values.extracted, confidence: values.confidence, updatedAt: new Date() },
    })
    .returning({ id: rateConDrafts.id, confidence: rateConDrafts.confidence });

  if (document.contentType === "application/pdf" && bytes && document.pages === null) {
    const { extractPdfText } = await import("@/lib/pdf-text");
    const pages = extractPdfText(bytes).pageCount;
    if (pages > 0) {
      await db.update(documents).set({ pages }).where(eq(documents.id, document.id));
    }
  }

  return { draftId: draft.id, confidence: draft.confidence, ok: outcome.ok };
}
