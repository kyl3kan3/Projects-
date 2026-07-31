/**
 * Running a check without a probe fleet.
 *
 * The regional probe worker and the serverless cron tick need exactly the same
 * behaviour — build a job from a monitor row, execute the right check, hand back
 * a result. This module is that shared middle, so neither path can drift from
 * the other and the incident engine cannot tell them apart.
 */

import type { Monitor } from "@/db/schema";
import type { CheckJob, CheckResultJob } from "@/lib/queue";
import { runHttpCheck } from "@/probe/checks/http";
import { runTlsCheck } from "@/probe/checks/tls";
import { registrableDomain, runWhoisCheck } from "@/probe/checks/whois";

/** Heartbeats are swept rather than polled, so they never produce a job. */
export function jobForMonitor(monitor: Monitor, tick = Date.now()): CheckJob | null {
  const kind =
    monitor.type === "http"
      ? "http"
      : monitor.type === "ssl"
        ? "ssl"
        : monitor.type === "domain"
          ? "domain"
          : null;
  if (!kind) return null;
  return {
    monitorId: monitor.id,
    tick,
    kind,
    target: monitor.target,
    timeoutMs: monitor.timeoutMs,
    expectedStatusCodes: monitor.expectedStatusCodes,
    keyword: monitor.keyword,
    keywordInvert: monitor.keywordInvert,
    followRedirects: monitor.followRedirects,
    requestHeaders: monitor.requestHeaders ?? null,
  };
}

/** Execute one check. Never throws: an unreachable target is a result. */
export async function executeCheck(job: CheckJob, region: string): Promise<CheckResultJob> {
  const base = { monitorId: job.monitorId, tick: job.tick, region };

  if (job.kind === "http") {
    return { ...base, ...(await runHttpCheck(job)) };
  }

  if (job.kind === "ssl") {
    const outcome = await runTlsCheck(job.target, job.timeoutMs);
    return {
      ...base,
      ok: outcome.ok,
      statusCode: null,
      latencyMs: outcome.latencyMs,
      errorKind: outcome.errorKind,
      errorDetail: outcome.errorDetail,
      expiry: {
        notAfter: outcome.notAfter?.toISOString() ?? null,
        issuer: outcome.issuer,
        subject: outcome.subject,
        registrar: null,
      },
    };
  }

  const outcome = await runWhoisCheck(registrableDomain(job.target), job.timeoutMs);
  return {
    ...base,
    ok: outcome.ok,
    statusCode: null,
    latencyMs: null,
    errorKind: outcome.errorKind,
    errorDetail: outcome.errorDetail,
    expiry: {
      notAfter: outcome.expiresAt?.toISOString() ?? null,
      issuer: null,
      subject: null,
      registrar: outcome.registrar,
    },
  };
}

/**
 * Run an array of tasks with a concurrency cap and a wall-clock deadline.
 * Whatever doesn't start before the deadline is simply left for the next tick —
 * `next_due_at` is already in the past, so nothing is lost.
 */
export async function runBounded<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  deadline: number,
): Promise<{ done: number; skipped: number }> {
  let index = 0;
  let done = 0;

  async function worker(): Promise<void> {
    while (index < tasks.length && Date.now() < deadline) {
      const task = tasks[index++];
      try {
        await task();
      } catch (err) {
        console.error("[check-runner] task failed", err);
      }
      done += 1;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()),
  );
  return { done, skipped: tasks.length - done };
}
