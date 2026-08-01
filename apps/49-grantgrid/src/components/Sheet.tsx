"use client";

/**
 * The bottom sheet. Radius 20 (the sheet role), scrim-shadowed, closes on Escape
 * and on a scrim tap — and always has a visible Close button, because a gesture is
 * never the only way out.
 */

import { useEffect, useRef } from "react";
import { IconX } from "@/components/icons";

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Move focus into the sheet so the keyboard path is not left behind it.
    panel.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: "rgba(38, 35, 27, 0.32)", border: 0 }}
      />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="sheet-surface relative w-full max-w-[560px] px-5 pb-8 pt-4"
        style={{
          maxHeight: "88vh",
          overflowY: "auto",
          boxShadow: "0 -8px 40px rgba(38, 35, 27, 0.14)",
        }}
      >
        <div className="flex items-center justify-between gap-3 pb-3">
          <h2 className="t-title">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex items-center justify-center"
            style={{
              width: 44,
              height: 44,
              background: "none",
              border: 0,
              color: "var(--color-ink-2)",
            }}
          >
            <IconX size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
