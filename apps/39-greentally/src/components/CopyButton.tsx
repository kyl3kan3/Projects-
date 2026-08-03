"use client";

/**
 * Copy is a quiet action: text-only moss, no underline, dims to 80% on press. It
 * confirms in words ("Copied") rather than with a colour change, so the confirmation
 * survives both reduced motion and colour blindness.
 *
 * `navigator.clipboard` is unavailable on an insecure origin, so the fallback selects
 * the text in a temporary textarea and uses `document.execCommand`. An operator on a
 * customer's http intranet still gets to paste the answer into the form.
 */

import { useEffect, useRef, useState } from "react";
import { IconCopy } from "@/components/icons";

export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      document.body.removeChild(area);
    }
    if (ok) {
      setCopied(true);
      timer.current = setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button type="button" className="btn-quiet inline-flex items-center gap-2" onClick={copy}>
      <IconCopy size={16} />
      {copied ? copiedLabel : label}
    </button>
  );
}
