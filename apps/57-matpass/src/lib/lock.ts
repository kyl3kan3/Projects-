/**
 * A short-lived Redis lock around the sweeps.
 *
 * The sweeps send email. Two of them running at once — the nightly cron and a
 * developer's worker loop, or two cron invocations overlapping — would mail the
 * same past-due parent twice. `SET key value NX PX ttl` is enough: whoever wins
 * sweeps, everyone else returns immediately.
 *
 * With no `REDIS_URL` configured the lock is a no-op that says so, because a
 * single-process dev machine does not need one and the app must not refuse to
 * work without Redis.
 */

import { env } from "@/lib/env";

type Redis = import("ioredis").Redis;

let client: Redis | null = null;

async function connect(): Promise<Redis | null> {
  if (!env.redisUrl) return null;
  if (client) return client;
  const { default: IORedis } = await import("ioredis");
  client = new IORedis(env.redisUrl, {
    maxRetriesPerRequest: 2,
    lazyConnect: false,
    enableOfflineQueue: false,
  });
  client.on("error", (err: Error) => {
    console.error("[lock] redis error", err.message);
  });
  return client;
}

export interface LockHandle {
  acquired: boolean;
  reason: "acquired" | "held-elsewhere" | "no-redis" | "redis-unreachable";
  release: () => Promise<void>;
}

export async function withSweepLock<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<{ ran: boolean; reason: LockHandle["reason"]; result: T | null }> {
  const lock = await acquire(key, ttlMs);
  if (!lock.acquired && lock.reason === "held-elsewhere") {
    return { ran: false, reason: lock.reason, result: null };
  }
  try {
    return { ran: true, reason: lock.reason, result: await fn() };
  } finally {
    await lock.release();
  }
}

async function acquire(key: string, ttlMs: number): Promise<LockHandle> {
  const redis = await connect().catch(() => null);
  if (!redis) {
    return { acquired: false, reason: "no-redis", release: async () => {} };
  }
  const token = `${process.pid}:${Date.now()}`;
  try {
    const ok = await redis.set(`matpass:lock:${key}`, token, "PX", ttlMs, "NX");
    if (ok !== "OK") {
      return { acquired: false, reason: "held-elsewhere", release: async () => {} };
    }
    return {
      acquired: true,
      reason: "acquired",
      release: async () => {
        // Only release our own lock — never someone else's re-acquisition.
        const held = await redis.get(`matpass:lock:${key}`).catch(() => null);
        if (held === token) await redis.del(`matpass:lock:${key}`).catch(() => undefined);
      },
    };
  } catch {
    // Redis being down must not stop the sweep; it only removes the guard.
    return { acquired: false, reason: "redis-unreachable", release: async () => {} };
  }
}

export async function closeLock(): Promise<void> {
  await client?.quit().catch(() => undefined);
  client = null;
}

/** A one-line health check the settings screen can show. */
export async function redisStatus(): Promise<{ configured: boolean; reachable: boolean }> {
  if (!env.redisUrl) return { configured: false, reachable: false };
  try {
    const redis = await connect();
    if (!redis) return { configured: true, reachable: false };
    const pong = await redis.ping();
    return { configured: true, reachable: pong === "PONG" };
  } catch {
    return { configured: true, reachable: false };
  }
}
