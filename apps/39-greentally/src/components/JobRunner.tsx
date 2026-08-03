"use client";

/**
 * Drains this organisation's job queue from the browser, then refreshes the screen.
 *
 * On Vercel there is no always-on worker, so the work has to happen inside a request.
 * This component posts to `/api/jobs/run` — which processes a bounded number of the
 * caller's own jobs — and keeps going while anything is pending, backing off as it goes.
 * The same jobs would eventually be swept by the daily cron; this is what makes the
 * upload feel like an upload.
 *
 * It renders nothing when there is no work, and a mono status line when there is.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function JobRunner({ pending, label }: { pending: number; label?: string }) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(pending);
  const [failed, setFailed] = useState<string | null>(null);
  const active = useRef(false);
  const cancelled = useRef(false);

  useEffect(() => {
    setRemaining(pending);
  }, [pending]);

  const drain = useCallback(async () => {
    if (active.current) return;
    active.current = true;
    let delay = 400;
    try {
      for (let i = 0; i < 30 && !cancelled.current; i += 1) {
        const res = await fetch("/api/jobs/run", { method: "POST" });
        if (!res.ok) {
          setFailed("Background work could not be started. Reload to try again.");
          break;
        }
        const body = (await res.json()) as {
          processed: number;
          failed: number;
          pending: number;
          errors?: string[];
        };
        setRemaining(body.pending);
        if (body.failed > 0 && body.errors?.length) setFailed(body.errors[0]);
        if (body.pending === 0) break;
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(3_000, Math.round(delay * 1.5));
      }
    } catch {
      setFailed("Background work could not be reached.");
    } finally {
      active.current = false;
      if (!cancelled.current) router.refresh();
    }
  }, [router]);

  useEffect(() => {
    cancelled.current = false;
    if (pending > 0) void drain();
    return () => {
      cancelled.current = true;
    };
  }, [pending, drain]);

  if (failed) {
    return (
      <p className="t-secondary mt-2" style={{ color: "var(--color-red)" }}>
        {failed}
      </p>
    );
  }
  if (remaining === 0) return null;

  return (
    <div className="mt-3" aria-live="polite">
      <span className="extracting-bar" aria-hidden="true" />
      <p className="t-data mt-2" style={{ color: "var(--color-fg-2)" }}>
        {label ?? "READING"} · {remaining} {remaining === 1 ? "JOB" : "JOBS"} IN PROGRESS
      </p>
    </div>
  );
}
