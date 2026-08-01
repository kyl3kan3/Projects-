"use client";

/**
 * Publish, with the version stamp appearing in place (DESIGN.md: "publishing shows
 * the mono version stamp"). A client component only so the pending state and the
 * server's refusal can be shown without a page flash.
 */

import { useActionState } from "react";
import { publishFormAction, type BuilderState } from "../actions";
import { IconAlert, IconCheck } from "@/components/icons";

export function PublishButton({
  formId,
  blocked,
  version,
}: {
  formId: string;
  blocked: boolean;
  version: number;
}) {
  const [state, formAction, pending] = useActionState<BuilderState, FormData>(publishFormAction, {
    error: null,
  });

  return (
    <form action={formAction}>
      <input type="hidden" name="formId" value={formId} />
      <button className="btn btn-primary btn-full" type="submit" disabled={blocked || pending}>
        {pending
          ? "Publishing…"
          : version > 0
            ? `Publish version ${version + 1}`
            : "Publish version 1"}
      </button>
      {state.error && (
        <p
          className="mt-2 flex items-start gap-2 text-[13px] leading-[1.45]"
          style={{ color: "var(--color-clay)" }}
          role="alert"
        >
          <IconAlert size={18} />
          <span>{state.error}</span>
        </p>
      )}
      {!state.error && version > 0 && (
        <p
          className="t-data mt-2 flex items-center gap-2"
          style={{ color: "var(--color-moss)" }}
        >
          <IconCheck size={16} />
          V{version} IS LIVE
        </p>
      )}
    </form>
  );
}
