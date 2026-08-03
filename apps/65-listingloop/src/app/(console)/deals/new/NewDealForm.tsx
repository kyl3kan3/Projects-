"use client";

import { useActionState, useState } from "react";
import { openDealAction, type FormState } from "../actions";
import { CONTRACT_TYPE_LABELS } from "@/lib/templates";
import type { ContractType } from "@/db/schema";

const initial: FormState = { error: null };

/**
 * React 19 resets an uncontrolled form after its action returns, so the values
 * the action echoed back are fed to `defaultValue` and the reset restores them.
 * Without this, one unreadable price wiped a form with fourteen fields in it.
 */
function kept(state: FormState, key: string, fallback = ""): string {
  return state.values?.[key] ?? fallback;
}

export interface TemplateOption {
  id: string;
  name: string;
  contractType: ContractType;
  datedCount: number;
  taskCount: number;
}

const PARTY_FIELDS = [
  { role: "buyer", label: "Buyer" },
  { role: "seller", label: "Seller" },
  { role: "buyer_agent", label: "Buyer's agent" },
  { role: "listing_agent", label: "Listing agent" },
  { role: "lender", label: "Lender" },
  { role: "title", label: "Title / escrow" },
  { role: "tc", label: "Coordinator" },
] as const;

export function NewDealForm({
  templates,
  defaultCoordinator,
}: {
  templates: TemplateOption[];
  defaultCoordinator: { name: string; email: string };
}) {
  const [state, action, pending] = useActionState(openDealAction, initial);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const chosen = templates.find((t) => t.id === templateId) ?? templates[0];

  return (
    <form action={action} noValidate>
      <label className="field">
        <span className="field-label">Property address</span>
        <input
          className="input"
          name="address"
          required
          placeholder="412 Pecan Grove Ln, Round Rock, TX 78664"
          defaultValue={kept(state, "address")}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field">
          <span className="field-label">MLS number</span>
          <input
            className="input input-mono"
            name="mlsNumber"
            placeholder="TX-4471902"
            defaultValue={kept(state, "mlsNumber")}
          />
        </label>
        <label className="field">
          <span className="field-label">Sale price</span>
          <input
            className="input input-mono"
            name="price"
            placeholder="438,000"
            inputMode="decimal"
            defaultValue={kept(state, "price")}
          />
        </label>
      </div>

      <fieldset className="field border-0 p-0">
        <legend className="field-label">Checklist</legend>
        <select
          className="input"
          name="templateId"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          required
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {chosen ? (
          <p className="field-help">
            {chosen.taskCount} tasks, {chosen.datedCount} of them with a date rule —{" "}
            {CONTRACT_TYPE_LABELS[chosen.contractType]}.
          </p>
        ) : null}
        <input type="hidden" name="contractType" value={chosen?.contractType ?? "buyer"} />
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="field">
          <span className="field-label">Contract date</span>
          <input
            className="input input-mono"
            name="contractDate"
            type="date"
            required
            defaultValue={kept(state, "contractDate")}
          />
        </label>
        <label className="field">
          <span className="field-label">Acceptance date</span>
          <input
            className="input input-mono"
            name="acceptanceDate"
            type="date"
            defaultValue={kept(state, "acceptanceDate")}
          />
          <span className="field-help">Blank uses the contract date.</span>
        </label>
        <label className="field">
          <span className="field-label">Closing date</span>
          <input
            className="input input-mono"
            name="closingDate"
            type="date"
            defaultValue={kept(state, "closingDate")}
          />
          <span className="field-help">
            Leave it blank and closing-relative deadlines will say &ldquo;needs a date&rdquo; until
            you set it.
          </span>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field">
          <span className="field-label">Commission rate</span>
          <input
            className="input input-mono"
            name="rate"
            placeholder="2.5"
            inputMode="decimal"
            defaultValue={kept(state, "rate")}
          />
          <span className="field-help">Percent of the sale price.</span>
        </label>
        <label className="field">
          <span className="field-label">Your coordination fee</span>
          <input
            className="input input-mono"
            name="tcFee"
            placeholder="450"
            inputMode="decimal"
            defaultValue={kept(state, "tcFee")}
          />
        </label>
      </div>

      <fieldset className="mt-6 border-0 p-0">
        <legend className="t-h2">Who is on this file</legend>
        <p className="t-secondary mt-1">
          A name is enough to start. An email is what a reminder needs — parties with no address
          are listed on the file but never written to.
        </p>
        <div className="mt-4">
          {PARTY_FIELDS.map((p) => (
            <div key={p.role} className="hairline-b grid gap-3 py-3 sm:grid-cols-2">
              <label className="block">
                <span className="field-label">{p.label}</span>
                <input
                  className="input"
                  name={`party_${p.role}_name`}
                  placeholder="Name"
                  defaultValue={kept(
                    state,
                    `party_${p.role}_name`,
                    p.role === "tc" ? defaultCoordinator.name : "",
                  )}
                />
              </label>
              <label className="block">
                <span className="field-label sm:sr-only">{p.label} email</span>
                <input
                  className="input"
                  name={`party_${p.role}_email`}
                  type="email"
                  placeholder="Email"
                  defaultValue={kept(
                    state,
                    `party_${p.role}_email`,
                    p.role === "tc" ? defaultCoordinator.email : "",
                  )}
                />
              </label>
            </div>
          ))}
        </div>
      </fieldset>

      {state.error ? (
        <p className="field-error mt-4" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="sticky bottom-[calc(var(--tabbar-h)+12px)] mt-8 lg:static">
        <button className="btn btn-primary btn-full" type="submit" disabled={pending || !templateId}>
          {pending ? "Computing the timeline…" : "Open the file and compute the dates"}
        </button>
      </div>
    </form>
  );
}
