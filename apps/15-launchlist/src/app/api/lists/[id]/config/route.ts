/**
 * Public config for the embed widget: the copy and theme it needs to render, and
 * nothing else. Never signup data.
 *
 * Keyed by slug or id so a founder can paste either into the snippet.
 */

import { listById, listBySlug, listCounters } from "@/lib/lists";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-max-age": "86400",
};

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const key = (await params).id;
  const list = UUID.test(key) ? await listById(key) : await listBySlug(key);
  if (!list || list.status === "archived") {
    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json", ...CORS },
    });
  }

  const counters = await listCounters(list.id);

  return new Response(
    JSON.stringify({
      slug: list.slug,
      name: list.name,
      ctaLabel: list.ctaLabel,
      proofLine: list.proofLine,
      joined: counters.active + counters.review + counters.unsubscribed,
      theme: list.theme,
      badgeHidden: list.badgeHidden,
    }),
    {
      headers: {
        "content-type": "application/json",
        // A widget on a busy site should not re-ask every render.
        "cache-control": "public, max-age=60, stale-while-revalidate=300",
        ...CORS,
      },
    },
  );
}
