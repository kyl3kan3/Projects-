/**
 * The `/fail` variant: a job telling us it ran and failed.
 *
 * This is different from a missed ping — the schedule was kept, the work wasn't
 * done — so it opens an incident immediately rather than waiting for the grace
 * period to lapse.
 */

import type { NextRequest } from "next/server";
import { recordPing } from "@/lib/heartbeats";

export const dynamic = "force-dynamic";

const TEXT = { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" };

async function ingestFailure(req: NextRequest, token: string): Promise<Response> {
  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const exitStatus =
    statusParam != null && /^-?\d+$/.test(statusParam) ? Number(statusParam) : null;

  let bodyExcerpt: string | null = null;
  if (req.method === "POST") {
    try {
      bodyExcerpt = (await req.text()).slice(0, 500) || null;
    } catch {
      bodyExcerpt = null;
    }
  }

  const forwarded = req.headers.get("x-forwarded-for");
  const outcome = await recordPing({
    token,
    sourceIp: forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip"),
    userAgent: req.headers.get("user-agent"),
    failed: true,
    exitStatus,
    bodyExcerpt,
  });

  if (outcome === "unknown_token") {
    return new Response("unknown token\n", { status: 404, headers: TEXT });
  }
  if (outcome === "rate_limited") {
    return new Response("too many pings\n", {
      status: 429,
      headers: { ...TEXT, "retry-after": "60" },
    });
  }
  return new Response("failure recorded\n", { status: 202, headers: TEXT });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  return ingestFailure(req, (await ctx.params).token);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  return ingestFailure(req, (await ctx.params).token);
}
