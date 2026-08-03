"use client";

import { useActionState, useState } from "react";
import { IconAlert, IconChevronDown, IconX } from "@/components/icons";
import { createBudgetAction, deleteBudgetAction, type BudgetState } from "./actions";

/**
 * The budget form. The scope picker offers the services and tag pairs actually
 * seen in this org's cost data, so nobody has to guess how AWS spells
 * "Amazon Elastic Compute Cloud - Compute" — but the field stays free-text for a
 * service that has not been billed yet.
 */
export function NewBudgetForm({
  services,
  tagPairs,
  accounts,
  disabled,
}: {
  services: string[];
  tagPairs: string[];
  accounts: Array<{ id: string; label: string }>;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState<BudgetState, FormData>(
    createBudgetAction,
    {},
  );
  const [scope, setScope] = useState<"service" | "tag" | "account">("tag");
  // React resets the form after the action; these bring the typed values back.
  const kept = state.values ?? {};

  const options =
    scope === "service" ? services : scope === "tag" ? tagPairs : accounts.map((a) => a.label);
  const values =
    scope === "account" ? accounts.map((a) => a.id) : options;

  return (
    <form action={formAction} style={{ display: "grid", gap: 16 }}>
      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Name</span>
        <input
          className="field"
          name="name"
          defaultValue={kept.name ?? ""}
          placeholder="Platform team"
          required
          disabled={disabled}
        />
      </label>

      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Covers</span>
        <span style={{ position: "relative", display: "block" }}>
          <select
            className="field"
            name="scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
            disabled={disabled}
          >
            <option value="tag">A tag (team or environment)</option>
            <option value="service">One service</option>
            <option value="account">A whole AWS account</option>
          </select>
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              right: 12,
              top: 14,
              color: "var(--color-text-3)",
              pointerEvents: "none",
            }}
          >
            <IconChevronDown size={20} />
          </span>
        </span>
      </label>

      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">
          {scope === "tag" ? "Tag pair" : scope === "service" ? "Service" : "Account"}
        </span>
        {values.length ? (
          <span style={{ position: "relative", display: "block" }}>
            <select
              className="field field-mono"
              name="scopeValue"
              defaultValue={kept.scopeValue}
              disabled={disabled}
              required
            >
              {options.map((label, i) => (
                <option key={values[i]} value={values[i]}>
                  {label}
                </option>
              ))}
            </select>
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                right: 12,
                top: 14,
                color: "var(--color-text-3)",
                pointerEvents: "none",
              }}
            >
              <IconChevronDown size={20} />
            </span>
          </span>
        ) : (
          <input
            className="field field-mono"
            name="scopeValue"
            defaultValue={kept.scopeValue ?? ""}
            placeholder={scope === "tag" ? "Team=platform" : "Amazon Elastic Compute Cloud - Compute"}
            required
            disabled={disabled}
          />
        )}
        {values.length === 0 ? (
          <span className="t-secondary">
            No cost data yet for this org, so type the value you expect to see.
          </span>
        ) : null}
      </label>

      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Monthly limit (USD)</span>
        <input
          className="field field-mono"
          name="monthlyLimit"
          defaultValue={kept.monthlyLimit ?? ""}
          inputMode="decimal"
          placeholder="4000"
          required
          disabled={disabled}
        />
      </label>

      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Alert at (% of limit)</span>
        <input
          className="field field-mono"
          name="thresholds"
          defaultValue={kept.thresholds ?? "80,100"}
          placeholder="80,100"
          disabled={disabled}
        />
        <span className="t-secondary">
          One alert per rung per month, and the tightest crossed rung is the one you
          hear about.
        </span>
      </label>

      {state.error ? (
        <p
          className="t-secondary"
          role="alert"
          style={{ color: "var(--color-amber)", display: "flex", gap: 8 }}
        >
          <IconAlert size={18} />
          <span>{state.error}</span>
        </p>
      ) : null}

      <button className="btn btn-primary btn-full" type="submit" disabled={pending || disabled}>
        {pending ? "Saving…" : "Add budget"}
      </button>
    </form>
  );
}

export function DeleteBudgetButton({ budgetId, name }: { budgetId: string; name: string }) {
  const [, formAction, pending] = useActionState<BudgetState, FormData>(deleteBudgetAction, {});
  return (
    <form action={formAction} style={{ flex: "none" }}>
      <input type="hidden" name="budgetId" value={budgetId} />
      <button
        type="submit"
        aria-label={`Delete budget ${name}`}
        disabled={pending}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 44,
          height: 44,
          background: "none",
          border: 0,
          color: "var(--color-text-3)",
        }}
      >
        <IconX size={18} />
      </button>
    </form>
  );
}
