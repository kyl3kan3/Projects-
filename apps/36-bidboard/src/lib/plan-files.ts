/**
 * Plan and spec hosting.
 *
 * Two rules that come straight out of how bids go wrong:
 *
 *  - **A new version never overwrites an old one.** A sub may have priced against
 *    the old set, and when the numbers are argued over the record has to show which
 *    drawings they had. Uploading a new version marks the previous one superseded
 *    and keeps it downloadable.
 *  - **One link per package.** A file attached to a package is only visible to that
 *    package's bidders; a project-level file is visible to all of them. The portal
 *    enforces it (see portal.ts `portalPlanFile`), and nothing here hands out a URL.
 */

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { planFiles, type PlanFile } from "@/db/schema";
import { audit } from "@/lib/audit";
import { canStore } from "@/lib/plans";
import { getPackage, getProject } from "@/lib/projects";
import { env } from "@/lib/env";
import { isAllowedFilename, newStorageKey, storage, storageFor } from "@/lib/storage";
import type { Plan } from "@/db/schema";

export class PlanFileError extends Error {}

export async function storageUsage(companyId: string): Promise<number> {
  const db = getDb();
  const [{ total }] = await db
    .select({ total: sql<string>`coalesce(sum(${planFiles.bytes}), 0)` })
    .from(planFiles)
    .where(eq(planFiles.companyId, companyId));
  return Number(total);
}

export async function uploadPlanFile(
  companyId: string,
  plan: Plan,
  actor: { userId: string; label: string },
  input: {
    projectId: string;
    /** Null = the whole project sees it. */
    packageId: string | null;
    filename: string;
    contentType: string;
    data: Buffer;
    versionLabel: string;
    /** Supersede the current version of a file with the same name. */
    supersedes: string | null;
  },
): Promise<PlanFile> {
  const project = await getProject(companyId, input.projectId);
  if (!project) throw new PlanFileError("That project no longer exists");
  if (input.packageId) {
    const owned = await getPackage(companyId, input.packageId);
    if (!owned || owned.pkg.projectId !== project.id) {
      throw new PlanFileError("That package is not on this project");
    }
  }

  if (!isAllowedFilename(input.filename)) {
    throw new PlanFileError("Upload a PDF, drawing set, spreadsheet or image");
  }
  if (input.data.byteLength === 0) throw new PlanFileError("That file is empty");
  if (input.data.byteLength > env.maxUploadBytes) {
    throw new PlanFileError(
      `${Math.round(input.data.byteLength / 1024 / 1024)} MB is over the ${Math.round(env.maxUploadBytes / 1024 / 1024)} MB per-file limit for this deployment.`,
    );
  }

  const gate = canStore(plan, await storageUsage(companyId), input.data.byteLength);
  if (!gate.allowed) throw new PlanFileError(gate.reason!);

  const db = getDb();
  const adapter = storage();
  const key = newStorageKey(`plans/${project.id}`, input.filename);
  await adapter.put(key, input.data, input.contentType);

  if (input.supersedes) {
    await db
      .update(planFiles)
      .set({ supersededAt: new Date() })
      .where(
        and(
          eq(planFiles.id, input.supersedes),
          eq(planFiles.projectId, project.id),
          eq(planFiles.companyId, companyId),
        ),
      );
  }

  const [row] = await db
    .insert(planFiles)
    .values({
      companyId,
      projectId: project.id,
      tradePackageId: input.packageId,
      storageKey: key,
      storageDriver: adapter.driver,
      filename: input.filename.slice(0, 240),
      contentType: input.contentType || "application/octet-stream",
      versionLabel: input.versionLabel.trim().slice(0, 60) || "Rev 0",
      bytes: input.data.byteLength,
      uploadedBy: actor.userId,
    })
    .returning();

  await audit({
    companyId,
    actorKind: "user",
    actorId: actor.userId,
    actorLabel: actor.label,
    action: "plan.uploaded",
    target: `plan_file:${row.id}`,
    metadata: {
      filename: row.filename,
      version: row.versionLabel,
      bytes: row.bytes,
      supersedes: input.supersedes,
    },
  });
  return row;
}

export async function listPlanFiles(
  companyId: string,
  projectId: string,
): Promise<PlanFile[]> {
  const db = getDb();
  return db
    .select()
    .from(planFiles)
    .where(and(eq(planFiles.companyId, companyId), eq(planFiles.projectId, projectId)))
    .orderBy(asc(planFiles.filename), asc(planFiles.createdAt));
}

/** Current (non-superseded) plans only — what a new bidder should be reading. */
export async function currentPlanFiles(
  companyId: string,
  projectId: string,
): Promise<PlanFile[]> {
  const db = getDb();
  return db
    .select()
    .from(planFiles)
    .where(
      and(
        eq(planFiles.companyId, companyId),
        eq(planFiles.projectId, projectId),
        isNull(planFiles.supersededAt),
      ),
    )
    .orderBy(asc(planFiles.filename));
}

/** A file, resolved by (id, companyId). For the estimator's own download. */
export async function planFileFor(
  companyId: string,
  fileId: string,
): Promise<PlanFile | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(planFiles)
    .where(and(eq(planFiles.id, fileId), eq(planFiles.companyId, companyId)));
  return row ?? null;
}

/** Read the bytes back, from whichever driver wrote them. */
export async function readPlanFile(file: PlanFile) {
  return storageFor(file.storageDriver).get(file.storageKey);
}

export async function deletePlanFile(
  companyId: string,
  actor: { userId: string; label: string },
  fileId: string,
): Promise<void> {
  const file = await planFileFor(companyId, fileId);
  if (!file) return;
  const db = getDb();
  await db.delete(planFiles).where(eq(planFiles.id, file.id));
  await storageFor(file.storageDriver).delete(file.storageKey);
  await audit({
    companyId,
    actorKind: "user",
    actorId: actor.userId,
    actorLabel: actor.label,
    action: "plan.deleted",
    target: `plan_file:${fileId}`,
    metadata: { filename: file.filename },
  });
}
