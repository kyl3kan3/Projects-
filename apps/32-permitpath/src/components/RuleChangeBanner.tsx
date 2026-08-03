"use client";

/**
 * The rule-change notice pinned above the jobs list: full-bleed bond stock,
 * hairline top and bottom, no radius — a notice on a board rather than a card.
 *
 * Dismissal is a quiet action and is deliberately session-scoped: it clears the
 * banner for this visit without marking the change as read, because the change
 * itself belongs to the alerts feed and to the jurisdiction's history, not to a
 * dismissal flag on one screen.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconAlertTriangle, IconChevronRight } from "@/components/icons";

const KEY_PREFIX = "permitpath:banner-dismissed:";

export function RuleChangeBanner({
  id,
  title,
  detail,
  meta,
  href,
}: {
  id: string;
  title: string;
  detail: string;
  /** Mono date, right aligned. */
  meta: string;
  href: string;
}) {
  const [hidden, setHidden] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      if (window.sessionStorage.getItem(`${KEY_PREFIX}${id}`) === "1") setHidden(true);
    } catch {
      // Private mode or storage disabled: showing the banner is the safe default.
    }
  }, [id]);

  if (hidden) return null;

  return (
    <div className={`banner mt-5${mounted ? " banner-enter" : ""}`}>
      <IconAlertTriangle size={18} style={{ color: "var(--color-ochre)" }} />
      <div className="min-w-0 flex-1">
        <Link href={href} className="flex items-start gap-2" style={{ color: "inherit" }}>
          <span className="min-w-0 flex-1">
            <span className="t-title block">{title}</span>
            <span className="t-secondary block">{detail}</span>
          </span>
          <span className="t-data shrink-0" style={{ color: "var(--color-fg-3)" }}>
            {meta}
          </span>
          <IconChevronRight size={18} style={{ color: "var(--color-fg-3)" }} />
        </Link>
        <button
          type="button"
          className="btn-quiet btn-quiet-sm"
          onClick={() => {
            setHidden(true);
            try {
              window.sessionStorage.setItem(`${KEY_PREFIX}${id}`, "1");
            } catch {
              // Nothing to persist to; the banner is gone for this render either way.
            }
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
