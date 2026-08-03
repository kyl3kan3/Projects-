"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

/**
 * Copy the booking link.
 *
 * The link is also selectable text right next to this, because `navigator.clipboard` is
 * unavailable on an insecure origin and inside some in-app browsers — and a stylist copying
 * their link out of an Instagram webview is the exact case that must not fail silently.
 */
export function CopyLink({ url }: { url: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <p
        className="t-mono"
        style={{
          margin: 0,
          fontSize: "1rem",
          wordBreak: "break-all",
          color: "var(--color-cobalt)",
        }}
      >
        {url}
      </p>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setState("copied");
            } catch {
              setState("failed");
            }
          }}
        >
          <Icon name="link-bio" size={18} />
          Copy link
        </button>
        {state === "copied" && <span className="t-secondary">Copied.</span>}
        {state === "failed" && (
          <span className="t-secondary">
            Copying is blocked here — select the link above and copy it by hand.
          </span>
        )}
      </div>
    </div>
  );
}
