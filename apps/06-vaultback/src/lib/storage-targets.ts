/**
 * Storage targets: the VaultBack-managed bucket every org starts with, plus
 * bring-your-own S3 and R2.
 *
 * BYO is strategically load-bearing (README differentiation 2), so the flow
 * refuses to save credentials it has not proven: a target is verified by writing
 * and deleting a probe object, not by listing the bucket. Read-only credentials
 * that pass a list check and fail the first real backup at 4am would be worse
 * than no check at all.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { storageTargets, type StorageKind, type StorageTarget } from "@/db/schema";
import { audit } from "@/lib/audit";
import { encryptCredential } from "@/lib/crypto";
import { env } from "@/lib/env";
import { driverFor, driverForNewTarget, StorageError } from "@/lib/storage";

export class StorageTargetError extends Error {}

export async function listTargets(orgId: string): Promise<StorageTarget[]> {
  const db = getDb();
  return db
    .select()
    .from(storageTargets)
    .where(eq(storageTargets.orgId, orgId))
    .orderBy(storageTargets.createdAt);
}

export async function defaultTarget(orgId: string): Promise<StorageTarget | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(storageTargets)
    .where(and(eq(storageTargets.orgId, orgId), eq(storageTargets.isDefault, true)));
  return row ?? null;
}

export interface CreateTargetInput {
  orgId: string;
  actorUserId: string;
  name: string;
  kind: Exclude<StorageKind, "managed">;
  bucket: string;
  region: string;
  endpoint: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  makeDefault: boolean;
}

export async function createTarget(input: CreateTargetInput): Promise<StorageTarget> {
  const db = getDb();

  const name = input.name.trim() || `${input.kind === "byo_r2" ? "R2" : "S3"} · ${input.bucket}`;
  if (!input.bucket.trim()) throw new StorageTargetError("A bucket name is required");
  if (!input.accessKeyId.trim() || !input.secretAccessKey.trim()) {
    throw new StorageTargetError("Both an access key ID and a secret access key are required");
  }
  if (input.kind === "byo_r2" && !input.endpoint.trim()) {
    throw new StorageTargetError(
      "R2 needs its endpoint — https://<account-id>.r2.cloudflarestorage.com",
    );
  }

  const driver = driverForNewTarget({
    kind: input.kind,
    bucket: input.bucket.trim(),
    region: input.region.trim() || "auto",
    endpoint: input.endpoint.trim() || null,
    prefix: input.prefix.trim(),
    credentials: {
      accessKeyId: input.accessKeyId.trim(),
      secretAccessKey: input.secretAccessKey.trim(),
    },
  });

  try {
    await driver.verify();
  } catch (err) {
    throw new StorageTargetError(
      err instanceof StorageError ? err.message : `Could not verify that bucket: ${String(err)}`,
    );
  }

  const [target] = await db
    .insert(storageTargets)
    .values({
      orgId: input.orgId,
      name,
      kind: input.kind,
      bucket: input.bucket.trim(),
      region: input.region.trim() || "auto",
      endpoint: input.endpoint.trim() || null,
      prefix: input.prefix.trim(),
      encryptedCredentials: encryptCredential(
        JSON.stringify({
          accessKeyId: input.accessKeyId.trim(),
          secretAccessKey: input.secretAccessKey.trim(),
        }),
        env.credentialsKey,
      ),
      isDefault: false,
      verifiedAt: new Date(),
    })
    .returning();

  await audit({
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    action: "storage.created",
    subjectType: "storage",
    subjectId: target.id,
    metadata: { name: target.name, kind: target.kind, bucket: target.bucket },
  });

  if (input.makeDefault) await setDefaultTarget(target.id, input.orgId, input.actorUserId);
  return target;
}

export async function verifyTarget(
  targetId: string,
  orgId: string,
  actorUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const [target] = await db
    .select()
    .from(storageTargets)
    .where(and(eq(storageTargets.id, targetId), eq(storageTargets.orgId, orgId)));
  if (!target) throw new StorageTargetError("That storage target is not in this organization");

  try {
    await driverFor(target).verify();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await db
      .update(storageTargets)
      .set({ lastCheckError: detail })
      .where(eq(storageTargets.id, target.id));
    return { ok: false, error: detail };
  }

  await db
    .update(storageTargets)
    .set({ verifiedAt: new Date(), lastCheckError: null })
    .where(eq(storageTargets.id, target.id));

  await audit({
    orgId,
    actorUserId,
    action: "storage.verified",
    subjectType: "storage",
    subjectId: target.id,
    metadata: { name: target.name },
  });
  return { ok: true };
}

export async function setDefaultTarget(
  targetId: string,
  orgId: string,
  actorUserId: string,
): Promise<void> {
  const db = getDb();
  const [target] = await db
    .select()
    .from(storageTargets)
    .where(and(eq(storageTargets.id, targetId), eq(storageTargets.orgId, orgId)));
  if (!target) throw new StorageTargetError("That storage target is not in this organization");
  if (!target.verifiedAt) {
    throw new StorageTargetError("Verify the target before making it the default");
  }

  await db
    .update(storageTargets)
    .set({ isDefault: false })
    .where(eq(storageTargets.orgId, orgId));
  await db
    .update(storageTargets)
    .set({ isDefault: true })
    .where(eq(storageTargets.id, targetId));

  await audit({
    orgId,
    actorUserId,
    action: "storage.default_changed",
    subjectType: "storage",
    subjectId: targetId,
    metadata: { name: target.name },
  });
}

export async function deleteTarget(
  targetId: string,
  orgId: string,
  actorUserId: string,
): Promise<void> {
  const db = getDb();
  const [target] = await db
    .select()
    .from(storageTargets)
    .where(and(eq(storageTargets.id, targetId), eq(storageTargets.orgId, orgId)));
  if (!target) throw new StorageTargetError("That storage target is not in this organization");
  if (target.isDefault) {
    throw new StorageTargetError(
      "This is the default target. Make another target the default first.",
    );
  }

  try {
    // Snapshots reference their target with ON DELETE RESTRICT: a target that
    // still holds someone's only backup must not disappear from under it.
    await db.delete(storageTargets).where(eq(storageTargets.id, targetId));
  } catch {
    throw new StorageTargetError(
      "Snapshots are still stored in this target. It can be removed once they pass retention.",
    );
  }

  await audit({
    orgId,
    actorUserId,
    action: "storage.deleted",
    subjectType: "storage",
    subjectId: targetId,
    metadata: { name: target.name },
  });
}
