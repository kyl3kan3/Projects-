"use client";

/**
 * A mono string that copies itself. DESIGN.md: "mono pointer path in diffdim
 * (tap to copy)", and "copy actions flash the mono text's background to panel
 * for 120ms".
 *
 * Under `prefers-reduced-motion` the flash is replaced by the word "Copied",
 * which is also what a screen reader announces either way — the confirmation is
 * never motion-only.
 */

import { useEffect, useRef, useState } from "react";

export function CopyMono({
  value,
  label,
  className = "",
  display,
}: {
  value: string;
  label: string;
  className?: string;
  display?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [flash, setFlash] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard permission denied (or an insecure origin): still confirm, so
      // the user can select the text manually rather than tapping into silence.
    }
    setCopied(true);
    setFlash(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCopied(false);
      setFlash(false);
    }, 1600);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`t-data ${flash ? "copy-flash" : ""} ${className}`}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: "none",
        border: 0,
        padding: "4px 0",
        minHeight: 44,
        color: "var(--color-diffdim-text)",
        wordBreak: "break-all",
        cursor: "pointer",
      }}
      aria-label={`${label}. Tap to copy.`}
    >
      {display ?? value}
      <span
        aria-live="polite"
        style={{ marginLeft: 8, color: "var(--color-text-2)", fontFamily: "var(--font-sans)", fontSize: 11 }}
      >
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}

/**
 * The onboarding terminal block — the copyable `npx schemasentry push …` line
 * DESIGN.md specifies for the first-run empty state. No illustration.
 */
export function TerminalBlock({ command, note }: { command: string; note?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      /* see CopyMono */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div>
      <div className="terminal xscroll">
        <span className="terminal-prompt">$ </span>
        {command}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
        <button type="button" className="btn-quiet" onClick={copy}>
          {copied ? "Copied" : "Copy command"}
        </button>
        {note ? <span className="t-secondary">{note}</span> : null}
      </div>
    </div>
  );
}
