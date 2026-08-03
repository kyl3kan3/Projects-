"use client";

/**
 * Watch / unwatch a jurisdiction. Small client island so the plan-limit message
 * can appear next to the control that hit the limit, instead of a redirect that
 * loses the user's place.
 */

import { useActionState } from "react";
import { toggleWatchAction, type WatchState } from "@/app/(app)/jurisdictions/actions";
import { IconBell } from "@/components/icons";

const initial: WatchState = { error: null };

export function WatchButton({
  jurisdictionId,
  slug,
  watched,
  variant = "quiet",
}: {
  jurisdictionId: string;
  slug: string;
  watched: boolean;
  variant?: "quiet" | "primary";
}) {
  const [state, action, pending] = useActionState(toggleWatchAction, initial);

  return (
    <form action={action}>
      <input type="hidden" name="jurisdictionId" value={jurisdictionId} />
      <input type="hidden" name="slug" value={slug} />
      <button
        type="submit"
        className={variant === "primary" ? "btn btn-primary btn-full" : "btn-quiet btn-quiet-sm"}
        disabled={pending}
        aria-pressed={watched}
      >
        {variant === "quiet" && <IconBell size={16} />}
        {pending ? "Saving…" : watched ? "Watching — stop" : "Watch for rule changes"}
      </button>
      {state.error && (
        <p className="t-secondary mt-2" role="alert" style={{ color: "var(--color-signal-red)" }}>
          {state.error}
        </p>
      )}
    </form>
  );
}
