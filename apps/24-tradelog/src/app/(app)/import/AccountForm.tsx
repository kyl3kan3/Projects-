"use client";

import { useActionState } from "react";
import { createAccountAction, type AccountFormState } from "./actions";
import { IconPlus } from "@/components/icons";

export function AccountForm({
  brokers,
}: {
  brokers: { id: string; label: string; hint: string }[];
}) {
  const [state, formAction, pending] = useActionState<AccountFormState, FormData>(
    createAccountAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="t-label">Account name</span>
        <input className="input" name="label" required placeholder="Schwab · main" maxLength={60} />
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">Broker</span>
        <select className="input" name="broker" defaultValue={brokers[0]?.id}>
          {brokers.map((broker) => (
            <option key={broker.id} value={broker.id}>
              {broker.label}
            </option>
          ))}
          <option value="manual">Something else (CSV only)</option>
        </select>
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">Currency</span>
        <input className="input input-mono" name="currency" defaultValue="USD" maxLength={8} />
      </label>

      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-loss)" }} role="alert">
          {state.error}
        </p>
      ) : null}

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        <IconPlus size={16} />
        {pending ? "Adding…" : "Add account"}
      </button>
    </form>
  );
}
