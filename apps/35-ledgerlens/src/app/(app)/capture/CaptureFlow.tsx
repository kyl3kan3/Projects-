"use client";

/**
 * The camera flow.
 *
 * `<input type="file" accept="image/*" capture="environment">` is the whole camera on
 * both iOS Safari and Android Chrome, and it is the only approach that works inside an
 * installed PWA without a permissions dance. What this component adds around it is the
 * three things that decide whether extraction succeeds:
 *
 *  1. **A crop hint before the shot**, drawn over the preview, because the single
 *     biggest cause of a bad reading is a receipt occupying a fifth of the frame.
 *  2. **A blur check before the upload, not after extraction.** A sharpness score is
 *     computed on a downscaled copy in a canvas; a soft photo is refused up front with
 *     "retake", which is the difference between a two-second correction and a
 *     round-trip through a paid model that then fails.
 *  3. **Re-encode to JPEG at 1600px.** It normalises iPhone HEIC, honours EXIF
 *     orientation, and takes a 6 MB photo to about 300 KB — which matters on a truck's
 *     LTE connection.
 *
 * The bytes go straight to storage from here. The app server only ever sees the
 * metadata.
 */

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconCamera, IconCheck, IconRefresh } from "@/components/icons";

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.86;
/** Below this gradient energy the photo is too soft for reliable extraction. */
const SHARPNESS_FLOOR = 7.5;

type Stage = "idle" | "preparing" | "preview" | "uploading" | "done";

interface Shot {
  blob: Blob;
  url: string;
  sharpness: number;
  width: number;
  height: number;
}

export function CaptureFlow({ forwardingAddress }: { forwardingAddress: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [shot, setShot] = useState<Shot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setShot((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setStage("idle");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  async function onPick(file: File) {
    setStage("preparing");
    setError(null);
    try {
      const prepared = await prepare(file);
      setShot(prepared);
      setStage("preview");
    } catch {
      setError("That image could not be read. Try taking it again.");
      setStage("idle");
    }
  }

  async function upload() {
    if (!shot) return;
    setStage("uploading");
    setError(null);
    try {
      const start = await fetch("/api/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mimeType: "image/jpeg" }),
      });
      if (!start.ok) throw new Error(await readError(start));
      const { uploadUrl, key } = (await start.json()) as { uploadUrl: string; key: string };

      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "content-type": "image/jpeg" },
        body: shot.blob,
      });
      if (!put.ok) throw new Error("The upload did not complete. Check your signal and retry.");

      const complete = await fetch("/api/uploads/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key,
          mimeType: "image/jpeg",
          filename: `receipt-${new Date().toISOString().slice(0, 10)}.jpg`,
        }),
      });
      if (!complete.ok) throw new Error(await readError(complete));
      const { documentId } = (await complete.json()) as { documentId: string };
      setStage("done");
      router.push(`/inbox/${documentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload failed.");
      setStage("preview");
    }
  }

  const blurry = shot !== null && shot.sharpness < SHARPNESS_FLOOR;

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onPick(file);
        }}
      />

      {stage === "idle" || stage === "preparing" ? (
        <>
          {/* The framing guide. Static, drawn with hairlines, no camera stream needed —
              a live <video> preview would need getUserMedia, which iOS blocks inside an
              installed PWA. */}
          <div
            className="relative mt-6 overflow-hidden rounded-[20px] border"
            style={{
              borderColor: "var(--color-line)",
              background: "var(--color-surface)",
              aspectRatio: "3 / 4",
            }}
          >
            <div
              className="absolute"
              style={{ inset: "12% 14%", border: "1px dashed var(--color-ink-3)", borderRadius: 12 }}
              aria-hidden="true"
            />
            {(["top left", "top right", "bottom left", "bottom right"] as const).map((corner) => {
              const [v, h] = corner.split(" ");
              return (
                <div
                  key={corner}
                  aria-hidden="true"
                  className="absolute"
                  style={{
                    [v === "top" ? "top" : "bottom"]: "11%",
                    [h === "left" ? "left" : "right"]: "13%",
                    width: 22,
                    height: 22,
                    borderTop: v === "top" ? "2px solid var(--color-ledger)" : undefined,
                    borderBottom: v === "bottom" ? "2px solid var(--color-ledger)" : undefined,
                    borderLeft: h === "left" ? "2px solid var(--color-ledger)" : undefined,
                    borderRight: h === "right" ? "2px solid var(--color-ledger)" : undefined,
                  }}
                />
              );
            })}
            <p
              className="t-secondary absolute inset-x-6 bottom-6 text-center"
              style={{ color: "var(--color-fg-2)" }}
            >
              Fill the frame with the receipt. Flatten it, and keep the total in shot.
            </p>
          </div>

          <div className="thumb-cta">
            <button
              type="button"
              className="btn btn-primary btn-full"
              style={{ height: 64, borderRadius: 8 }}
              disabled={stage === "preparing"}
              onClick={() => inputRef.current?.click()}
            >
              <IconCamera size={22} />
              {stage === "preparing" ? "Reading the photo…" : "Take the photo"}
            </button>
          </div>

          <p className="t-secondary mt-6" style={{ color: "var(--color-fg-3)" }}>
            No camera to hand? Forward it instead: {forwardingAddress}
          </p>
        </>
      ) : null}

      {shot && (stage === "preview" || stage === "uploading" || stage === "done") ? (
        <>
          <div
            className="mt-6 overflow-hidden rounded-[20px] border"
            style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a local blob URL */}
            <img src={shot.url} alt="The photo you just took" className="block w-full" />
          </div>

          <p className="t-data mt-3" style={{ color: "var(--color-fg-3)" }}>
            {shot.width}×{shot.height} · {(shot.blob.size / 1024).toFixed(0)} KB · sharpness{" "}
            {shot.sharpness.toFixed(1)}
          </p>

          {blurry ? (
            <p
              className="t-secondary mt-3 rounded-[12px] border p-3"
              style={{ color: "var(--color-flag)", borderColor: "var(--color-flag)" }}
              role="alert"
            >
              This looks soft. A blurry total is the one thing extraction cannot recover
              from — retake it before uploading. You can upload anyway if the numbers are
              legible to you.
            </p>
          ) : null}

          {error ? (
            <p className="t-secondary mt-3" style={{ color: "var(--color-red)" }} role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-4 flex flex-col gap-3">
            <button
              type="button"
              className="btn btn-primary btn-full"
              disabled={stage === "uploading" || stage === "done"}
              onClick={() => void upload()}
            >
              <IconCheck size={18} />
              {stage === "uploading" ? "Uploading…" : blurry ? "Upload anyway" : "Use this photo"}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-full"
              disabled={stage === "uploading"}
              onClick={reset}
            >
              <IconRefresh size={18} />
              Retake
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? "That upload was refused.";
  } catch {
    return "That upload was refused.";
  }
}

/** Decode, orient, downscale, re-encode, and score sharpness — all in the browser. */
async function prepare(file: File): Promise<Shot> {
  const bitmap = await decode(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error("encode failed");

  return {
    blob,
    url: URL.createObjectURL(blob),
    sharpness: sharpnessOf(ctx, width, height),
    width,
    height,
  };
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Safari before 17 rejects the option; fall through to the <img> path.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode failed"));
      img.src = url;
    });
    return img;
  } finally {
    // The bitmap is already drawn into the canvas by the time this runs.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * Mean absolute horizontal + vertical luminance gradient on a 320px-wide copy.
 *
 * A cheap stand-in for a Laplacian variance: it correlates well enough with "can a
 * model read the total" and runs in a couple of milliseconds on a mid Android, which a
 * proper convolution does not.
 */
function sharpnessOf(ctx: CanvasRenderingContext2D, width: number, height: number): number {
  const w = Math.min(320, width);
  const h = Math.max(1, Math.round((height / width) * w));
  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const sctx = small.getContext("2d");
  if (!sctx) return SHARPNESS_FLOOR;
  sctx.drawImage(ctx.canvas, 0, 0, w, h);
  const { data } = sctx.getImageData(0, 0, w, h);

  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }
  let sum = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      sum += Math.abs(lum[i] - lum[i + 1]) + Math.abs(lum[i] - lum[i + w]);
      n += 2;
    }
  }
  return n === 0 ? 0 : sum / n;
}
