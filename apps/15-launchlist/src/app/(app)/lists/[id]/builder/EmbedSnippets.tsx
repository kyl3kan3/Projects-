"use client";

import { useState } from "react";
import { IconCheck, IconCode, IconCopy } from "@/components/icons";

/**
 * The embed widget's install snippets. Two of them, because the two audiences
 * are different: a script tag for anything (Carrd, Webflow, a static site) and a
 * React component for a Next/Vite app.
 */
export function EmbedSnippets({
  listSlug,
  appBase,
  pageUrl,
}: {
  listSlug: string;
  appBase: string;
  pageUrl: string;
}) {
  const script = `<div data-launchlist="${listSlug}"></div>
<script src="${appBase}/embed.js" async></script>`;

  const react = `export function Waitlist() {
  useEffect(() => {
    const s = document.createElement("script");
    s.src = "${appBase}/embed.js";
    s.async = true;
    document.body.appendChild(s);
    return () => s.remove();
  }, []);
  return <div data-launchlist="${listSlug}" />;
}`;

  return (
    <section style={{ marginTop: 40 }}>
      <p className="t-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <IconCode size={16} />
        Embed on a site you already have
      </p>
      <p className="t-secondary" style={{ marginTop: 8 }}>
        The widget renders in a shadow root, so your CSS and ours can&apos;t collide. It inherits
        the accent and ground from your theme, posts to the same queue, and counts as the{" "}
        <span className="t-data">widget</span> source in your funnel.
      </p>

      <Snippet label="Any site" code={script} />
      <Snippet label="React" code={react} />

      <p className="t-secondary" style={{ marginTop: 12 }}>
        Referral links still work through the widget: a visitor arriving at{" "}
        <span className="t-data">{pageUrl}?ref=CODE</span> carries the code into the embedded form
        via the page URL.
      </p>
    </section>
  );
}

function Snippet({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span className="t-label">{label}</span>
        <button type="button" className="btn-quiet" onClick={copy} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        className="scroll-x"
        style={{
          marginTop: 8,
          padding: 12,
          background: "var(--color-panel)",
          border: "1px solid var(--color-hairline)",
          borderRadius: "var(--radius-card)",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
