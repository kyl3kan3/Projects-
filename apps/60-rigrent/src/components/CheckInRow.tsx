"use client";

/**
 * src/components/CheckInRow.tsx
 *
 * One line's condition check, at either end of the rental (DESIGN.md screen 7).
 *
 * 56px rows and 44px stepper buttons, because this is used standing at a tailgate
 * with gloves on. Clean / damaged / missing must add up to the line quantity, and
 * the row says so *before* the submit rather than bouncing it afterwards.
 *
 * The camera button is a plain file input with `capture="environment"`, which on a
 * phone opens the camera and on a laptop opens a file picker. It uploads through
 * `/api/uploads` — a multipart POST rather than a presigned PUT, because there are
 * no R2 credentials in this environment and the key scheme is identical either
 * way, so nothing downstream can tell the difference.
 */

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { IconCamera, IconCheck } from "@/components/icons";
import { validateCounts } from "@/lib/checkin-core";
import type { FormState } from "@/lib/form";

export interface CheckInRowProps {
  orderId: string;
  orderLineId: string;
  itemName: string;
  quantity: number;
  direction: "out" | "in";
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  /** Existing counts, when the line has already been checked. */
  existing?: { quantityOk: number; quantityDamaged: number; quantityMissing: number } | null;
  photoCount: number;
  /** Present once a check row exists to attach photos to. */
  checkId?: string | null;
  disabled?: boolean;
}

export function CheckInRow({
  orderId,
  orderLineId,
  itemName,
  quantity,
  direction,
  action,
  existing = null,
  photoCount,
  checkId = null,
  disabled = false,
}: CheckInRowProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const [ok, setOk] = useState(existing?.quantityOk ?? quantity);
  const [damaged, setDamaged] = useState(existing?.quantityDamaged ?? 0);
  const [missing, setMissing] = useState(existing?.quantityMissing ?? 0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(photoCount);
  const fileRef = useRef<HTMLInputElement>(null);
  const [settled, setSettled] = useState(false);

  const validation = validateCounts(
    { quantityOk: ok, quantityDamaged: damaged, quantityMissing: missing },
    quantity,
  );

  useEffect(() => {
    if (state.ok) {
      setSettled(true);
      const t = setTimeout(() => setSettled(false), 400);
      return () => clearTimeout(t);
    }
  }, [state]);

  async function upload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("orderLineId", orderLineId);
      body.set("direction", direction);
      const response = await fetch("/api/uploads", { method: "POST", body });
      // The route always answers JSON, including on 401 — a redirect to an HTML
      // sign-in page would arrive here as a parse error and get reported as a
      // signal problem, which is the wrong thing to tell a driver.
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        setUploadError(payload.error ?? `The photo would not upload (${response.status}).`);
      } else {
        setUploaded((n) => n + 1);
      }
    } catch {
      setUploadError("The photo would not upload — check the signal and try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="row row-tall row-stack" data-settled={settled ? "true" : "false"}>
      <div className="between" style={{ width: "100%" }}>
        <div style={{ minWidth: 0 }}>
          <p className="t-title">{itemName}</p>
          <p className="t-mono tone-dim" style={{ marginTop: 2 }}>
            {quantity} out
            {existing ? " · already checked" : ""}
          </p>
        </div>
        {existing ? <IconCheck /> : null}
      </div>

      <div className="counters">
        <Counter label="Clean" value={ok} onChange={setOk} max={quantity} />
        <Counter label="Damaged" value={damaged} onChange={setDamaged} max={quantity} />
        <Counter label="Missing" value={missing} onChange={setMissing} max={quantity} />
      </div>

      {!validation.ok ? (
        <p className="field-error" style={{ width: "100%" }}>
          {validation.error}
        </p>
      ) : null}

      <div className="between" style={{ width: "100%", flexWrap: "wrap", gap: 8 }}>
        <label className="btn btn-secondary" style={{ minHeight: 44, cursor: "pointer" }}>
          <IconCamera />
          {uploading ? "Uploading…" : `Photo (${uploaded})`}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            style={{ display: "none" }}
            disabled={disabled || uploading}
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) void upload(file);
            }}
          />
        </label>
        <span className="t-secondary">
          {checkId || uploaded > 0
            ? `${uploaded} photo${uploaded === 1 ? "" : "s"} on this ${direction === "out" ? "load-out" : "check-in"}`
            : "Photograph it before you count it if that is easier."}
        </span>
      </div>

      {uploadError ? (
        <p className="field-error" style={{ width: "100%" }}>
          {uploadError}
        </p>
      ) : null}

      <form action={formAction} className="stack" style={{ width: "100%", gap: 8 }}>
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="orderLineId" value={orderLineId} />
        <input type="hidden" name="direction" value={direction} />
        <input type="hidden" name="quantityOk" value={ok} />
        <input type="hidden" name="quantityDamaged" value={damaged} />
        <input type="hidden" name="quantityMissing" value={missing} />
        <input
          className="input"
          name="note"
          placeholder={
            direction === "out" ? "Note for the load-out" : "What was wrong with it?"
          }
          defaultValue={state.values?.note ?? ""}
        />
        {state.error ? (
          <p className="field-error" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.ok && state.message ? (
          <p className="t-secondary tone-good" role="status">
            {state.message}
          </p>
        ) : null}
        <button
          type="submit"
          className="btn btn-primary btn-full"
          disabled={pending || disabled || !validation.ok}
        >
          {pending
            ? "Recording…"
            : existing
              ? "Update this line"
              : direction === "out"
                ? "Check it out"
                : "Check it in"}
        </button>
      </form>
    </div>
  );
}

function Counter({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  max: number;
}) {
  return (
    <div>
      <p className="t-label">{label}</p>
      <div className="stepper" style={{ marginTop: 4 }}>
        <button
          type="button"
          className="stepper-btn"
          onClick={() => onChange(Math.max(0, value - 1))}
          aria-label={`One fewer ${label.toLowerCase()}`}
        >
          −
        </button>
        <span className="stepper-value">{value}</span>
        <button
          type="button"
          className="stepper-btn"
          onClick={() => onChange(Math.min(max, value + 1))}
          aria-label={`One more ${label.toLowerCase()}`}
        >
          +
        </button>
      </div>
    </div>
  );
}
