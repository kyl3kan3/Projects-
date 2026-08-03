/**
 * The 300×80 trend PNG that sits in the Slack alert card.
 *
 * Slack's image proxy fetches this without a cookie, so the route is public — but
 * it is scoped to a single anomaly id (an unguessable uuid) and returns nothing
 * but a chart: no figures, no account name, no service name. It is cached for an
 * hour, which matches how often the underlying data can change.
 */

import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { anomalies, baselines } from "@/db/schema";
import { addHours, floorHour } from "@/lib/dates";
import { hourlyTotals } from "@/lib/facts";
import { renderTrendPng } from "@/lib/trend-png";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const WINDOW_HOURS = 48;

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const anomalyId = id.replace(/\.png$/, "");
  if (!/^[0-9a-f-]{36}$/i.test(anomalyId)) return new Response("not found", { status: 404 });

  const db = getDb();
  const [anomaly] = await db.select().from(anomalies).where(eq(anomalies.id, anomalyId));
  if (!anomaly) return new Response("not found", { status: 404 });

  const to = floorHour(new Date());
  const from = addHours(to, -WINDOW_HOURS);
  const hours = await hourlyTotals(anomaly.accountId, { from, to });
  const cells = await db
    .select()
    .from(baselines)
    .where(
      and(
        eq(baselines.accountId, anomaly.accountId),
        eq(baselines.service, anomaly.service),
        eq(baselines.region, anomaly.region),
      ),
    );
  const byCell = new Map(cells.map((c) => [`${c.dow}:${c.hour}`, c.meanMicros]));

  const values = hours.map((h) => h.micros);
  const baseline = hours.map(
    (h) => byCell.get(`${h.ts.getUTCDay()}:${h.ts.getUTCHours()}`) ?? 0,
  );
  const onsetIndex = Math.max(
    0,
    hours.findIndex((h) => h.ts >= anomaly.startedAt),
  );

  const png = renderTrendPng({ values, baseline, onsetIndex });
  return new Response(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=3600",
      "content-length": String(png.byteLength),
    },
  });
}
