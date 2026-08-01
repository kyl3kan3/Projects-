/**
 * The offline outbox. Browser-only (IndexedDB); imported from client
 * components.
 *
 * The contract with the server: every punch carries a `clientEventId` minted
 * here, once, before the first send attempt. The server's unique index on
 * `(organization_id, client_event_id)` means a punch can be sent as many times
 * as the network requires and still land exactly once — so retrying blind is
 * always safe, and the phone never has to reason about whether a request
 * "went through".
 *
 * Punches leave the outbox only when the server acknowledges them (including
 * acknowledging them as duplicates). A rejected punch stays, with its error
 * recorded, so nothing is ever silently dropped.
 */

export interface OutboxPunch {
  clientEventId: string;
  jobId: string;
  kind: "in" | "out";
  /** ISO instant from the device clock at the moment of the tap. */
  occurredAt: string;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  deviceFingerprint: string | null;
  attempts: number;
  lastError?: string;
}

const DB_NAME = "crewclock";
const DB_VERSION = 1;
const STORE = "outbox";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "clientEventId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      }),
  );
}

export function supportsOutbox(): boolean {
  return typeof indexedDB !== "undefined";
}

export async function enqueue(punch: OutboxPunch): Promise<void> {
  await tx("readwrite", (store) => store.put(punch));
}

export async function listQueued(): Promise<OutboxPunch[]> {
  const all = await tx<OutboxPunch[]>("readonly", (store) => store.getAll() as IDBRequest<OutboxPunch[]>);
  return all.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

export async function remove(clientEventId: string): Promise<void> {
  await tx("readwrite", (store) => store.delete(clientEventId));
}

export async function recordFailure(punch: OutboxPunch, error: string): Promise<void> {
  await enqueue({ ...punch, attempts: punch.attempts + 1, lastError: error });
}

export async function count(): Promise<number> {
  if (!supportsOutbox()) return 0;
  try {
    return await tx<number>("readonly", (store) => store.count());
  } catch {
    return 0;
  }
}

/* ----------------------------------------------------------------- sync --- */

export interface SyncResult {
  accepted: string[];
  rejected: { clientEventId: string; reason: string }[];
}

/**
 * Push everything queued. Acknowledged punches (including duplicates) are
 * deleted; rejected ones are kept with the reason attached, because "the office
 * needs to look at this" is a real outcome and losing the punch is not.
 */
export async function flush(): Promise<SyncResult> {
  const queued = await listQueued();
  if (queued.length === 0) return { accepted: [], rejected: [] };

  const response = await fetch("/api/punches/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      punches: queued.map(({ attempts, lastError, ...punch }) => {
        void attempts;
        void lastError;
        return punch;
      }),
    }),
  });

  if (!response.ok) {
    const reason = `HTTP ${response.status}`;
    for (const punch of queued) await recordFailure(punch, reason);
    throw new Error(reason);
  }

  const body = (await response.json()) as {
    results: { clientEventId: string; status: string }[];
  };

  const result: SyncResult = { accepted: [], rejected: [] };
  for (const item of body.results) {
    const acknowledged =
      item.status === "opened" ||
      item.status === "closed" ||
      item.status === "duplicate" ||
      item.status === "no_open_shift";
    if (acknowledged) {
      await remove(item.clientEventId);
      result.accepted.push(item.clientEventId);
    } else {
      const punch = queued.find((p) => p.clientEventId === item.clientEventId);
      if (punch) await recordFailure(punch, item.status);
      result.rejected.push({ clientEventId: item.clientEventId, reason: item.status });
    }
  }
  return result;
}

/* --------------------------------------------------------- device + geo --- */

/**
 * A coarse, stable-per-browser device id, for the buddy-punching signal only.
 * Random, stored locally, never derived from hardware — it identifies a browser
 * profile, not a person, and it is useless for tracking anyone anywhere.
 */
export function deviceFingerprint(): string | null {
  try {
    const key = "crewclock.device";
    let value = localStorage.getItem(key);
    if (!value) {
      value = crypto.randomUUID();
      localStorage.setItem(key, value);
    }
    return value;
  } catch {
    return null;
  }
}

export interface FixResult {
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  /** Why there is no fix, for the honest caption on the button. */
  error: "denied" | "timeout" | "unsupported" | "unavailable" | null;
}

/**
 * One position request, high accuracy, 10 second ceiling.
 *
 * It never rejects: "no location" is a valid punch (recorded and flagged), so
 * failing to get a fix must not stop the tap from becoming a punch.
 */
export function getFix(timeoutMs = 10_000): Promise<FixResult> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ lat: null, lng: null, accuracyM: null, error: "unsupported" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyM: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          error: null,
        }),
      (error) =>
        resolve({
          lat: null,
          lng: null,
          accuracyM: null,
          error:
            error.code === error.PERMISSION_DENIED
              ? "denied"
              : error.code === error.TIMEOUT
                ? "timeout"
                : "unavailable",
        }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}
