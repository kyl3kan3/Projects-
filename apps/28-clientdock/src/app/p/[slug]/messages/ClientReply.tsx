"use client";

import { useActionState } from "react";
import { clientReplyAction, type PortalActionState } from "../actions";
import { IconSend } from "@/components/icons";

export function ClientReply({ slug, threadId }: { slug: string; threadId: string }) {
  const [state, formAction, pending] = useActionState<PortalActionState, FormData>(
    clientReplyAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="threadId" value={threadId} />
      <label className="flex flex-col gap-2">
        <span className="t-label">Your reply</span>
        <textarea
          className="input"
          name="body"
          rows={3}
          required
          placeholder="Looks good. One thing on the pricing page…"
        />
      </label>
      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        <IconSend size={18} />
        {pending ? "Sending…" : "Send"}
      </button>
      {state.error ? (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-amber)" }}>
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="t-secondary" style={{ color: "var(--color-green)" }} role="status">
          {state.ok}
        </p>
      ) : null}
    </form>
  );
}
