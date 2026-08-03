/**
 * The job handlers, in one table.
 *
 * Kept apart from `lib/jobs.ts` so the queue does not import the pipeline (and so the
 * worker, the cron route and the browser-triggered drain all dispatch identically).
 */

import type { Job, JobKind } from "@/db/schema";
import { runExtraction } from "@/lib/documents";
import { recomputePeriod } from "@/lib/footprint";
import { classifySpendTail } from "@/lib/spend-import";
import type { JobHandler } from "@/lib/jobs";

export const HANDLERS: Record<JobKind, JobHandler> = {
  extract_document: async (job: Job) => {
    const documentId = job.payload.documentId;
    if (!documentId) throw new Error("extract_document job has no documentId");
    await runExtraction(documentId);
  },
  classify_spend: async (job: Job) => {
    const documentId = job.payload.documentId;
    if (!documentId) throw new Error("classify_spend job has no documentId");
    await classifySpendTail(documentId);
  },
  compute_footprint: async (job: Job) => {
    const periodId = job.payload.periodId;
    if (!periodId) throw new Error("compute_footprint job has no periodId");
    await recomputePeriod(periodId);
  },
};
