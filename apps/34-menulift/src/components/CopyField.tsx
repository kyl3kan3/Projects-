"use client";

import { useState } from "react";
import { IconCheck } from "@/components/icons";

/**
 * A read-only value with a copy button. Falls back to selecting the text when the
 * clipboard API is unavailable (an http origin on a phone, which is exactly where
 * an owner will be standing).
 */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      const input = document.getElementById(`copy-${label}`) as HTMLInputElement | null;
      input?.select();
    }
  };

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <span className="t-label">{label}</span>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          id={`copy-${label}`}
          className="input input-data"
          readOnly
          value={value}
          onFocus={(event) => event.currentTarget.select()}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button className="btn btn-secondary" type="button" onClick={copy} style={{ flex: "0 0 auto" }}>
          {copied ? (
            <>
              <IconCheck size={18} /> Copied
            </>
          ) : (
            "Copy"
          )}
        </button>
      </div>
    </div>
  );
}
