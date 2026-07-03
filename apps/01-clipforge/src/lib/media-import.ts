/**
 * Media import for URL-based projects (worker-side).
 *
 * - YouTube: shell out to `yt-dlp` (must be on PATH — see README) to fetch the
 *   best muxed MP4 to a local file.
 * - RSS / direct: the pasted URL is a direct media enclosure; stream it down.
 *
 * The caller uploads the resulting file to R2 and continues the pipeline.
 */

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline as streamPipeline } from "node:stream/promises";

export type ImportSource = "youtube" | "rss";

const MAX_BYTES = 3 * 1024 * 1024 * 1024; // 3GB safety ceiling

/** Download a URL project's media into `workDir`, returning the local file path. */
export async function importMedia(
  sourceType: ImportSource,
  sourceUrl: string,
  workDir: string,
): Promise<string> {
  if (sourceType === "youtube") return importYouTube(sourceUrl, workDir);
  return importDirect(sourceUrl, workDir);
}

async function importYouTube(url: string, workDir: string): Promise<string> {
  const outTemplate = path.join(workDir, "source.%(ext)s");
  await runYtDlp([
    "--no-playlist",
    "--max-filesize",
    "3g",
    // Prefer a single muxed MP4 up to 1080p to keep processing simple.
    "-f",
    "best[ext=mp4][height<=1080]/best[ext=mp4]/best",
    "-o",
    outTemplate,
    url,
  ]);
  // yt-dlp fills in the real extension; find the produced file.
  const files = (await readdir(workDir)).filter((f) => f.startsWith("source."));
  if (files.length === 0) throw new Error("yt-dlp produced no output file");
  return path.join(workDir, files[0]);
}

function runYtDlp(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", (err) => {
      reject(
        new Error(
          `yt-dlp failed to launch (${err.message}). Install yt-dlp on the worker (see README).`,
        ),
      );
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`yt-dlp exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

async function importDirect(url: string, workDir: string): Promise<string> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`Failed to fetch media (${res.status}) from ${url}`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!/audio|video|octet-stream|mpeg/i.test(contentType)) {
    throw new Error(
      `URL did not return media (content-type: ${contentType || "unknown"}). Paste a direct audio/video enclosure URL.`,
    );
  }
  const ext = extFromContentType(contentType);
  const dest = path.join(workDir, `source.${ext}`);
  await streamPipeline(
    res.body as unknown as NodeJS.ReadableStream,
    createWriteStream(dest),
  );
  const size = (await stat(dest)).size;
  if (size > MAX_BYTES) throw new Error("Imported file exceeds the 3GB limit");
  if (size === 0) throw new Error("Imported file was empty");
  return dest;
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
