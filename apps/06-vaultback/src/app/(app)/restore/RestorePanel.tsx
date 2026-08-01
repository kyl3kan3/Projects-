"use client";

/**
 * The money screen's second half: the impact panel and the key-turn confirm.
 *
 * The panel is plain language on purpose. Someone reaching for this control is
 * having a bad day and will not read a paragraph, so the three facts that matter
 * — new database, nothing overwritten, you supply the target — are three short
 * lines above the control, not a tooltip beside it.
 *
 * The control itself is a key that must be dragged 90° to arm. The keyboard and
 * no-pointer fallback is a press-and-hold with the same 900ms progress fill, per
 * DESIGN.md.
 */

import { useActionState, useRef, useState } from "react";
import { IconCheck, IconKey } from "@/components/icons";
import { formatBytes, formatCount, formatTimestamp } from "@/lib/format";
import type { RestoreFormState } from "./actions";

const HOLD_MS = 900;

export interface SnapshotSummary {
  id: string;
  databaseName: string;
  sourceFingerprint: string;
  createdAt: string;
  bytes: number;
  rows: number;
  tables: number;
  sha256: string;
}

export function RestorePanel({
  snapshot,
  action,
}: {
  snapshot: SnapshotSummary;
  action: (prev: RestoreFormState, form: FormData) => Promise<RestoreFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [target, setTarget] = useState("");
  const [progress, setProgress] = useState(0);
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);

  const ready = target.trim().length > 12 && !pending;

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (!armed) setProgress(0);
  };

  const start = () => {
    if (!ready || timer.current || armed) return;
    const startedAt = Date.now();
    timer.current = setInterval(() => {
      const ratio = Math.min(1, (Date.now() - startedAt) / HOLD_MS);
      setProgress(ratio);
      if (ratio >= 1) {
        stop();
        setArmed(true);
        button.current?.form?.requestSubmit();
      }
    }, 30);
  };

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="snapshotId" value={snapshot.id} />

      <section className="report-card">
        <p className="t-label">Restoring</p>
        <p className="t-data mt-2">{formatTimestamp(snapshot.createdAt)}</p>
        <p className="t-data mt-2" style={{ color: "var(--color-text-3)" }}>
          {snapshot.databaseName} · {formatBytes(snapshot.bytes)} ·{" "}
          {formatCount(snapshot.rows)} rows · {formatCount(snapshot.tables)} tables
        </p>
        <ul className="mt-4 flex flex-col gap-2">
          <li className="t-secondary">Restores into a NEW database. Nothing is overwritten.</li>
          <li className="t-secondary">
            Target: a connection string you provide. We refuse a target on the same host and database
            as the source.
          </li>
          <li className="t-secondary">
            The target must be empty, unless you tick the box below and mean it.
          </li>
        </ul>
      </section>

      <label className="flex flex-col gap-2">
        <span className="t-label">Target connection string</span>
        <input
          className="input input-mono"
          name="target"
          required
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="postgres://user:password@new-db.example.com:5432/restored"
        />
        <span className="t-secondary">
          Create an empty database at your provider first. This credential is used for the restore
          and then deleted — we do not keep it.
        </span>
      </label>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="allowNonEmpty"
          className="mt-1 h-5 w-5"
          style={{ accentColor: "var(--color-brass)" }}
        />
        <span className="t-secondary">
          This target already has tables and I want to restore into it anyway.
        </span>
      </label>

      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-torch)" }} role="alert">
          {state.error}
        </p>
      ) : null}

      {state.ok ? (
        <p
          className="t-secondary flex items-start gap-2"
          style={{ color: "var(--color-seal)" }}
          role="status"
        >
          <IconCheck size={16} />
          {state.summary}
        </p>
      ) : null}

      <div className="thumb-cta">
        <button
          ref={button}
          type="submit"
          className="keyturn"
          data-armed={armed}
          disabled={!ready}
          aria-label="Hold to restore"
          onClick={(e) => {
            if (!armed) e.preventDefault();
          }}
          onPointerDown={start}
          onPointerUp={stop}
          onPointerLeave={stop}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              start();
            }
          }}
          onKeyUp={stop}
        >
          <span
            className="keyturn-fill"
            aria-hidden="true"
            style={{ transform: `scaleX(${progress})` }}
          />
          <span className="keyturn-label">
            <span className="keyturn-key">
              <IconKey size={20} />
            </span>
            {pending
              ? "Restoring…"
              : !ready
                ? "Paste a target to arm"
                : armed
                  ? "Restoring…"
                  : "Hold to turn the key"}
          </span>
        </button>
      </div>
    </form>
  );
}
