/**
 * Media import for URL-based projects (worker-side).
 *
 * - YouTube: temporarily disabled until downloader egress is isolated.
 * - RSS / direct: the pasted URL is a direct media enclosure; stream it down.
 *
 * The caller uploads the resulting file to R2 and continues the pipeline.
 */

import path from "node:path";
import { downloadPublicMedia } from "./public-media";

export type ImportSource = "youtube" | "rss";

const MAX_BYTES = 3 * 1024 * 1024 * 1024; // 3GB safety ceiling

/** Download a URL project's media into `workDir`, returning the local file path. */
export async function importMedia(
  sourceType: ImportSource,
  sourceUrl: string,
  workDir: string,
): Promise<string> {
  if (sourceType === "youtube") {
    throw new Error("YouTube imports are temporarily disabled until the downloader runs behind public-only egress controls. Upload a file or use a direct public media URL.");
  }
  return importDirect(sourceUrl, workDir);
}

async function importDirect(url: string, workDir: string): Promise<string> {
  return downloadPublicMedia(url, (type) => path.join(workDir, `source.${extFromContentType(type)}`), { maxBytes: MAX_BYTES });
}

function extFromContentType(ct: string): string {
  if (/mp4/i.test(ct)) return "mp4";
  if (/mpeg|mp3/i.test(ct)) return "mp3";
  if (/wav/i.test(ct)) return "wav";
  if (/m4a|aac/i.test(ct)) return "m4a";
  if (/webm/i.test(ct)) return "webm";
  if (/quicktime|mov/i.test(ct)) return "mov";
  return "bin";
}
