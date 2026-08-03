"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SignaturePadLib from "signature_pad";

/**
 * The signature pad. DESIGN.md: full width, 160 tall, a 1px hardhat baseline with
 * the name in a Label beneath it — you sign *on the yellow line*. Strokes render
 * in `text`, immediately, with no smoothing animation: the pad has a zero latency
 * budget because a foreman handing a phone round a huddle will not wait for it.
 *
 * The strokes are kept as vector paths, not a bitmap. That is what lets the same
 * signature render into a dashboard row, a PDF page and a printed binder from one
 * stored value of a few hundred bytes.
 */
export interface CapturedSignature {
  path: string;
  width: number;
  height: number;
}

export function SignaturePad({
  name,
  onCapture,
  onCancel,
}: {
  name: string;
  onCapture: (sig: CapturedSignature) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      const ctx = canvas.getContext("2d");
      ctx?.scale(ratio, ratio);
      padRef.current?.clear();
      setHasInk(false);
    };

    const pad = new SignaturePadLib(canvas, {
      penColor: "#f0ede3",
      backgroundColor: "rgba(0,0,0,0)",
      minWidth: 1.1,
      maxWidth: 2.6,
      // No smoothing pass: the stroke has to appear under the finger.
      throttle: 0,
    });
    padRef.current = pad;
    pad.addEventListener("endStroke", () => setHasInk(!pad.isEmpty()));
    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      pad.off();
      padRef.current = null;
    };
  }, [name]);

  const clear = useCallback(() => {
    padRef.current?.clear();
    setHasInk(false);
  }, []);

  const capture = useCallback(() => {
    const pad = padRef.current;
    const canvas = canvasRef.current;
    if (!pad || !canvas || pad.isEmpty()) return;
    const rect = canvas.getBoundingClientRect();
    const path = pointGroupsToPath(pad.toData());
    if (!path) return;
    onCapture({
      path,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
  }, [onCapture]);

  return (
    <div>
      <div className="sigpad">
        <canvas ref={canvasRef} aria-label={`Signature pad for ${name}`} />
        <span className="sigpad-baseline" aria-hidden />
        <span className="sigpad-name t-label">{name}</span>
      </div>
      <div className="mt-4 flex items-center gap-4">
        <button type="button" className="btn-quiet" onClick={clear}>
          Clear
        </button>
        <button type="button" className="btn-quiet" onClick={onCancel} style={{ color: "var(--color-fg-3)" }}>
          Not me
        </button>
        <button
          type="button"
          className="btn btn-primary btn-crew ml-auto flex-1"
          onClick={capture}
          disabled={!hasInk}
        >
          Sign
        </button>
      </div>
    </div>
  );
}

interface PadPoint {
  x: number;
  y: number;
}

/**
 * Point groups → one SVG path. Each stroke becomes an M/L run, so the whole
 * signature is a single `d` attribute that renders identically in the browser and
 * in pdf-lib.
 */
export function pointGroupsToPath(groups: { points: PadPoint[] }[]): string {
  const parts: string[] = [];
  for (const group of groups) {
    const points = group.points;
    if (points.length === 0) continue;
    if (points.length === 1) {
      // A dot: a tiny closed run, so a full stop or an initial still records.
      const { x, y } = points[0];
      parts.push(`M ${r(x)} ${r(y)} l 0.4 0`);
      continue;
    }
    parts.push(`M ${r(points[0].x)} ${r(points[0].y)}`);
    for (let i = 1; i < points.length; i += 1) {
      parts.push(`L ${r(points[i].x)} ${r(points[i].y)}`);
    }
  }
  return parts.join(" ");
}

function r(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Rough polyline length, for the stroke-dashoffset replay. */
export function pathLength(path: string): number {
  const nums = path.match(/-?\d+(\.\d+)?/g);
  if (!nums) return 400;
  let total = 0;
  for (let i = 2; i + 1 < nums.length; i += 2) {
    const dx = Number(nums[i]) - Number(nums[i - 2]);
    const dy = Number(nums[i + 1]) - Number(nums[i - 1]);
    total += Math.hypot(dx, dy);
  }
  return Math.max(80, Math.round(total));
}
