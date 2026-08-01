"use client";

/**
 * Signing, on a phone.
 *
 * Typed by default (it is faster and legible), drawn if they prefer — a canvas
 * that records pointer positions as SVG path data in a 600×200 viewBox, so what
 * is stored is the stroke itself and it re-renders crisply on any screen and in
 * print.
 *
 * The consent tick is not decorative: ESIGN wants demonstrated intent, and the
 * exact sentence beside it is stored with the signature.
 */

import { useActionState, useRef, useState } from "react";
import { CONSENT_TEXT } from "@/lib/consent";
import type { PublicState } from "./actions";

export function SignPanel({
  token,
  clientName,
  clientEmail,
  depositLine,
  action,
}: {
  token: string;
  clientName: string;
  clientEmail: string;
  depositLine: string | null;
  action: (prev: PublicState, formData: FormData) => Promise<PublicState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [method, setMethod] = useState<"typed" | "drawn">("typed");
  const [typed, setTyped] = useState(clientName);
  const [path, setPath] = useState("");
  const [consent, setConsent] = useState(false);

  if (state.ok) {
    return (
      <section>
        <h2 className="t-h2">Signed — thank you.</h2>
        <p className="t-doc mt-2">{state.message}</p>
        <p className="t-secondary mt-2">
          Reload this page any time to read the signed record, including the audit trail.
        </p>
      </section>
    );
  }

  const ready = consent && (method === "typed" ? typed.trim().length > 1 : path.length > 0);

  return (
    <form action={formAction}>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="method" value={method} />
      <input type="hidden" name="signatureData" value={path} />

      <h2 className="t-h2">Sign this agreement</h2>
      {depositLine ? <p className="t-doc mt-2">{depositLine}</p> : null}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="chip"
          data-active={method === "typed"}
          onClick={() => setMethod("typed")}
        >
          Type it
        </button>
        <button
          type="button"
          className="chip"
          data-active={method === "drawn"}
          onClick={() => setMethod("drawn")}
        >
          Draw it
        </button>
      </div>

      {method === "typed" ? (
        <label className="mt-4 flex flex-col gap-2">
          <span className="t-label">Your signature</span>
          <input
            className="input"
            name="typedSignature"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            style={{ fontFamily: "var(--font-display)", fontSize: 24, fontStyle: "italic", height: 64 }}
            autoComplete="name"
          />
        </label>
      ) : (
        <SignaturePad path={path} onChange={setPath} />
      )}

      <div className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="t-label">Full name</span>
          <input className="input" name="signerName" defaultValue={clientName} required />
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-label">Email</span>
          <input
            className="input"
            name="signerEmail"
            type="email"
            defaultValue={clientEmail}
            required
          />
        </label>
      </div>

      <div className="mt-6 flex items-start gap-3">
        <button
          type="button"
          className="tickbox mt-[2px]"
          role="checkbox"
          aria-checked={consent}
          aria-label="I agree to sign electronically"
          onClick={() => setConsent(!consent)}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 10.5l4 4 8-9" />
          </svg>
        </button>
        {consent ? <input type="hidden" name="consent" value="on" /> : null}
        <span className="t-secondary">{CONSENT_TEXT}</span>
      </div>

      {state.error ? (
        <p className="t-secondary mt-4" style={{ color: "var(--color-vermilion)" }} role="alert">
          {state.error}
        </p>
      ) : null}

      <button className="btn btn-primary btn-full mt-6" type="submit" disabled={pending || !ready}>
        {pending ? "Signing…" : "Sign and return"}
      </button>
      <p className="t-secondary mt-3">
        Your name, email, the time, your IP address and your device are recorded with the signature
        and printed on the agreement.
      </p>
    </form>
  );
}

/** A 600×200 drawing surface that emits SVG path data. */
function SignaturePad({ path, onChange }: { path: string; onChange: (d: string) => void }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const drawing = useRef(false);

  function point(e: React.PointerEvent<SVGSVGElement>): [number, number] {
    const rect = ref.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 600;
    const y = ((e.clientY - rect.top) / rect.height) * 200;
    return [Math.round(x), Math.round(y)];
  }

  return (
    <div className="mt-4">
      <span className="t-label">Draw your signature</span>
      <svg
        ref={ref}
        viewBox="0 0 600 200"
        className="mt-2 w-full touch-none"
        style={{
          height: 160,
          background: "var(--color-sheet)",
          border: "1px solid var(--color-hairline)",
          borderRadius: 8,
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const [x, y] = point(e);
          onChange(`${path}${path ? " " : ""}M ${x} ${y}`);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const [x, y] = point(e);
          onChange(`${path} L ${x} ${y}`);
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
        onPointerLeave={() => {
          drawing.current = false;
        }}
        role="img"
        aria-label="Signature drawing area"
      >
        <path
          d={path}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line x1="24" y1="168" x2="576" y2="168" stroke="var(--color-hairline)" strokeWidth="1" />
      </svg>
      <button type="button" className="btn-quiet mt-2" onClick={() => onChange("")}>
        Clear
      </button>
    </div>
  );
}
