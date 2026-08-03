"use client";

/**
 * A read-only value with a copy button — the forwarding address and share links.
 *
 * The clipboard API needs a secure context, which `http://` on a phone is not, so the
 * value is always selectable text as well: the button is the fast path, not the only
 * path.
 */

import { useState } from "react";
import { IconCheck, IconCopy } from "@/components/icons";

export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // No clipboard permission: the text is selectable, so nothing is lost.
      setCopied(false);
    }
  }

  return (
    <div>
      {label ? <span className="t-label">{label}</span> : null}
      <div className="mt-2 flex items-center gap-2">
        <code
          className="t-mono min-w-0 flex-1 truncate rounded-[8px] border px-3 py-3 text-[13px]"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-line)" }}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="btn btn-secondary shrink-0"
          style={{ width: 48, padding: 0 }}
          aria-label={copied ? "Copied" : `Copy ${label ?? "value"}`}
        >
          {copied ? (
            <IconCheck size={18} style={{ color: "var(--color-ledger)" }} />
          ) : (
            <IconCopy size={18} />
          )}
        </button>
      </div>
    </div>
  );
}
