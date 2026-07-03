/**
 * ffmpeg operations: audio extraction for Whisper, clip cutting with a
 * vertical (9:16) center-crop, burned-in animated captions (ASS), and a
 * thumbnail. No GPU required — cut+caption is pure CPU, keeping COGS near zero.
 *
 * Requires the `ffmpeg` and `ffprobe` binaries on PATH (see README).
 */

import ffmpeg from "fluent-ffmpeg";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { TranscriptWord } from "@/db/schema";

export function probeDurationSeconds(input: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(input, (err, data) => {
      if (err) return reject(err);
      resolve(data.format.duration ?? 0);
    });
  });
}

/** Extract a compressed mono 16kHz MP3 for transcription (small + Whisper-friendly). */
export function extractAudio(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .noVideo()
      .audioChannels(1)
      .audioFrequency(16000)
      .audioBitrate("64k")
      .format("mp3")
      .on("end", () => resolve())
      .on("error", reject)
      .save(output);
  });
}

export interface CaptionStyleSpec {
  fontName: string;
  primaryColor: string; // hex #RRGGBB
  fontSize: number;
  outline: number;
  position: "center" | "bottom";
}

const CAPTION_STYLES: Record<string, CaptionStyleSpec> = {
  "bold-center": {
    fontName: "Arial",
    primaryColor: "#FFFFFF",
    fontSize: 84,
    outline: 4,
    position: "center",
  },
  "clean-bottom": {
    fontName: "Arial",
    primaryColor: "#FFFFFF",
    fontSize: 64,
    outline: 3,
    position: "bottom",
  },
  "pop-yellow": {
    fontName: "Arial",
    primaryColor: "#FFE000",
    fontSize: 88,
    outline: 5,
    position: "center",
  },
};

/** Convert #RRGGBB to ASS &HAABBGGRR (opaque). */
function hexToAss(hex: string): string {
  const h = hex.replace("#", "");
  const r = h.slice(0, 2);
  const g = h.slice(2, 4);
  const b = h.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

/**
 * Build an ASS subtitle file with word-group captions (karaoke-ish, 3–4 words
 * per cue) for the clip window [startMs, endMs].
 */
export function buildAssCaptions(
  words: TranscriptWord[],
  startMs: number,
  endMs: number,
  styleName: string,
  videoW = 1080,
  videoH = 1920,
): string {
  const style = CAPTION_STYLES[styleName] ?? CAPTION_STYLES["bold-center"];
  const marginV = style.position === "center" ? Math.round(videoH * 0.42) : 160;
  const alignment = 2; // bottom-center anchor; MarginV lifts it

  const inWindow = words.filter(
    (w) => w.end * 1000 > startMs && w.start * 1000 < endMs,
  );

  const cues: string[] = [];
  const GROUP = 3;
  for (let i = 0; i < inWindow.length; i += GROUP) {
    const group = inWindow.slice(i, i + GROUP);
    const cueStart = Math.max(0, group[0].start * 1000 - startMs);
    const cueEnd = Math.min(endMs - startMs, group[group.length - 1].end * 1000 - startMs);
    const text = group
      .map((w) => w.word.trim())
      .join(" ")
      .replace(/[{}]/g, "");
    cues.push(
      `Dialogue: 0,${assTime(cueStart)},${assTime(cueEnd)},Default,,0,0,0,,${text.toUpperCase()}`,
    );
  }

  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${videoW}
PlayResY: ${videoH}
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${style.fontName},${style.fontSize},${hexToAss(style.primaryColor)},&H00000000,&H00000000,1,0,1,${style.outline},1,${alignment},60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${cues.join("\n")}
`;
}

function assTime(ms: number): string {
  const cs = Math.round(ms / 10);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${m.toString().padStart(2, "0")}:${s
    .toString()
    .padStart(2, "0")}.${c.toString().padStart(2, "0")}`;
}

export interface RenderClipOptions {
  input: string;
  output: string;
  startMs: number;
  endMs: number;
  words: TranscriptWord[];
  captionStyle: string;
  aspect: "9x16" | "1x1" | "16x9";
  height: 720 | 1080;
  watermark: boolean;
  workDir: string;
}

const ASPECT_DIMS = {
  "9x16": (h: number) => ({ w: Math.round((h * 9) / 16), h }),
  "1x1": (h: number) => ({ w: h, h }),
  "16x9": (h: number) => ({ w: Math.round((h * 16) / 9), h }),
} as const;

/**
 * Cut [startMs,endMs], scale+center-crop to the target aspect, burn ASS
 * captions, optionally add a corner watermark. Returns nothing; writes output.
 */
export async function renderClip(opts: RenderClipOptions): Promise<void> {
  const { w, h } = ASPECT_DIMS[opts.aspect](opts.height);
  const assPath = path.join(opts.workDir, `cap_${Date.now()}.ass`);
  const ass = buildAssCaptions(
    opts.words,
    opts.startMs,
    opts.endMs,
    opts.captionStyle,
    w,
    h,
  );
  await writeFile(assPath, ass, "utf8");

  // scale to cover, then crop to exact target, then burn subtitles.
  const filters = [
    `scale=${w}:${h}:force_original_aspect_ratio=increase`,
    `crop=${w}:${h}`,
    `subtitles='${assPath.replace(/'/g, "\\'")}'`,
  ];
  if (opts.watermark) {
    filters.push(
      `drawtext=text='ClipForge':fontcolor=white@0.6:fontsize=${Math.round(
        h * 0.02,
      )}:x=w-tw-20:y=h-th-20`,
    );
  }

  await new Promise<void>((resolve, reject) => {
    ffmpeg(opts.input)
      .seekInput(opts.startMs / 1000)
      .duration((opts.endMs - opts.startMs) / 1000)
      .videoFilters(filters)
      .outputOptions([
        "-c:v libx264",
        "-preset veryfast",
        "-crf 20",
        "-c:a aac",
        "-b:a 128k",
        "-movflags +faststart",
        "-pix_fmt yuv420p",
      ])
      .on("end", () => resolve())
      .on("error", reject)
      .save(opts.output);
  });
}

/** Grab a single-frame JPEG thumbnail from the middle of the clip window. */
export function renderThumbnail(
  input: string,
  output: string,
  atMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .seekInput(atMs / 1000)
      .frames(1)
      .outputOptions(["-q:v 3"])
      .on("end", () => resolve())
      .on("error", reject)
      .save(output);
  });
}
