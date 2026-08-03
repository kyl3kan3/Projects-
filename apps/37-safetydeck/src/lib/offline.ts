"use client";

/**
 * The device half of the offline contract: an IndexedDB outbox, a stable device
 * id, and a sync loop.
 *
 * The rule that makes this work is that **every signature is written locally
 * first, online or not**. There is exactly one write path, so there is no
 * "online path" to be quietly broken by a jobsite with one bar — a phone that
 * loses signal mid-huddle behaves the same as one that never had any.
 *
 * Entries leave the outbox only on a server acknowledgement. `stored` and
 * `duplicate` both clear (the record exists either way); `rejected` is kept and
 * surfaced, because a signature we silently threw away is the one failure this
 * product cannot have.
 *
 * Client module. It touches nothing server-side — importing the database here
 * would pull `postgres` into the phone's bundle.
 */

import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "safetydeck-outbox";
const DB_VERSION = 1;
const STORE = "entries";
const DEVICE_KEY = "safetydeck.deviceId";

export interface OutboxSignature {
  outboxId: string;
  instanceId: string;
  token: string;
  employeeId: string;
  employeeName: string;
  signaturePath: string;
  signatureWidth: number;
  signatureHeight: number;
  /** The device's clock at the huddle. Never rewritten at sync time. */
  signedAt: string;
  capturedOffline: boolean;
  /** Set when the server refused it, so the UI can say what happened. */
  rejectedReason?: string;
}

export interface OutboxMeta {
  instanceId: string;
  token: string;
  gps?: { lat: number; lng: number };
  photoBase64?: string;
  photoContentType?: "image/jpeg" | "image/png" | "image/webp";
  absentEmployeeIds?: string[];
  closeOut?: boolean;
}

type Row =
  | ({ kind: "signature" } & OutboxSignature)
  | ({ kind: "meta"; outboxId: string } & OutboxMeta);

let _db: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!_db) {
    _db = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
          const store = database.createObjectStore(STORE, { keyPath: "outboxId" });
          store.createIndex("instanceId", "instanceId");
        }
      },
    });
  }
  return _db;
}

/** A stable random id per device. Not a fingerprint — it is a conflict key. */
export function deviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = window.localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `dev_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    window.localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export async function queueSignature(entry: Omit<OutboxSignature, "outboxId">): Promise<string> {
  const outboxId = `sig_${crypto.randomUUID()}`;
  const database = await db();
  await database.put(STORE, { kind: "signature", outboxId, ...entry } satisfies Row);
  return outboxId;
}

/** Queue the huddle metadata: photo, GPS, absentees, close-out. */
export async function queueMeta(meta: OutboxMeta): Promise<void> {
  const database = await db();
  await database.put(STORE, {
    kind: "meta",
    outboxId: `meta_${meta.instanceId}`,
    ...meta,
  } satisfies Row);
}

export async function pendingFor(instanceId: string): Promise<OutboxSignature[]> {
  const database = await db();
  const all = (await database.getAll(STORE)) as Row[];
  return all
    .filter((r): r is { kind: "signature" } & OutboxSignature => r.kind === "signature")
    .filter((r) => r.instanceId === instanceId && !r.rejectedReason);
}

export async function rejectedFor(instanceId: string): Promise<OutboxSignature[]> {
  const database = await db();
  const all = (await database.getAll(STORE)) as Row[];
  return all
    .filter((r): r is { kind: "signature" } & OutboxSignature => r.kind === "signature")
    .filter((r) => r.instanceId === instanceId && Boolean(r.rejectedReason));
}

export interface SyncOutcome {
  attempted: boolean;
  stored: number;
  duplicates: number;
  rejected: number;
  remaining: number;
  online: boolean;
  error?: string;
}

interface ServerAck {
  outboxId: string;
  status: "stored" | "duplicate" | "rejected";
  reason?: string;
}

/**
 * Drain the outbox for one instance. Safe to call repeatedly — it is the retry
 * mechanism, and the server side is idempotent per (instance, employee).
 */
export async function syncOutbox(instanceId: string, token: string): Promise<SyncOutcome> {
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  const pending = await pendingFor(instanceId);
  const database = await db();
  const meta = (await database.get(STORE, `meta_${instanceId}`)) as
    | ({ kind: "meta"; outboxId: string } & OutboxMeta)
    | undefined;

  if (!online) {
    return {
      attempted: false,
      stored: 0,
      duplicates: 0,
      rejected: 0,
      remaining: pending.length,
      online: false,
    };
  }
  if (pending.length === 0 && !meta) {
    return { attempted: false, stored: 0, duplicates: 0, rejected: 0, remaining: 0, online: true };
  }

  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        deviceId: deviceId(),
        signatures: pending.map((s) => ({
          outboxId: s.outboxId,
          employeeId: s.employeeId,
          signaturePath: s.signaturePath,
          signatureWidth: s.signatureWidth,
          signatureHeight: s.signatureHeight,
          signedAt: s.signedAt,
          capturedOffline: s.capturedOffline,
        })),
        ...(meta?.photoBase64 && meta.photoContentType
          ? { sitePhoto: { base64: meta.photoBase64, contentType: meta.photoContentType } }
          : {}),
        ...(meta?.gps ? { gps: meta.gps } : {}),
        ...(meta?.absentEmployeeIds ? { absentEmployeeIds: meta.absentEmployeeIds } : {}),
        ...(meta?.closeOut ? { closeOut: true } : {}),
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({ error: "Sync failed" }))) as { error?: string };
      return {
        attempted: true,
        stored: 0,
        duplicates: 0,
        rejected: 0,
        remaining: pending.length,
        online: true,
        error: body.error ?? `Sync failed (${res.status})`,
      };
    }

    const payload = (await res.json()) as { acks: ServerAck[] };
    let stored = 0;
    let duplicates = 0;
    let rejected = 0;
    for (const ack of payload.acks ?? []) {
      if (ack.status === "rejected") {
        const row = pending.find((p) => p.outboxId === ack.outboxId);
        if (row) {
          await database.put(STORE, {
            kind: "signature",
            ...row,
            rejectedReason: ack.reason ?? "The server would not accept this signature.",
          } satisfies Row);
        }
        rejected += 1;
        continue;
      }
      // Stored or duplicate: the record exists on the server. Stop retrying.
      await database.delete(STORE, ack.outboxId);
      if (ack.status === "stored") stored += 1;
      else duplicates += 1;
    }
    if (meta) await database.delete(STORE, meta.outboxId);

    return {
      attempted: true,
      stored,
      duplicates,
      rejected,
      remaining: (await pendingFor(instanceId)).length,
      online: true,
    };
  } catch (err) {
    return {
      attempted: true,
      stored: 0,
      duplicates: 0,
      rejected: 0,
      remaining: pending.length,
      online: true,
      error: err instanceof Error ? err.message : "Sync failed",
    };
  }
}

/** Cached talk payload, so the crew screen renders in airplane mode. */
const CACHE_PREFIX = "safetydeck.talk.";

export interface CachedTalk {
  instanceId: string;
  title: string;
  hazardTags: string[];
  estMinutes: number;
  body: string;
  crewName: string;
  siteLabel: string | null;
  scheduledFor: string;
  roster: { id: string; name: string; jobTitle: string | null }[];
  alreadySigned: { employeeId: string; signedAt: string }[];
  cachedAt: string;
}

export function cacheTalk(payload: Omit<CachedTalk, "cachedAt">): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${CACHE_PREFIX}${payload.instanceId}`,
      JSON.stringify({ ...payload, cachedAt: new Date().toISOString() }),
    );
  } catch {
    // A full or private-mode storage must not break the huddle; the page is
    // already rendered, and the service worker still has the shell.
  }
}

export function readCachedTalk(instanceId: string): CachedTalk | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${CACHE_PREFIX}${instanceId}`);
    return raw ? (JSON.parse(raw) as CachedTalk) : null;
  } catch {
    return null;
  }
}
