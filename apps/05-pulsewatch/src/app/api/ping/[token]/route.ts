/**
 * Heartbeat ingest — the hot path.
 *
 * Deliberately tiny: token lookup, insert a ping, stamp last_ping_at. GET and
 * POST both work, because cron lines use curl and application code uses fetch.
 * HEAD works too, for anyone using `curl -I`.
 *
 * Responses are plain text and always short. A cron job's `curl -fsS` only cares
 * about the status code, and a body it has to read is a body it can hang on.
 */

import type { NextRequest } from "next/server";
import { recordPing } from "@/lib/heartbeats";

export const dynamic = "force-dynamic";

function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

async function ingest(req: NextRequest, token: string, failed: boolean): Promise<Response> {
  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const exitStatus = statusParam != null && /^-?\d+$/.test(statusParam) ? Number(statusParam) : null;

  // A body is optional; when present, keep a short excerpt for debugging.
  let bodyExcerpt: string | null = null;
  if (req.method === "POST") {
    try {
      const text = await req.text();
      bodyExcerpt = text.slice(0, 500) || null;
    } catch {
      bodyExcerpt = null;
    }
  }

  const outcome = await recordPing({
    token,
    sourceIp: clientIp(req),
    userAgent: req.headers.get("user-agent"),
    failed: failed || (exitStatus != null && exitStatus !== 0),
    exitStatus,
    bodyExcerpt,
  });

  switch (outcome) {
    case "unknown_token":
      return new Response("unknown token\n", { status: 404, headers: TEXT });
    case "rate_limited":
      return new Response("too many pings\n", {
        status: 429,
        headers: { ...TEXT, "retry-after": "60" },
      });
    case "recorded_failure":
      return new Response("failure recorded\n", { status: 202, headers: TEXT });
    default:
      return new Response("ok\n", { status: 200, headers: TEXT });
  }
}

const TEXT = { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" };

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  return ingest(req, (await ctx.params).token, false);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  return ingest(req, (await ctx.params).token, false);
}

export async function HEAD(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const res = await ingest(req, (await ctx.params).token, false);
  return new Response(null, { status: res.status, headers: res.headers });
}
