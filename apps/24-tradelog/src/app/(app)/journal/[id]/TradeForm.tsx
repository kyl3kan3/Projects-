"use client";

/**
 * The journal entry: a stop (which is what makes an R-multiple possible), a
 * setup from the trader's own playbook, emotion tags from a fixed vocabulary, and
 * ruled notes.
 *
 * Emotion tags are Labels in hairline chips — `REVENGE`, `FOMO`, `PLANNED` —
 * never faces. DESIGN.md is explicit and it is the right call: a product that
 * asks a trader to admit they tilted should not put a smiley next to it.
 */

import { useActionState } from "react";
import { EMOTION_TAGS } from "@/db/schema";
import { saveTradeAction, type TradeFormState } from "../actions";
import { IconAlert } from "@/components/icons";

export function TradeForm({
  tradeId,
  stopPrice,
  setupId,
  setups,
  emotionTags,
  notes,
  setupsAllowed,
}: {
  tradeId: string;
  stopPrice: string;
  setupId: string | null;
  setups: { id: string; name: string }[];
  emotionTags: string[];
  notes: string;
  setupsAllowed: boolean;
}) {
  const [state, formAction, pending] = useActionState<TradeFormState, FormData>(saveTradeAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="tradeId" value={tradeId} />

      <label className="flex flex-col gap-2">
        <span className="t-label">Stop price when you entered</span>
        <input
          className="input input-mono"
          name="stopPrice"
          defaultValue={stopPrice}
          inputMode="decimal"
          placeholder="e.g. 240.10"
        />
        <span className="t-secondary">
          The R-multiple is net P&amp;L divided by the distance from your average entry to this stop,
          across the largest position you held. No stop, no R — a made-up denominator is worse than a
          dash.
        </span>
      </label>

      <fieldset className="flex flex-col gap-3">
        <legend className="t-label mb-1">How you felt</legend>
        <div className="flex flex-wrap gap-2">
          {EMOTION_TAGS.map((tag) => (
            <label key={tag} className="chip">
              <input
                type="checkbox"
                name="emotionTags"
                value={tag}
                defaultChecked={emotionTags.includes(tag)}
              />
              {tag}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-2">
        <span className="t-label">Setup</span>
        {setupsAllowed ? (
          <select className="input" name="setupId" defaultValue={setupId ?? "none"}>
            <option value="none">No setup tagged</option>
            {setups.map((setup) => (
              <option key={setup.id} value={setup.id}>
                {setup.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="t-secondary">
            Playbooks and per-setup expectancy are a Trader feature. Your notes and tags are not.
          </span>
        )}
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">Notes</span>
        <textarea
          className="input ruled"
          name="notes"
          defaultValue={notes}
          placeholder="What did you see? What was the plan? Where did you deviate from it?"
        />
      </label>

      {state.error ? (
        <p className="t-secondary flex items-start gap-2" role="alert">
          <IconAlert size={14} className="mt-1 shrink-0" />
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p className="t-secondary" style={{ color: "var(--color-blue)" }} role="status">
          Saved.
        </p>
      ) : null}

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save journal entry"}
      </button>
    </form>
  );
}
