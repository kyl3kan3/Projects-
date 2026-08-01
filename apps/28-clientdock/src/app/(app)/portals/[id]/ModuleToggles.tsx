"use client";

import { useActionState, useState } from "react";
import { setModulesAction, type ActionState } from "../actions";
import { MODULE_COPY } from "@/components/module-copy";
import type { ModuleId } from "@/db/schema";

/** 44px switch rows, hairline-divided (DESIGN.md portal composer). */
export function ModuleToggles({
  portalId,
  enabled,
  allowed,
  gated,
}: {
  portalId: string;
  enabled: ModuleId[];
  allowed: ModuleId[];
  gated: { id: ModuleId; upsell: string }[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(setModulesAction, {});
  const [on, setOn] = useState<Set<string>>(() => new Set(enabled));

  return (
    <form action={formAction}>
      <input type="hidden" name="portalId" value={portalId} />
      {allowed.map((id) => {
        const copy = MODULE_COPY[id];
        return (
          <label key={id} className="row" style={{ minHeight: 44, cursor: "pointer" }}>
            <copy.Icon size={20} style={{ color: "var(--color-ink-2)", flex: "none" }} />
            <span className="min-w-0 flex-1">
              <span className="t-title block">{copy.title}</span>
              <span className="t-secondary block">{copy.blurb}</span>
            </span>
            <input
              type="checkbox"
              name="modules"
              value={id}
              checked={on.has(id)}
              onChange={() =>
                setOn((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              style={{ width: 22, height: 22, accentColor: "var(--color-ink)" }}
            />
          </label>
        );
      })}

      {gated.map(({ id, upsell }) => (
        <p key={id} className="t-secondary py-3" style={{ color: "var(--color-ink-3)" }}>
          {MODULE_COPY[id].title} — {upsell}
        </p>
      ))}

      <button className="btn btn-secondary mt-4" type="submit" disabled={pending} style={{ height: 44 }}>
        {pending ? "Saving…" : "Save modules"}
      </button>
      {state.error ? (
        <p className="t-secondary mt-2" role="alert" style={{ color: "var(--color-amber)" }}>
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="t-secondary mt-2" style={{ color: "var(--color-green)" }}>
          {state.ok}
        </p>
      ) : null}
    </form>
  );
}
