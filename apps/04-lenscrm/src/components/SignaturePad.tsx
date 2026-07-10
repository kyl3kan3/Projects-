"use client";
/** Draw-or-type e-signature with consent. Produces a data-URL signature and
 *  POSTs to the sign route. On success the placard flips to fern EXECUTED. */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function SignaturePad({ contractId, defaultName, defaultEmail }: { contractId: string; defaultName: string; defaultEmail: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [typed, setTyped] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function pos(e: React.PointerEvent) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }
  function start(e: React.PointerEvent) { drawing.current = true; const ctx = canvasRef.current!.getContext("2d")!; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
  function move(e: React.PointerEvent) { if (!drawing.current) return; const ctx = canvasRef.current!.getContext("2d")!; const p = pos(e); ctx.strokeStyle = "#1b1b19"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineTo(p.x, p.y); ctx.stroke(); }
  function end() { drawing.current = false; }
  function clear() { const c = canvasRef.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); }

  async function sign() {
    setError(null);
    if (!consent) { setError("Please consent to sign electronically."); return; }
    let signatureData = "";
    if (mode === "draw") signatureData = canvasRef.current!.toDataURL("image/png");
    else { if (!typed.trim()) { setError("Type your name to sign."); return; } signatureData = `typed:${typed.trim()}`; }
    setBusy(true);
    const res = await fetch(`/api/public/sign/${contractId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signerName: defaultName, signerEmail: defaultEmail, signatureData, consent: true }),
    });
    if (res.ok) { setDone(true); router.refresh(); }
    else { setError((await res.json().catch(() => ({}))).error ?? "Could not sign"); setBusy(false); }
  }

  if (done) return (
    <div className="mt-6 flex items-center gap-2 rounded-[8px] border border-[#cfccc3] px-4 py-3" style={{ color: "#2e6b3f" }}>
      <span className="pill" style={{ color: "#7ba05b", borderColor: "#b9cba6" }}><span className="dot" style={{ background: "#7ba05b" }} />EXECUTED</span>
      <span className="text-sm">Signed and countersigned. A copy is on its way to your inbox.</span>
    </div>
  );

  return (
    <div className="mt-6">
      <div className="mb-2 flex gap-2">
        <button className="chip" data-active={mode === "draw"} onClick={() => setMode("draw")} style={{ color: "#5f5c55" }}>Draw</button>
        <button className="chip" data-active={mode === "type"} onClick={() => setMode("type")} style={{ color: "#5f5c55" }}>Type</button>
      </div>
      {mode === "draw" ? (
        <div>
          <canvas ref={canvasRef} width={520} height={140} className="sig-pad" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} />
          <button className="btn-quiet text-sm" style={{ color: "#5f5c55" }} onClick={clear}>Clear</button>
        </div>
      ) : (
        <input className="input-underline" style={{ fontFamily: "var(--font-fraunces)", fontSize: 24 }} placeholder="Type your full name" value={typed} onChange={(e) => setTyped(e.target.value)} />
      )}
      <label className="mt-4 flex items-start gap-2 text-sm" style={{ color: "#4a4842" }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
        I intend to sign this agreement and consent to conduct this transaction electronically.
      </label>
      {error && <p className="mt-2 text-sm" style={{ color: "#c96c55" }}>{error}</p>}
      <button className="btn btn-ink btn-block mt-4" disabled={busy} onClick={sign}>{busy ? "Signing…" : "Sign contract"}</button>
    </div>
  );
}
