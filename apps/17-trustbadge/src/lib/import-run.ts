/**
 * Running an import against the database.
 *
 * Split from import.ts so the parsing and mapping stay pure and testable without
 * a database. This half is the part that touches Postgres: insert what parsed,
 * skip what is already there, and record the outcome on the job so a merchant can
 * see exactly which rows did not make it.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { importJobs, reviewMedia, reviews, type ImportJob } from "@/db/schema";
import { PlanLimitError } from "@/lib/errors";
import { featureAllowed, tierUnlocking } from "@/lib/plans";
import { parseReviewFile, toReviewRow } from "@/lib/import";
import type { Tier } from "@/db/schema";
import { safeUrl } from "@/widget/escape";

export interface ImportResult {
  job: ImportJob;
  imported: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

/**
 * Import a review export file.
 *
 * Photos referenced by an import are stored as their remote URL rather than
 * copied into R2 at MVP: copying is a background job with its own retry story,
 * and a link that works is better than a job that half-runs. The URL is
 * scheme-checked with the same allow-list the widget uses.
 */
export async function runImport(args: {
  storeId: string;
  tier: Tier;
  fileName: string;
  text: string;
}): Promise<ImportResult> {
  if (!featureAllowed(args.tier, "imports")) {
    const needed = tierUnlocking("imports");
    throw new PlanLimitError("Review imports are a Growth feature.", needed);
  }

  const preview = parseReviewFile(args.text);
  const db = getDb();

  const [job] = await db
    .insert(importJobs)
    .values({
      storeId: args.storeId,
      source: preview.source,
      fileName: args.fileName.slice(0, 200),
      status: "running",
      totalRows: preview.rows.length + preview.errors.length,
      errorLog: preview.errors.slice(0, 200),
    })
    .returning();

  let imported = 0;
  let skipped = 0;
  const errors = [...preview.errors];

  for (const [i, parsed] of preview.rows.entries()) {
    const row = toReviewRow(args.storeId, preview.source, parsed);
    try {
      const [inserted] = await db
        .insert(reviews)
        .values(row)
        // The unique (store, dedupe_hash) index makes a repeated import a no-op
        // rather than a duplicate wall of reviews.
        .onConflictDoNothing({ target: [reviews.storeId, reviews.dedupeHash] })
        .returning();

      if (!inserted) {
        skipped++;
        continue;
      }
      imported++;

      const photo = safeUrl(parsed.photoUrl);
      if (photo) {
        await db.insert(reviewMedia).values({
          reviewId: inserted.id,
          kind: "photo",
          storageKey: null,
          data: null,
          contentType: "image/jpeg",
          // Dimensions are unknown for a remote photo. 1:1 is what the wall lays
          // out anyway, so the reservation stays honest.
          width: 1000,
          height: 1000,
          bytes: 0,
          moderationStatus: "pending",
        });
      }
    } catch (err) {
      errors.push({
        row: i + 2,
        reason: err instanceof Error ? err.message.slice(0, 200) : "could not import",
      });
    }
  }

  const [finished] = await db
    .update(importJobs)
    .set({
      status: errors.length && !imported ? "failed" : "complete",
      importedRows: imported,
      skippedRows: skipped,
      errorLog: errors.slice(0, 200),
      finishedAt: new Date(),
    })
    .where(eq(importJobs.id, job.id))
    .returning();

  return { job: finished, imported, skipped, errors };
}

export async function listImportJobs(storeId: string, limit = 10): Promise<ImportJob[]> {
  const db = getDb();
  return db
    .select()
    .from(importJobs)
    .where(eq(importJobs.storeId, storeId))
    .orderBy(desc(importJobs.createdAt))
    .limit(limit);
}

/** Approve everything an import brought in — the "looks right, publish it" action. */
export async function approveImported(storeId: string, jobId: string): Promise<number> {
  const db = getDb();
  const [job] = await db
    .select()
    .from(importJobs)
    .where(and(eq(importJobs.id, jobId), eq(importJobs.storeId, storeId)));
  if (!job) return 0;

  const updated = await db
    .update(reviews)
    .set({ status: "approved", publishedAt: new Date() })
    .where(
      and(eq(reviews.storeId, storeId), eq(reviews.source, job.source), eq(reviews.status, "pending")),
    )
    .returning({ id: reviews.id });

  for (const row of updated) {
    await db
      .update(reviewMedia)
      .set({ moderationStatus: "approved" })
      .where(eq(reviewMedia.reviewId, row.id));
  }
  return updated.length;
}
