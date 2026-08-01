import { recordOpen } from "@/lib/comms";

export const dynamic = "force-dynamic";

/**
 * The email open pixel. A 1×1 transparent GIF, and the only way this product
 * knows an email was opened — which is why the receipt grid can say OPENED and
 * mean it.
 *
 * Always returns the image, even for an unknown id: a broken image in a parent's
 * inbox is a worse outcome than a missed statistic.
 */
const GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ deliveryId: string }> },
): Promise<Response> {
  const { deliveryId } = await params;
  try {
    if (/^[0-9a-f-]{36}$/i.test(deliveryId)) await recordOpen(deliveryId);
  } catch (err) {
    console.error("[track] open not recorded", err);
  }
  return new Response(GIF, {
    headers: {
      "content-type": "image/gif",
      "cache-control": "no-store, no-cache, must-revalidate, private",
      "content-length": String(GIF.byteLength),
    },
  });
}
