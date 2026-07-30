/**
 * HTTP(S) check: status code, response time, keyword match, redirects, headers.
 *
 * Latency is measured around the whole request including the body read, because
 * that is what a user experiences. A check never throws — an unreachable host is
 * a result, not an error.
 */

import type { CheckJob } from "@/lib/queue";

export interface HttpCheckOutcome {
  ok: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  errorKind: string | null;
  errorDetail: string | null;
}

/** Map a fetch/undici failure onto a stable, alertable error kind. */
function classify(err: unknown): { kind: string; detail: string } {
  const detail = err instanceof Error ? err.message : String(err);
  const code = (err as { cause?: { code?: string } })?.cause?.code ?? "";
  if (err instanceof Error && err.name === "AbortError") return { kind: "timeout", detail: "Request timed out" };
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return { kind: "dns", detail };
  if (code === "ECONNREFUSED") return { kind: "connection_refused", detail };
  if (code === "ECONNRESET") return { kind: "connection_reset", detail };
  if (code.startsWith("ERR_TLS") || code === "CERT_HAS_EXPIRED" || /certificate/i.test(detail)) {
    return { kind: "tls", detail };
  }
  return { kind: "network", detail };
}

export async function runHttpCheck(job: CheckJob): Promise<HttpCheckOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), job.timeoutMs);
  const startedAt = performance.now();

  try {
    const res = await fetch(job.target, {
      method: "GET",
      redirect: job.followRedirects ? "follow" : "manual",
      signal: controller.signal,
      headers: {
        // Identify honestly so site owners can see who is polling them.
        "user-agent": "PulseWatch/1.0 (+https://pulsewatch.dev/bot)",
        accept: "*/*",
        ...(job.requestHeaders ?? {}),
      },
      // Monitoring must see origin state, never a cached 200.
      cache: "no-store",
    });

    // Read the body only when a keyword assertion needs it, but always drain
    // enough to make the latency figure honest.
    const body = job.keyword ? await res.text() : "";
    if (!job.keyword) await res.arrayBuffer().catch(() => undefined);
    const latencyMs = Math.round(performance.now() - startedAt);

    const statusOk = job.expectedStatusCodes.includes(res.status);
    if (!statusOk) {
      return {
        ok: false,
        statusCode: res.status,
        latencyMs,
        errorKind: "status",
        errorDetail: `Expected ${job.expectedStatusCodes.join("/")}, got ${res.status}`,
      };
    }

    if (job.keyword) {
      const found = body.includes(job.keyword);
      const passes = job.keywordInvert ? !found : found;
      if (!passes) {
        return {
          ok: false,
          statusCode: res.status,
          latencyMs,
          errorKind: "keyword",
          errorDetail: job.keywordInvert
            ? `Keyword "${job.keyword}" was present and should not be`
            : `Keyword "${job.keyword}" not found in response`,
        };
      }
    }

    return { ok: true, statusCode: res.status, latencyMs, errorKind: null, errorDetail: null };
  } catch (err) {
    const { kind, detail } = classify(err);
    return {
      ok: false,
      statusCode: null,
      latencyMs: kind === "timeout" ? job.timeoutMs : null,
      errorKind: kind,
      errorDetail: detail,
    };
  } finally {
    clearTimeout(timer);
  }
}
