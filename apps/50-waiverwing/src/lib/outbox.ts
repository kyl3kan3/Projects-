/**
 * The kiosk's offline outbox.
 *
 * A counter's Wi-Fi drops. That is not an exception, it is a Tuesday. When a
 * signing cannot be posted it goes into IndexedDB — durable across a reload, a
 * crash and a tablet reboot — and is retried on reconnect.
 *
 * Every queued signing carries the `offlineKey` it was captured with, and the
 * server dedupes on it, so replaying the queue any number of times produces
 * exactly one signature row. That is what makes an aggressive retry loop safe:
 * the worst case is a wasted request, never a duplicate waiver.
 *
 * localStorage would have been simpler and is the wrong choice: it is
 * synchronous, size-limited, and cleared by "clear site data" on shared tablets
 * far more readily than an object store.
 */

export interface QueuedPerson {
  firstName: string;
  lastName: string;
  dob: string;
  email?: string | null;
  phone?: string | null;
  relationship?: string;
  answers?: Record<string, string>;
}

export interface QueuedSigning {
  token: string;
  versionId: string;
  channel: "qr" | "kiosk" | "link";
  signer: QueuedPerson;
  minors?: QueuedPerson[];
  answers: Record<string, string>;
  initials: Record<string, string>;
  signatureKind: "typed" | "drawn";
  signatureData: string;
  disclosureAccepted: boolean;
  offlineKey: string;
  capturedAt: string;
}

const DB_NAME = "waiverwing";
const STORE = "outbox";
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "offlineKey" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export async function queueSigning(signing: QueuedSigning): Promise<void> {
  await tx("readwrite", (s) => s.put(signing));
}

export async function queuedSignings(): Promise<QueuedSigning[]> {
  try {
    return (await tx<QueuedSigning[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedSigning[]>)) ?? [];
  } catch {
    return [];
  }
}

export async function queueDepth(): Promise<number> {
  try {
    return (await tx<number>("readonly", (s) => s.count())) ?? 0;
  } catch {
    return 0;
  }
}

async function remove(offlineKey: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(offlineKey) as unknown as IDBRequest<undefined>);
}

export interface FlushResult {
  sent: number;
  remaining: number;
  /** Rows the server refused for a reason retrying will never fix. */
  rejected: Array<{ offlineKey: string; error: string }>;
}

/**
 * Try to upload everything queued.
 *
 * A 4xx that is not 401/408/429 means the server has read the payload and will
 * never accept it (a bad date of birth that slipped through, a rotated token).
 * Retrying forever would silently wedge the queue behind it, so those are dropped
 * and reported — the kiosk shows the count so staff can act instead of a number
 * that never goes down.
 */
export async function flushOutbox(): Promise<FlushResult> {
  const items = await queuedSignings();
  let sent = 0;
  const rejected: FlushResult["rejected"] = [];

  for (const item of items) {
    try {
      const res = await fetch("/api/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(item),
      });
      if (res.ok) {
        await remove(item.offlineKey);
        sent += 1;
        continue;
      }
      const permanent = res.status >= 400 && res.status < 500 && ![401, 408, 429].includes(res.status);
      if (permanent) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        rejected.push({ offlineKey: item.offlineKey, error: String(data.error ?? res.status) });
        await remove(item.offlineKey);
      }
    } catch {
      // Still offline. Leave it queued and stop — the network is not back yet.
      break;
    }
  }

  return { sent, remaining: await queueDepth(), rejected };
}
