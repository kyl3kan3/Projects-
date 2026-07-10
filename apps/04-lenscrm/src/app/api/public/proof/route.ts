import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { toggleFavorite } from "@/lib/galleries";

/** Client proofing: toggle a favorite. Visitor identified by a signed token
 *  passed from the gallery page (email-gate or anon visitor id). */
const Body = z.object({ galleryId: z.string().uuid(), galleryImageId: z.string().uuid(), visitor: z.string().min(1).max(200) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const gallery = await db.query.galleries.findFirst({ where: eq(schema.galleries.id, parsed.data.galleryId) });
  if (!gallery || gallery.status !== "published") return NextResponse.json({ error: "Gallery unavailable" }, { status: 404 });
  const favorited = await toggleFavorite(parsed.data.galleryId, parsed.data.galleryImageId, parsed.data.visitor);
  return NextResponse.json({ ok: true, favorited });
}
