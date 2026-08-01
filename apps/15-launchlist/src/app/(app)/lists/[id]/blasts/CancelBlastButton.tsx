"use client";

import { useTransition } from "react";
import { cancelBlastAction } from "../../actions";

export function CancelBlastButton({ listId, blastId }: { listId: string; blastId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-secondary"
      style={{ height: 44, padding: "0 12px", flex: "none" }}
      disabled={pending}
      onClick={() => start(() => cancelBlastAction(listId, blastId))}
    >
      {pending ? "…" : "Cancel"}
    </button>
  );
}
