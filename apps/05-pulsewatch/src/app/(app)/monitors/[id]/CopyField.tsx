"use client";

import { useState } from "react";
import { IconCheck, IconCopy } from "@/components/icons";

/**
 * The ping URL and the setup snippets. Copying is the whole job of this screen,
 * so the control says what happened rather than animating.
 */
export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard denied (insecure context, or the user said no): leave the
      // text selectable rather than claiming success.
      setCopied(false);
    }
  }

  return (
    <div>
      {label ? <p className="t-label mb-2">{label}</p> : null}
      <div className="flex items-stretch gap-2">
        <code className="input input-mono flex min-w-0 flex-1 items-center overflow-x-auto whitespace-pre">
          {value}
        </code>
        <button
          type="button"
          className="btn btn-secondary shrink-0 px-3"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy to clipboard"}
        >
          {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
        </button>
      </div>
    </div>
  );
}

export function SnippetBlock({
  snippets,
}: {
  snippets: { label: string; language: string; code: string }[];
}) {
  const [active, setActive] = useState(0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {snippets.map((snippet, i) => (
          <button
            key={snippet.label}
            type="button"
            className="chip"
            aria-pressed={i === active}
            onClick={() => setActive(i)}
          >
            {snippet.label}
          </button>
        ))}
      </div>
      <CopyField value={snippets[active].code} />
    </div>
  );
}
