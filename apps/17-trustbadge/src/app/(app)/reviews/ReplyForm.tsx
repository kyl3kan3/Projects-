"use client";

import { useActionState, useState } from "react";
import { IconReply } from "@/components/icons";
import { replyAction, type ModerationState } from "./actions";

/**
 * Replying to a review. Collapsed by default — a merchant working a queue of
 * twelve should see twelve cards, not twelve textareas.
 */
export function ReplyForm({ reviewId, existing }: { reviewId: string; existing: string | null }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ModerationState, FormData>(replyAction, {});

  if (!open) {
    return (
      <button type="button" className="btn-quiet mt-3 inline-flex items-center gap-1.5" onClick={() => setOpen(true)}>
        <IconReply size={16} />
        {existing ? "Edit your reply" : "Reply"}
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="id" value={reviewId} />
      <label className="t-label" htmlFor={`reply-${reviewId}`}>
        Your reply, shown with the review
      </label>
      <textarea
        id={`reply-${reviewId}`}
        name="reply"
        className="input"
        defaultValue={existing ?? ""}
        maxLength={800}
        placeholder="Thank you — the flax comes from a mill in Kortrijk."
        required
      />
      {state.error ? (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-red)" }}>
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="t-secondary" role="status" style={{ color: "var(--color-leaf)" }}>
          {state.ok}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Publish reply"}
        </button>
        <button className="btn btn-secondary" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
