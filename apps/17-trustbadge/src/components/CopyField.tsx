"use client";

/**
 * The embed snippet, and copying it. Copying is the entire job of the widget
 * studio, so the control reports what happened — a leaf check, per DESIGN.md —
 * rather than animating.
 */

import { useState } from "react";
import { IconCheck, IconCopy } from "@/components/icons";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard denied (insecure context, or the person said no): leave the
      // snippet selectable rather than claiming success.
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={copy}
      style={copied ? { color: "var(--color-leaf)", borderColor: "var(--color-leaf)" } : undefined}
    >
      {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function SnippetBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div>
      {label ? <p className="t-label mb-2">{label}</p> : null}
      <pre className="code">{code}</pre>
      <div className="mt-3">
        <CopyButton value={code} label="Copy snippet" />
      </div>
    </div>
  );
}
