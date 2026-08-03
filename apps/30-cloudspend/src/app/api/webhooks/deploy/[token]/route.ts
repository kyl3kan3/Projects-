/**
 * Deploy markers in.
 *
 * The URL token identifies the org; the HMAC proves the body. Both are required —
 * a token alone in a URL leaks through logs and browser history, and this endpoint
 * writes to the timeline the anomaly correlation reads from. An unauthenticated
 * write here is a way to blame an innocent commit for someone else's spike.
 *
 * Accepts GitHub `push` and `deployment_status` events, or a plain
 * `{"service","sha"}` post from a deploy script.
 */

import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { deploys, orgs } from "@/db/schema";
import { parseDeployPayload, verifyWebhookSignature } from "@/lib/deploys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await ctx.params;
  if (!token || token.length < 16) return new Response("not found", { status: 404 });

  const db = getDb();
  const [org] = await db.select().from(orgs).where(eq(orgs.deployWebhookToken, token));
  if (!org) return new Response("not found", { status: 404 });

  const rawBody = await req.text();
  const signature =
    req.headers.get("x-hub-signature-256") ?? req.headers.get("x-cloudspend-signature");
  if (!verifyWebhookSignature(org.deployWebhookSecret, rawBody, signature)) {
    return Response.json({ error: "Signature mismatch" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Body is not JSON" }, { status: 400 });
  }

  const githubEvent = req.headers.get("x-github-event");
  const parsed = parseDeployPayload(githubEvent, body, new Date());
  if (!parsed.ok) {
    // A GitHub event we do not act on is not an error for the sender to fix, so
    // it gets a 202 rather than a 400 — otherwise GitHub marks the hook failing.
    const status = githubEvent ? 202 : 400;
    return Response.json({ ignored: parsed.error }, { status });
  }

  const [row] = await db
    .insert(deploys)
    .values({
      orgId: org.id,
      serviceName: parsed.deploy.serviceName,
      sha: parsed.deploy.sha,
      deployedAt: parsed.deploy.deployedAt,
      source: parsed.deploy.source,
      repo: parsed.deploy.repo,
      commitUrl: parsed.deploy.commitUrl,
      actor: parsed.deploy.actor,
      environment: parsed.deploy.environment,
    })
    // Re-delivery of the same webhook is not a second deploy.
    .onConflictDoNothing()
    .returning();

  return Response.json({
    ok: true,
    recorded: Boolean(row),
    duplicate: !row,
    service: parsed.deploy.serviceName,
    sha: parsed.deploy.sha.slice(0, 7),
    deployedAt: parsed.deploy.deployedAt.toISOString(),
  });
}
