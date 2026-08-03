"use client";

import { useActionState, useRef, useState } from "react";
import { deleteCertAction } from "./actions";
import { IDLE, type ActionState } from "@/lib/action-state";
import { IconTrash } from "@/components/icons";

/**
 * Hold to confirm, 600ms — DESIGN.md's rule for destructive actions. A tap
 * cannot delete a training record, and there is a visible progress ring rather
 * than a dialog, because a dialog on a phone in the sun is a thing people dismiss
 * without reading.
 */
export function DeleteCert({ certId, label }: { certId: string; label: string }) {
  const [state, action] = useActionState<ActionState, FormData>(deleteCertAction, IDLE);
  const [progress, setProgress] = useState(0);
  const timer = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const start = () => {
    const began = Date.now();
    timer.current = window.setInterval(() => {
      const pct = Math.min(1, (Date.now() - began) / 600);
      setProgress(pct);
      if (pct >= 1) {
        stop();
        formRef.current?.requestSubmit();
      }
    }, 30);
  };
  const stop = () => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    setProgress(0);
  };

  if (state.message) {
    return (
      <span className="t-secondary w-full" role="status" style={{ color: "var(--color-fg-3)" }}>
        {state.message}
      </span>
    );
  }

  return (
    <form action={action} ref={formRef} className="shrink-0">
      <input type="hidden" name="certId" value={certId} />
      <button
        type="button"
        aria-label={`Hold to delete ${label}`}
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        style={{
          width: 44,
          height: 44,
          display: "grid",
          placeItems: "center",
          borderRadius: 8,
          color: progress > 0 ? "var(--color-red)" : "var(--color-fg-3)",
          background:
            progress > 0
              ? `conic-gradient(var(--color-red) ${Math.round(progress * 360)}deg, transparent 0)`
              : "transparent",
        }}
      >
        <IconTrash size={18} />
      </button>
      {state.error ? (
        <span className="t-secondary" role="alert" style={{ color: "var(--color-red)" }}>
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
