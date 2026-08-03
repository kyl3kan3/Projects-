"use client";

import { useActionState, useRef, useState } from "react";
import { uploadDocuments, type UploadState } from "./actions";
import { IconUpload } from "@/components/icons";

/**
 * The drop target: dashed hairline, `upload` glyph, and a real file input behind it.
 *
 * Drag-and-drop is the fast path and the button is the guaranteed one — a gesture is
 * never the only way through. On a phone the input opens the camera roll and the file
 * provider, which is how a bill photographed at the meter gets in.
 */
export function UploadDrop({
  sites,
  disabled,
  disabledReason,
}: {
  sites: { id: string; name: string }[];
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadDocuments, {});
  const [dragging, setDragging] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function take(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = new DataTransfer();
    for (const f of Array.from(files)) list.items.add(f);
    if (inputRef.current) inputRef.current.files = list.files;
    setNames(Array.from(files).map((f) => f.name));
  }

  return (
    <form ref={formRef} action={action}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          take(e.dataTransfer.files);
        }}
        style={{
          border: `1px dashed ${dragging ? "var(--color-moss)" : "var(--color-line)"}`,
          borderRadius: 12,
          padding: 20,
          textAlign: "center",
          background: dragging ? "var(--color-surface)" : "transparent",
        }}
      >
        <span style={{ color: "var(--color-fg-2)" }}>
          <IconUpload size={20} />
        </span>
        <p className="t-title mt-2">Drop bills here</p>
        <p className="t-secondary mt-1" style={{ maxWidth: "38ch", marginInline: "auto" }}>
          PDF or photo, one month or twelve. A spend CSV goes here too — you will map its
          columns next.
        </p>

        <input
          ref={inputRef}
          type="file"
          name="files"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,application/pdf,image/*,text/csv"
          className="sr-only"
          onChange={(e) => take(e.target.files)}
        />

        <button
          type="button"
          className="btn btn-secondary mt-4"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          Choose files
        </button>

        {names.length > 0 && (
          <ul className="mt-3 text-left">
            {names.map((n) => (
              <li key={n} className="t-data" style={{ color: "var(--color-fg-2)" }}>
                {n}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="field">
          <span className="t-label">What is it</span>
          <select name="kind" className="input" defaultValue="electricity_bill">
            <option value="electricity_bill">Electricity bill</option>
            <option value="gas_bill">Gas bill</option>
            <option value="fuel_receipt">Fuel receipt or fleet statement</option>
            <option value="spend_csv">Spend / GL export (CSV)</option>
            <option value="other">Something else</option>
          </select>
        </label>

        <label className="field">
          <span className="t-label">Site</span>
          <select name="siteId" className="input" defaultValue={sites[0]?.id ?? ""}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {disabled && disabledReason && (
        <p className="t-secondary mt-3" style={{ color: "var(--color-amber-text)" }}>
          {disabledReason}
        </p>
      )}
      {state.error && (
        <p className="t-secondary mt-3" role="alert" style={{ color: "var(--color-red)" }}>
          {state.error}
        </p>
      )}
      {state.notice && (
        <p className="t-secondary mt-3" style={{ color: "var(--color-amber-text)" }}>
          {state.notice}
        </p>
      )}
      {state.uploaded ? (
        <p className="t-secondary mt-3" aria-live="polite">
          {state.uploaded} file{state.uploaded === 1 ? "" : "s"} received — reading them now.
        </p>
      ) : null}

      <button
        type="submit"
        className="btn btn-primary btn-full mt-4"
        disabled={pending || disabled || names.length === 0}
      >
        {pending ? "Uploading…" : names.length > 1 ? `Upload ${names.length} files` : "Upload"}
      </button>
    </form>
  );
}
