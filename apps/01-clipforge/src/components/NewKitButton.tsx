"use client";

import { openUploadSheet } from "./UploadSheet";

/** Opens the upload sheet. `primary` uses the filled style for empty states. */
export function NewKitButton({ primary = false }: { primary?: boolean }) {
  return (
    <button onClick={openUploadSheet} className={`btn ${primary ? "btn-primary" : "btn-ghost"}`}>
      + New kit
    </button>
  );
}
