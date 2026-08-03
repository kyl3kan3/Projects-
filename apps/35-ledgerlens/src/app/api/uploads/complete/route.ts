/**
 * Step two of the camera flow: the browser says "the bytes are up".
 *
 * The server reads them back and hashes them itself rather than trusting a hash from the
 * client — the hash is what dedupe and the storage key are built on, and a client-supplied
 * one would let anyone claim a document was a duplicate of someone else's. Reading a 300 KB
 * JPEG back is cheap; being wrong about identity is not.
 *
 * Extraction is kicked off with `after()` so this response returns immediately and the
 * inbox row appears in `extracting` state, exactly as the email path behaves. The sweep in
 * `/api/cron/tick` is the safety net if the process dies mid-run.
 */

import { after } from "next/server";
import { currentContext } from "@/lib/auth";
import { ingestDocument } from "@/lib/documents";
import { extractDocument } from "@/lib/extract-run";
import { ValidationError } from "@/lib/errors";
import { ALLOWED_DOCUMENT_MIME, getObject, uploadStagingKey } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return Response.json({ error: "Sign in first." }, { status: 401 });

  let body: { key?: string; mimeType?: string; filename?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const key = body.key ?? "";
  const mimeType = body.mimeType ?? "image/jpeg";
  const filename = (body.filename ?? "receipt.jpg").slice(0, 200);

  if (!ALLOWED_DOCUMENT_MIME.has(mimeType)) {
    return Response.json({ error: `We cannot read ${mimeType} files yet.` }, { status: 415 });
  }
  // The key must be one this org could have been issued: same prefix, same extension.
  const expectedPrefix = uploadStagingKey(ctx.org.id, "", mimeType).replace(/\.[a-z0-9]+$/, "");
  if (!key.startsWith(expectedPrefix)) {
    return Response.json({ error: "That upload does not belong to you." }, { status: 403 });
  }

  let bytes: Uint8Array;
  try {
    bytes = await getObject(key);
  } catch {
    return Response.json({ error: "The upload was not found. Try again." }, { status: 404 });
  }

  try {
    const result = await ingestDocument({
      organizationId: ctx.org.id,
      source: "photo",
      bytes,
      mimeType,
      filename,
    });

    if (result.needsExtraction) {
      after(async () => {
        try {
          await extractDocument(result.documentId);
        } catch (err) {
          console.error("[uploads] extraction failed", err);
        }
      });
    }

    return Response.json(
      {
        documentId: result.documentId,
        duplicateOfId: result.duplicateOfId,
        extracting: result.needsExtraction,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof ValidationError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    console.error("[uploads] ingest failed", err);
    return Response.json({ error: "That upload could not be saved." }, { status: 500 });
  }
}
