"use client";

/**
 * The editable draft. Copy takes the subject and body together, because that is what
 * pasting into a mail client actually needs.
 */

import { useState } from "react";
import { IconCopy, IconMailDraft } from "@/components/icons";

export function EmailDraft({ subject, body }: { subject: string; body: string }) {
  const [text, setText] = useState(body);
  const [copied, setCopied] = useState<"none" | "body" | "all">("none");

  const copy = async (value: string, which: "body" | "all") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied("none"), 1600);
    } catch {
      setCopied("none");
    }
  };

  return (
    <section className="mt-6">
      <p className="t-label">Subject</p>
      <p className="t-body mt-1.5">{subject}</p>

      <label className="field mt-6">
        <span className="field-label">You&rsquo;re sending this — read it</span>
        <textarea
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ minHeight: 380, fontFamily: "var(--font-sans)", fontSize: 15 }}
          spellCheck
        />
      </label>

      <div className="flex flex-wrap items-center gap-6">
        <button type="button" className="btn-quiet" onClick={() => copy(text, "body")}>
          <IconCopy size={18} />
          {copied === "body" ? "Copied" : "Copy the message"}
        </button>
        <button
          type="button"
          className="btn-quiet"
          onClick={() => copy(`Subject: ${subject}\n\n${text}`, "all")}
        >
          <IconMailDraft size={18} />
          {copied === "all" ? "Copied" : "Copy with subject"}
        </button>
      </div>
    </section>
  );
}
