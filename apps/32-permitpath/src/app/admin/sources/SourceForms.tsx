"use client";

/**
 * Source manager controls: pause a source, put a fixed one back in rotation, or
 * crawl it now to confirm a fix without waiting for the 72-hour cycle.
 */

import { useActionState } from "react";
import { crawlNowAction, setSourceStatusAction, type CurationState } from "../actions";

const initial: CurationState = { error: null, ok: null };

export function CrawlNowForm({ sourceId }: { sourceId: string }) {
  const [state, action, pending] = useActionState(crawlNowAction, initial);
  return (
    <form action={action} className="inline-flex flex-col">
      <input type="hidden" name="sourceId" value={sourceId} />
      <button type="submit" className="btn-quiet btn-quiet-sm" disabled={pending}>
        {pending ? "Crawling…" : "Crawl now"}
      </button>
      {state.error && (
        <span className="t-secondary" role="alert" style={{ color: "var(--color-signal-red)" }}>
          {state.error}
        </span>
      )}
      {state.ok && (
        <span className="t-secondary" style={{ color: "var(--color-brick)" }}>
          {state.ok}
        </span>
      )}
    </form>
  );
}

export function StatusForm({
  sourceId,
  status,
}: {
  sourceId: string;
  status: "active" | "paused" | "broken";
}) {
  const next = status === "active" ? "paused" : "active";
  return (
    <form action={setSourceStatusAction}>
      <input type="hidden" name="sourceId" value={sourceId} />
      <input type="hidden" name="status" value={next} />
      <button type="submit" className="btn-quiet btn-quiet-sm">
        {next === "paused" ? "Pause" : "Return to rotation"}
      </button>
    </form>
  );
}
