"use client";

/**
 * The signature block on the customer's quote.
 *
 * A canvas the customer draws on with a finger or a mouse, plus a typed name and
 * separate initials for the damage clause. The stroke is serialised to a PNG data
 * URL in a hidden field on submit, which is what the server stores and what the
 * contract PDF records the hash of.
 *
 * Pointer events, not touch events: one code path for finger, stylus and mouse,
 * and `touch-action: none` on the canvas so drawing does not scroll the page out
 * from under the person signing.
 */

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import type { FormState } from "@/lib/form";

export function SignPad({
  action,
  token,
  depositLabel,
  simulated,
  damageClause,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  token: string;
  depositLabel: string;
  simulated: boolean;
  damageClause: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const values = state.values ?? {};

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Read the ink colour from the token, so the pad cannot invent a hue. If the
    // stylesheet has not landed yet the canvas default (opaque black) is close
    // enough to ink for a stroke nobody sees mid-load — and naming a fallback hex
    // here would be a colour literal outside globals.css.
    const ink = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-ink")
      .trim();
    if (ink) ctx.strokeStyle = ink;
  }, []);

  function pointFrom(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    setHasInk(true);
    const { x, y } = pointFrom(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointFrom(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function end() {
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas && hiddenRef.current) {
      hiddenRef.current.value = canvas.toDataURL("image/png");
    }
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    if (hiddenRef.current) hiddenRef.current.value = "";
  }

  return (
    <form action={formAction} className="stack" style={{ gap: 16 }}>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="signature" ref={hiddenRef} />

      <div>
        <p className="t-label">Initial the condition and damage terms</p>
        <p className="t-secondary" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
          {damageClause}
        </p>
        <label className="field" style={{ marginTop: 12 }}>
          <span className="field-label">Your initials</span>
          <input
            className="input input-mono"
            name="initials"
            maxLength={6}
            required
            defaultValue={values.initials ?? ""}
            placeholder="MV"
            style={{ maxWidth: 120 }}
          />
        </label>
      </div>

      <div className="doc-rule" />

      <div>
        <p className="t-label">Sign here</p>
        <canvas
          ref={canvasRef}
          className="sig-pad"
          style={{ marginTop: 8 }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
          aria-label="Signature pad — draw your signature"
        />
        <div className="between" style={{ marginTop: 8 }}>
          <span className="t-secondary">
            {hasInk ? "Looks good." : "Draw your signature with a finger or a mouse."}
          </span>
          <button type="button" className="btn-quiet" onClick={clear}>
            Clear
          </button>
        </div>
      </div>

      <label className="field" style={{ marginBottom: 0 }}>
        <span className="field-label">Your full name</span>
        <input
          className="input"
          name="signerName"
          required
          defaultValue={values.signerName ?? ""}
          placeholder="Marisol Vega"
        />
      </label>

      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
        {pending ? "Signing…" : `Accept and authorise ${depositLabel}`}
      </button>
      <p className="t-secondary">
        {simulated
          ? "This is a demo environment: no Stripe key is configured, so the deposit hold is simulated and no card is contacted."
          : "The deposit is an authorisation hold, not a charge. You will be taken to a secure card page to authorise it."}
      </p>
    </form>
  );
}
