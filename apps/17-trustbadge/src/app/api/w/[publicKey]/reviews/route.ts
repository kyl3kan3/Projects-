/**
 * The widget's reviews JSON — the public read path, and the endpoint the whole
 * speed claim rests on.
 *
 * Caching (ARCHITECTURE.md flow 3):
 *   `s-maxage=300, stale-while-revalidate=86400` so the CDN answers nearly every
 *   request and a cold key still serves the previous body while it refreshes.
 *   `CDN-Cache-Control` is set too, so Vercel's edge and any Cloudflare layer in
 *   front of it agree rather than fighting.
 *
 * CORS: `*`. This is deliberate and safe — the response is public, read-only
 * social proof that is meant to be fetched by any storefront on any domain, and
 * it carries no credentials (`credentials: "omit"` in the embed, no cookies
 * read here). Locking it to a merchant's declared domain would break every
 * staging theme and preview URL without adding security: the same data is one
 * `curl` away regardless.
 */

import type { NextRequest } from "next/server";
import { storeByPublicKey } from "@/lib/stores";
import { WIDGET_CACHE_CONTROL, widgetPayload } from "@/lib/widget-data";
import { tierForStore } from "@/lib/tier";
import { jsonLdFor } from "@/widget/render";

export const runtime = "nodejs";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-max-age": "86400",
} as const;

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ publicKey: string }> },
): Promise<Response> {
  const startedAt = Date.now();
  const { publicKey } = await params;

  const store = await storeByPublicKey(publicKey);
  if (!store) {
    // 404 with a short cache: a mistyped key in a live theme must not turn into a
    // database query on every page view of that storefront.
    return Response.json(
      { error: "unknown store key" },
      { status: 404, headers: { ...CORS, "cache-control": "public, max-age=60, s-maxage=300" } },
    );
  }

  const tier = await tierForStore(store);
  const url = new URL(req.url);
  const widgetId = url.searchParams.get("widget");
  const product = url.searchParams.get("product");

  const payload = await widgetPayload({
    store,
    tier,
    widgetId: isUuid(widgetId) ? widgetId : null,
    productExternalId: product ? product.slice(0, 120) : null,
  });

  // The JSON-LD is built here, escaped for a script context, and handed to the
  // embed as a string — the widget never serialises it itself.
  const body = { ...payload, jsonLd: jsonLdFor(payload) };

  return Response.json(body, {
    headers: {
      ...CORS,
      "cache-control": WIDGET_CACHE_CONTROL,
      "cdn-cache-control": WIDGET_CACHE_CONTROL,
      "content-type": "application/json; charset=utf-8",
      // Honest instrumentation: how long the origin took when it was not a hit.
      "x-trustbadge-origin-ms": String(Date.now() - startedAt),
      "x-content-type-options": "nosniff",
    },
  });
}

/** A widget id is a UUID or it is not ours; anything else is not worth a query. */
function isUuid(value: string | null): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}
