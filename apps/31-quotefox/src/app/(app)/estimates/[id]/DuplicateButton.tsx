"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconAlert, IconPencil } from "@/components/icons";
import { duplicateEstimateAction } from "./actions";

/**
 * Re-quote a sent estimate.
 *
 * A sent version is frozen because a homeowner is looking at it, so changing the
 * job means a new version — which is what this does, carrying the rows over so the
 * contractor edits rather than retypes.
 */
export function DuplicateButton({ estimateId, nextVersion }: { estimateId: string; nextVersion: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        className="btn-quiet"
        style={{ paddingLeft: 0 }}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await duplicateEstimateAction(estimateId);
            if (result.error) setError(result.error);
            else if (result.estimateId) router.push(`/estimates/${result.estimateId}`);
          })
        }
      >
        <IconPencil size={18} />
        {pending ? "Copying…" : `Start version ${nextVersion}`}
      </button>
      {error ? (
        <p
          className="t-secondary"
          role="alert"
          style={{ color: "var(--color-red)", display: "flex", gap: 8, marginTop: 8 }}
        >
          <IconAlert size={18} style={{ flex: "none" }} />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
