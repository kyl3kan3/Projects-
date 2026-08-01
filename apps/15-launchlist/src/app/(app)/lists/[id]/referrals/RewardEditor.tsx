"use client";

import { useActionState, useTransition } from "react";
import { addRewardAction, removeRewardAction, type FormState } from "../../actions";
import { IconPlus, IconX } from "@/components/icons";

export function AddRewardForm({ listId }: { listId: string }) {
  const action = addRewardAction.bind(null, listId);
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 8, width: 108, flex: "none" }}>
          <span className="t-label">Referrals</span>
          <input
            className="input input-mono"
            name="threshold"
            type="number"
            min={1}
            max={1000}
            required
            placeholder="5"
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 0 }}>
          <span className="t-label">Tier name</span>
          <input className="input" name="label" required maxLength={40} placeholder="Beta group" />
        </label>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="t-label">What they get</span>
        <input
          className="input"
          name="description"
          maxLength={140}
          placeholder="First access to the beta, two weeks before launch."
        />
      </label>

      {state.error ? (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-red)" }}>
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="t-secondary" role="status" style={{ color: "var(--color-mint)" }}>
          {state.ok}
        </p>
      ) : null}

      <button type="submit" className="btn btn-secondary btn-full" disabled={pending}>
        <IconPlus size={18} />
        {pending ? "Adding…" : "Add a tier"}
      </button>
    </form>
  );
}

export function RemoveRewardButton({
  listId,
  rewardId,
  label,
}: {
  listId: string;
  rewardId: string;
  label: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-secondary"
      style={{ height: 44, padding: "0 12px", flex: "none" }}
      aria-label={`Remove ${label}`}
      disabled={pending}
      onClick={() => start(() => removeRewardAction(listId, rewardId))}
    >
      <IconX size={18} />
    </button>
  );
}
