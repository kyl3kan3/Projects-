/**
 * Chart snapshots are served from here, never from a public URL.
 *
 * P&L data is intimate (README's own risk list), and a screenshot of a trade is
 * P&L data. The row is fetched scoped by the signed-in user's id, so an image id
 * belonging to someone else is a 404 rather than a leak.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tradeImages } from "@/db/schema";
import { currentUser } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Not found", { status: 404 });

  const { id } = await params;
  const [image] = await getDb()
    .select()
    .from(tradeImages)
    .where(and(eq(tradeImages.id, id), eq(tradeImages.userId, user.id)));
  if (!image) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.mimeType,
      "Content-Length": String(image.byteSize),
      // Private: the bytes are a customer's trading history.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
