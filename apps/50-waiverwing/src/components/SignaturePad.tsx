"use client";

/**
 * Drawn signature capture. Pointer events onto a canvas for the visible ink, and
 * the same strokes accumulated as SVG path data — which is what gets stored, so
 * the mark reproduces at any size in the PDF without a raster round trip.
 *
 * Degrades to typed: if pointer events are unavailable the parent's typed field
 * is the path, and DESIGN.md requires exactly that fallback.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export function SignaturePad({
  onChange,
  height = 160,
}: {
  onChange: (pathData: string) => void;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokes = useRef<string[]>([]);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#EEF0EE";
  }, [height]);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = point(e);
    strokes.current.push(`M${x.toFixed(1)} ${y.toFixed(1)}`);
    const ctx = canvasRef.current?.getContext("2d");
    ctx?.beginPath();
    ctx?.moveTo(x, y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const { x, y } = point(e);
    strokes.current.push(`L${x.toFixed(1)} ${y.toFixed(1)}`);
    const ctx = canvasRef.current?.getContext("2d");
    ctx?.lineTo(x, y);
    ctx?.stroke();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const path = strokes.current.join(" ");
    setHasInk(path.length > 0);
    onChange(path);
  };

  const clear = () => {
    strokes.current = [];
    setHasInk(false);
    onChange("");
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="w-full touch-none"
        style={{
          height,
          background: "var(--color-granite)",
          border: "1px solid var(--color-hairline)",
          borderRadius: "8px",
        }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
        aria-label="Sign with your finger or a stylus"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="t-secondary">
          {hasInk ? "Signed above" : "Draw your signature in the box"}
        </span>
        <button type="button" className="btn-quiet" onClick={clear}>
          Clear
        </button>
      </div>
    </div>
  );
}
