"use client";

/**
 * Signature capture: typed or drawn.
 *
 * The drawn path is accumulated as SVG path data and written into a hidden input,
 * which is what gets stored — so the mark replays at any size in the PDF and in the
 * audit stamp without a raster round trip.
 *
 * Progressive enhancement is load-bearing here, not a nicety: the typed field is a
 * plain `<input name="signedName">` inside the server-rendered form, so a patient
 * whose phone never runs this JavaScript can still complete and sign the packet.
 * The drawn option simply does not appear for them.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export function SignaturePad({
  allowDrawn,
  defaultName,
  disclosure,
}: {
  allowDrawn: boolean;
  defaultName: string;
  disclosure: string;
}) {
  const [mode, setMode] = useState<"typed" | "drawn">("typed");
  const [typed, setTyped] = useState(defaultName);
  const [drawnPath, setDrawnPath] = useState("");
  const [hasInk, setHasInk] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokes = useRef<string[]>([]);
  const drawing = useRef(false);
  /** Set once mounted, so the drawn toggle only appears where it can work. */
  const [canDraw, setCanDraw] = useState(false);

  useEffect(() => {
    setCanDraw(allowDrawn && typeof window !== "undefined" && "PointerEvent" in window);
  }, [allowDrawn]);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    canvas.width = width * ratio;
    canvas.height = 160 * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1D2628";
  }, []);

  useEffect(() => {
    if (mode !== "drawn") return;
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [mode, resize]);

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
    setDrawnPath(path);
    setHasInk(path.length > 0);
  };

  const clear = () => {
    strokes.current = [];
    setDrawnPath("");
    setHasInk(false);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div>
      <input type="hidden" name="signatureKind" value={mode} />
      <input type="hidden" name="signaturePayload" value={mode === "drawn" ? drawnPath : typed} />

      {canDraw && (
        <div className="mb-4 flex gap-2" role="group" aria-label="Signature method">
          <button
            type="button"
            className="chip"
            data-active={mode === "typed"}
            aria-pressed={mode === "typed"}
            onClick={() => setMode("typed")}
          >
            Type it
          </button>
          <button
            type="button"
            className="chip"
            data-active={mode === "drawn"}
            aria-pressed={mode === "drawn"}
            onClick={() => setMode("drawn")}
          >
            Draw it
          </button>
        </div>
      )}

      <label className="field">
        <span className="field-label">Your full legal name</span>
        <input
          className="input"
          name="signedName"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="name"
          required
        />
      </label>

      {mode === "drawn" && (
        <div className="mb-5">
          <canvas
            ref={canvasRef}
            className="w-full touch-none"
            style={{
              height: 160,
              background: "var(--color-chart)",
              border: "1px solid var(--color-hairline)",
              borderRadius: "var(--radius-control)",
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
      )}

      {mode === "typed" && (
        <div className="mb-5">
          <p className="t-label mb-1">Preview</p>
          <p className="sig-typed" style={{ margin: 0, minHeight: 34 }}>
            {typed}
          </p>
          <div className="sig-line" />
        </div>
      )}

      <label className="choice mb-4" style={{ alignItems: "flex-start" }}>
        <input
          type="checkbox"
          name="disclosureAccepted"
          value="on"
          required
          style={{ width: 20, height: 20, marginTop: 2, accentColor: "var(--color-teal)" }}
        />
        <span className="t-secondary" style={{ color: "var(--color-ink-2)" }}>
          {disclosure}
        </span>
      </label>
    </div>
  );
}
