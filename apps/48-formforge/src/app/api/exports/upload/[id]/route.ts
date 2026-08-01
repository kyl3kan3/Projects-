/**
 * Download one uploaded file, decrypted on the way out.
 *
 * The bytes are decrypted here and streamed; they are never written to disk and
 * never cached. `downloadUpload` goes through `readPhiBytes`, so opening a
 * patient's insurance card is a `viewed` row like any other disclosure.
 */

import { currentContext, actorFor } from "@/lib/auth";
import { downloadUpload, UploadError } from "@/lib/uploads";
import { clientIp } from "@/lib/request";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;

  try {
    const file = await downloadUpload(ctx.practice, id, actorFor(ctx.user, await clientIp()));
    if (!file) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "content-type": file.contentType,
        // `attachment` on purpose: an inline PDF or image renders in the browser
        // and ends up in its cache, which is not where PHI belongs.
        "content-disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof UploadError) return new Response(err.message, { status: 410 });
    console.error("[upload] download failed", err);
    return new Response("Could not fetch that file", { status: 500 });
  }
}
