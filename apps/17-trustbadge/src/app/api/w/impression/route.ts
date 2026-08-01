/**
 * Widget impression beacon.
 *
 * Called by the embed with `navigator.sendBeacon` the first time a widget scrolls
 * into view. It exists so the "widget impressions" number on the dashboard is a
 * measurement rather than an estimate — the reviews JSON is CDN-cached, so its
 * request count says nothing useful.
 *
 * Deliberately forgiving: it always answers 204. A counting endpoint must never
 * produce a console error on a merchant's storefront, and it must never be worth
 * an attacker's time — the worst a flood does is inflate a vanity number the
 * merchant sees, which is not worth a rate limiter's complexity at MVP.
 */

import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { widgets } from "@/db/schema";
import { storeByPublicKey } from "@/lib/stores";
import { recordImpression } from "@/lib/widgets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
} as const;

const NO_STORE = { ...CORS, "cache-control": "no-store" } as const;

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const raw = await req.text();
    if (raw.length > 512) return new Response(null, { status: 204, headers: NO_STORE });
    const body = JSON.parse(raw) as { publicKey?: unknown; widgetId?: unknown };

    if (typeof body.publicKey !== "string" || typeof body.widgetId !== "string") {
      return new Response(null, { status: 204, headers: NO_STORE });
    }

    const store = await storeByPublicKey(body.publicKey);
    if (!store) return new Response(null, { status: 204, headers: NO_STORE });

    // The widget must belong to the store the key names, or anyone could inflate
    // a competitor's counts through their own storefront.
    const db = getDb();
    const [widget] = await db
      .select({ id: widgets.id })
      .from(widgets)
      .where(and(eq(widgets.id, body.widgetId), eq(widgets.storeId, store.id)));
    if (widget) await recordImpression(widget.id);
  } catch {
    // Malformed beacon: nothing to do, and nothing worth logging at this volume.
  }

  return new Response(null, { status: 204, headers: NO_STORE });
}
