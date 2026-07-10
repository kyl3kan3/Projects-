/** BullMQ: image processing, automation scheduler, emails. */
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/lib/env";
const g = globalThis as unknown as { redis?: IORedis; queues?: Record<string, Queue> };
export function redis(): IORedis {
  if (!g.redis) g.redis = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
  return g.redis;
}
export type QueueName = "images" | "email" | "cron";
export function queue(name: QueueName): Queue {
  g.queues ??= {};
  if (!g.queues[name]) {
    g.queues[name] = new Queue(name, {
      connection: redis(),
      defaultJobOptions: { attempts: 5, backoff: { type: "exponential", delay: 20_000 }, removeOnComplete: { count: 1000 }, removeOnFail: { count: 5000 } },
    });
  }
  return g.queues[name];
}
export interface ProcessImageJob { galleryImageId: string }
export interface SendEmailJob { to: string; subject: string; html: string; automationRunId?: string }
