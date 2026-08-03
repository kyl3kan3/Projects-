"use client";

import { useState } from "react";
import { IconCheck } from "@/components/icons";

/**
 * A value with a copy button — the webhook URL and its signing secret.
 *
 * The value is always visible as selectable text as well, because
 * `navigator.clipboard` needs a secure context and a phone browser in a webview
 * may not have one. A copy button that silently fails is worse than no button.
 */
export function CopyLine({
  label,
  value,
  secret = false,
}: {
  label: string;
  value: string;
  secret?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(!secret);

  return (
    <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
      <span className="t-label">{label}</span>
      {/*
        `minWidth: 0` is load-bearing: this row is a grid item, whose automatic
        minimum size is its min-content width. Without it the un-wrappable
        webhook URL pushes the row to ~660px and the whole settings screen
        scrolls sideways at 390px, even though the <code> below can scroll itself.
      */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <code
          className="t-data scroll-x"
          style={{
            flex: 1,
            minWidth: 0,
            padding: "12px",
            background: "var(--color-panel)",
            border: "1px solid var(--color-hairline)",
            borderRadius: "var(--radius-control)",
            color: "var(--color-text)",
            whiteSpace: "nowrap",
          }}
        >
          {revealed ? value : "•".repeat(Math.min(32, value.length))}
        </code>
        <button
          type="button"
          className="btn-quiet"
          onClick={async () => {
            if (secret && !revealed) {
              setRevealed(true);
              return;
            }
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            } catch {
              // No clipboard permission: the value is already on screen to select.
              setCopied(false);
            }
          }}
          style={{ flex: "none" }}
        >
          {copied ? <IconCheck size={18} /> : null}
          {secret && !revealed ? "Reveal" : copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
