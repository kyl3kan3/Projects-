/**
 * The public signup endpoint. Serves the hosted page, the embed widget and the
 * API, so there is exactly one implementation of the rules.
 *
 * CORS is open because the widget runs on the customer's own domain and we
 * cannot know it in advance. That is safe here: the endpoint takes an email and a
 * list slug, both public, and every write goes through the fraud scorer and the
 * plan cap. It returns no list data, so it cannot be used to read anything.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { clientIpFrom, hashIp } from "@/lib/fraud";
import { env } from "@/lib/env";
import { listBySlug, listById, positionUrl } from "@/lib/lists";
import { joinList } from "@/lib/signups";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

const Body = z.object({
  slug: z.string().min(1).max(64).optional(),
  listId: z.string().uuid().optional(),
  email: z.string().min(3).max(254),
  ref: z.string().max(64).nullish(),
  source: z.enum(["page", "widget", "api"]).default("page"),
  referrerUrl: z.string().max(500).nullish(),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest): Promise<Response> {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return json({ outcome: "rejected", message: "Send an email address and a list." }, 400);
  }

  const list = parsed.listId
    ? await listById(parsed.listId)
    : parsed.slug
      ? await listBySlug(parsed.slug)
      : null;
  if (!list || list.status === "archived") {
    return json({ outcome: "rejected", message: "That waitlist isn't accepting signups." }, 404);
  }

  const ip = clientIpFrom({
    forwardedFor: req.headers.get("x-forwarded-for"),
    realIp: req.headers.get("x-real-ip"),
  });

  const result = await joinList(list, {
    email: parsed.email,
    refCode: parsed.ref ?? null,
    source: parsed.source,
    ipHash: hashIp(ip, env.ipHashSalt),
    userAgent: req.headers.get("user-agent"),
    referrerUrl: parsed.referrerUrl ?? req.headers.get("referer"),
  });

  switch (result.kind) {
    case "pending":
      return json({
        outcome: "pending",
        emailSent: result.emailSent,
        message: result.emailSent
          ? "Check your email to confirm your spot."
          : "We couldn't send the confirmation email. Try again in a minute.",
      });

    case "joined":
      return json({
        outcome: "joined",
        position: result.position,
        total: result.total,
        positionUrl: positionUrl(list, result.signup.referralCode),
      });

    case "duplicate":
      return json({
        outcome: "duplicate",
        message: "That address is already on the list — we've emailed you your place and link.",
      });

    case "full":
      return json({ outcome: "rejected", message: result.reason }, 409);

    case "rejected":
      return json({ outcome: "rejected", message: result.reason }, 422);
  }
}
