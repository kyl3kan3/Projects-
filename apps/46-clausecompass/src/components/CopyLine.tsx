"use client";

/** A copy-to-clipboard quiet action. The smallest client component in the app. */

import { useState } from "react";
import { IconCopy } from "@/components/icons";

export function CopyLine({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-quiet btn-quiet-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
    >
      <IconCopy size={18} />
      {copied ? "Copied" : label}
    </button>
  );
}
