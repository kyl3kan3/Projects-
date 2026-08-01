"use client";

import { useActionState } from "react";
import { IconPlus } from "@/components/icons";
import { buildDraftsAction, type PoState } from "./actions";

const initial: PoState = { error: null, note: null };

export function BuildDraftsButton({ label }: { label: string }) {
  const [state, action, pending] = useActionState(buildDraftsAction, initial);

  return (
    <form action={action} className="flex flex-col gap-2">
      <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
        <IconPlus size={18} />
        {pending ? "Grouping by supplier…" : label}
      </button>
      {state.note ? (
        <p className="t-secondary" role="status">
          {state.note}
        </p>
      ) : null}
      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-rust)" }} role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
