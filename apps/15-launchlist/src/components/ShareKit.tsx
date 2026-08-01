"use client";

import { useState } from "react";
import { IconCheck, IconCopy, IconShare } from "@/components/icons";
import { truncateMiddle } from "@/lib/format";

/**
 * The share kit: the link chip and the native-share primary button.
 *
 * The gesture (native share sheet) always has a visible button equivalent — the
 * chip itself copies — because a gesture is never the only path
 * (DESIGN_LANGUAGE.md).
 */
export function ShareKit({
  url,
  productName,
  position,
}: {
  url: string;
  productName: string;
  position: number;
}) {
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard is blocked in some in-app browsers. Select the text instead so
      // a long-press copy still works, rather than pretending it succeeded.
      const range = document.createRange();
      const node = document.getElementById("share-url");
      if (node) {
        range.selectNodeContents(node);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
      setShareError("Copy blocked by this browser — the link is selected, hold to copy.");
      return;
    }
    setCopied(true);
    setShareError(null);
    setTimeout(() => setCopied(false), 1200);
  }

  async function share() {
    const text = `I'm #${position} in line for ${productName}. Join with my link and we both move up.`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: productName, text, url });
        return;
      } catch {
        // Cancelled or unsupported — fall through to copying.
      }
    }
    await copy();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <button type="button" className="share-chip" data-copied={copied} onClick={copy}>
        <span className="share-chip-url" id="share-url">
          {truncateMiddle(url.replace(/^https?:\/\//, ""), 36)}
        </span>
        <span className="share-chip-copied">Copied</span>
        <span style={{ display: "inline-flex", flex: "none" }}>
          {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
        </span>
      </button>

      <button type="button" className="btn btn-primary btn-full" onClick={share}>
        <IconShare size={18} />
        Share your link
      </button>

      {shareError ? (
        <p className="t-secondary" role="status">
          {shareError}
        </p>
      ) : null}
    </div>
  );
}
