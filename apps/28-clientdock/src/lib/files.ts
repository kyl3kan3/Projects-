/**
 * File sharing with versioning.
 *
 * A deliverable is a *stack*: every upload whose name normalises to the same
 * `stackKey` inside a portal becomes the next version, and nothing is ever
 * overwritten. That is what makes "Approve v3?" answerable — v2 is still there,
 * with the comment that sent it back.
 *
 * Every function takes `portalId` explicitly and filters on it. Callers get that
 * id from an authorised source (an agency session that owns the portal, or a
 * signed portal session), never from a URL segment.
 */

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { files, portals, type PortalFile, type Uploader } from "@/db/schema";
import { env } from "@/lib/env";
import { newStorageKey, storage, storageFor, type StoredObject } from "@/lib/storage";

export class FileError extends Error {}

/** Version stacks are keyed on the name without its version suffix or extension. */
export function stackKeyFor(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,8}$/i, "")
    .replace(/[ _-]*v(?:er(?:sion)?)?[ _-]?\d+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "deliverable";
}

export interface FileStack {
  stackKey: string;
  folder: string;
  /** Highest version first — the current one is `versions[0]`. */
  versions: PortalFile[];
  current: PortalFile;
}

export interface UploadInput {
  portalId: string;
  name: string;
  folder?: string;
  data: Buffer;
  contentType?: string;
  uploadedBy: Uploader;
  uploadedByName: string;
}

/** Store one upload as the next version of its stack. */
export async function uploadFile(input: UploadInput): Promise<PortalFile> {
  const name = input.name.trim().replace(/[\r\n\t]/g, " ").slice(0, 200);
  if (!name) throw new FileError("That file needs a name");
  if (input.data.byteLength === 0) throw new FileError("That file is empty");
  if (input.data.byteLength > env.maxUploadBytes) {
    throw new FileError(
      `Files are capped at ${Math.round(env.maxUploadBytes / (1024 * 1024))}MB — link the big one instead.`,
    );
  }

  const db = getDb();
  const stackKey = stackKeyFor(name);
  const [{ max } = { max: 0 }] = await db
    .select({ max: sql<number>`coalesce(max(${files.version}), 0)` })
    .from(files)
    .where(and(eq(files.portalId, input.portalId), eq(files.stackKey, stackKey)));

  const adapter = storage();
  const key = newStorageKey(input.portalId, name);
  await adapter.put(key, input.data, input.contentType || "application/octet-stream");

  const [row] = await db
    .insert(files)
    .values({
      portalId: input.portalId,
      folder: input.folder?.trim() || "Deliverables",
      name,
      stackKey,
      version: Number(max) + 1,
      storageDriver: adapter.driver,
      storageKey: key,
      contentType: input.contentType || "application/octet-stream",
      size: input.data.byteLength,
      uploadedBy: input.uploadedBy,
      uploadedByName: input.uploadedByName,
    })
    .returning();

  // Anything the client can see counts as freshness, but only when the agency did
  // it — a client's own upload must not make the portal look freshly tended.
  if (input.uploadedBy === "agency") await touchPortal(input.portalId);
  return row;
}

export async function touchPortal(portalId: string): Promise<void> {
  const db = getDb();
  await db.update(portals).set({ lastUpdatedAt: new Date() }).where(eq(portals.id, portalId));
}

/** Every version in a portal, newest stack first. Scoped by portal id. */
export async function listFileStacks(portalId: string): Promise<FileStack[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(files)
    .where(eq(files.portalId, portalId))
    .orderBy(desc(files.createdAt));

  const byStack = new Map<string, PortalFile[]>();
  for (const row of rows) {
    const list = byStack.get(row.stackKey) ?? [];
    list.push(row);
    byStack.set(row.stackKey, list);
  }

  return [...byStack.values()]
    .map((versions) => {
      const sorted = [...versions].sort((a, b) => b.version - a.version);
      return {
        stackKey: sorted[0].stackKey,
        folder: sorted[0].folder,
        versions: sorted,
        current: sorted[0],
      };
    })
    .sort((a, b) => b.current.createdAt.getTime() - a.current.createdAt.getTime());
}

/** One version stack, or null. Scoped by portal id. */
export async function getFileStack(portalId: string, stackKey: string): Promise<FileStack | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(files)
    .where(and(eq(files.portalId, portalId), eq(files.stackKey, stackKey)))
    .orderBy(desc(files.version));
  if (rows.length === 0) return null;
  return { stackKey, folder: rows[0].folder, versions: rows, current: rows[0] };
}

/**
 * One file by id — **and** portal id. The pair is the whole point: a file id from
 * another portal resolves to null rather than to somebody else's deliverable.
 */
export async function getFileScoped(portalId: string, fileId: string): Promise<PortalFile | null> {
  if (!isUuid(fileId)) return null;
  const db = getDb();
  const [row] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.portalId, portalId)));
  return row ?? null;
}

/** Read a file's bytes, scoped. Returns null when the pair doesn't match. */
export async function readFileScoped(
  portalId: string,
  fileId: string,
): Promise<{ file: PortalFile; object: StoredObject } | null> {
  const file = await getFileScoped(portalId, fileId);
  if (!file) return null;
  const object = await storageFor(file.storageDriver).get(file.storageKey);
  if (!object) return null;
  return { file, object };
}

/** Files in a portal, oldest first — used when duplicating from a template. */
export async function listFilesRaw(portalId: string): Promise<PortalFile[]> {
  const db = getDb();
  return db.select().from(files).where(eq(files.portalId, portalId)).orderBy(asc(files.createdAt));
}

export async function deleteFileScoped(portalId: string, fileId: string): Promise<boolean> {
  const file = await getFileScoped(portalId, fileId);
  if (!file) return false;
  const db = getDb();
  await db.delete(files).where(and(eq(files.id, fileId), eq(files.portalId, portalId)));
  await storageFor(file.storageDriver).delete(file.storageKey);
  await touchPortal(portalId);
  return true;
}

/** Cheap guard so a malformed id never reaches Postgres as a cast error. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
