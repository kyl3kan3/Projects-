"use client";

/**
 * The live status poll for rows that are still being extracted.
 *
 * Only mounted when something is actually in flight, and it stops on its own after
 * roughly two minutes — a poll that runs forever on an idle inbox is a battery bug.
 * It refreshes the server component rather than fetching a shape of its own, so there
 * is one renderer for a document row and no second source of truth about its status.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const INTERVAL_MS = 2_500;
const MAX_TICKS = 48;

export function StatusPoll({ pending }: { pending: number }) {
  const router = useRouter();
  const [ticks, setTicks] = useState(0);

  useEffect(() => {
    if (pending === 0 || ticks >= MAX_TICKS) return;
    const id = setTimeout(() => {
      setTicks((t) => t + 1);
      router.refresh();
    }, INTERVAL_MS);
    return () => clearTimeout(id);
  }, [pending, ticks, router]);

  if (pending === 0) return null;
  return (
    <span className="sr-only" role="status" aria-live="polite">
      {pending} {pending === 1 ? "document is" : "documents are"} still being read.
    </span>
  );
}
