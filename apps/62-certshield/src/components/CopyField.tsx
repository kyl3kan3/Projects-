"use client";

/**
 * A read-only value with a copy button — the vendor upload link, the compliance
 * hook URL. Falls back to selecting the text when the clipboard API is unavailable
 * (an insecure origin, or a locked-down browser), so the value is always gettable.
 */

import { useRef, useState } from "react";
import { IconLink } from "@/components/icons";

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      ref.current?.select();
    }
  };

  return (
    <div>
      <label className="field-label" htmlFor={`copy-${label}`}>
        {label}
      </label>
      <div className="flex gap-8" style={{ gap: 8 }}>
        <input
          id={`copy-${label}`}
          ref={ref}
          className="input input-mono"
          style={{ fontSize: 13 }}
          value={value}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
        />
        <button type="button" className="btn btn-secondary" onClick={copy} style={{ flex: "none" }}>
          <IconLink size={18} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
