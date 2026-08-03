"use client";

/**
 * The sign gate: a radius-20 sheet from the bottom on a phone, a centred modal
 * from 1024px. Credentials line, the content preview rule, the mono hash line,
 * the primary button — and beneath it, every time, the promise typeset:
 *
 *   SIGNED NOTES ARE LOCKED. AMENDMENTS CREATE A NEW SIGNED VERSION.
 *
 * The hash line reads "stamped on signing" until the server returns the real
 * value, because inventing a preview hash on the client would be a fiction about
 * the one number in this product that has to be true.
 *
 * The clinician types their credentials to sign. That is a ritual, not a security
 * control — the session cookie already authenticates them. It is here because a
 * signature that costs one tap is a signature nobody read the note for.
 */

import { useEffect, useRef, useState } from "react";

export interface SignedResult {
  version: number;
  contentHash: string;
  stamp: string;
}

export function SignGate({
  noteId,
  signerName,
  signerCredentials,
  isAmendment,
  onClose,
  onSigned,
}: {
  noteId: string;
  signerName: string;
  signerCredentials: string;
  isAmendment: boolean;
  onClose: () => void;
  onSigned: (result: SignedResult) => void;
}) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function sign() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/notes/${noteId}/sign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credentials: typed }),
      });
      const payload = (await res.json()) as {
        version?: number;
        contentHash?: string;
        signedAt?: string;
        error?: string;
      };
      if (!res.ok || !payload.contentHash || !payload.version) {
        setError(payload.error ?? "Could not sign that note.");
        setBusy(false);
        return;
      }
      // Haptic on sign, native only, never load-bearing.
      if ("vibrate" in navigator) navigator.vibrate?.(12);
      onSigned({
        version: payload.version,
        contentHash: payload.contentHash,
        stamp: new Date(payload.signedAt ?? Date.now()).toISOString().slice(0, 16).replace("T", " "),
      });
    } catch {
      setError("The network dropped before the signature was written. Nothing was signed.");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center lg:items-center"
      style={{ background: "rgba(38, 43, 38, 0.32)" }}
      role="dialog"
      aria-modal="true"
      aria-label={isAmendment ? "Sign amendment" : "Sign note"}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="sheet sheet-enter w-full max-w-[520px] p-5"
        style={{ boxShadow: "0 -12px 32px rgba(38, 43, 38, 0.12)" }}
      >
        <p className="t-label mb-2">
          {isAmendment ? "Sign this amendment" : "Sign this note"}
        </p>
        <p className="t-title mb-1">
          {signerName}, {signerCredentials}
        </p>
        <p className="t-secondary mb-4">
          You are the author of record. SessionScribe drafted; you reviewed and signed.
        </p>

        <div className="hairline-t mb-3" />
        <p className="t-data t-faint mb-4">
          content hash: stamped on signing · HMAC-SHA256
        </p>

        <label className="field">
          <span className="field-label">Type your credentials to sign</span>
          <input
            ref={inputRef}
            className="input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={signerCredentials}
            autoComplete="off"
          />
        </label>

        {error && (
          <p className="field-error mb-3" role="alert">
            {error}
          </p>
        )}

        <button
          className="btn btn-primary btn-full"
          type="button"
          onClick={sign}
          disabled={busy || typed.trim().length === 0}
        >
          {busy ? "Signing…" : isAmendment ? "Sign amendment" : "Sign note"}
        </button>
        <button
          className="btn-quiet btn-quiet-sm mt-4 block"
          type="button"
          style={{ color: "var(--color-ink-2)" }}
          onClick={onClose}
        >
          Keep reviewing
        </button>

        <p className="t-label mt-5">
          Signed notes are locked. Amendments create a new signed version.
        </p>
      </div>
    </div>
  );
}
