"use client";

/**
 * New job. Address first, because the address decides the authority and the
 * authority decides everything else.
 *
 * The jurisdiction is never chosen silently: candidates come back with the reason
 * each one appeared and the office picks. The full covered list stays available
 * underneath for the cases the matcher cannot see (annexations, tribal land, a
 * parcel that sits outside the city it collects mail in).
 */

import { useActionState, useState, useTransition } from "react";
import {
  createJobAction,
  suggestJurisdictionsAction,
  type FormState,
  type SuggestionView,
} from "../actions";
import { JOB_TYPES, JOB_TYPE_META } from "@/lib/taxonomy";

const initial: FormState = { error: null };

export interface JurisdictionOption {
  id: string;
  name: string;
  departmentName: string;
  coverage: string;
  recordCount: number;
}

export function NewJobForm({
  options,
  members,
}: {
  options: JurisdictionOption[];
  members: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(createJobAction, initial);
  const [address, setAddress] = useState("");
  const [jobType, setJobType] = useState<string>("hvac_changeout");
  const [jurisdictionId, setJurisdictionId] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestionView[] | null>(null);
  const [looking, startLooking] = useTransition();

  function findJurisdiction(): void {
    startLooking(async () => {
      const found = await suggestJurisdictionsAction(address);
      setSuggestions(found);
      if (found.length === 1) setJurisdictionId(found[0].id);
    });
  }

  const chosen = options.find((o) => o.id === jurisdictionId) ?? null;

  return (
    <form action={action} className="flex flex-col gap-5">
      <label className="block">
        <span className="t-label">Job site address</span>
        <input
          className="input mt-2"
          name="siteAddress"
          required
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="2214 E Juniper Ave, Mesa, AZ 85205"
          autoComplete="street-address"
        />
      </label>

      <div>
        <button
          type="button"
          className="btn btn-secondary btn-full"
          onClick={findJurisdiction}
          disabled={looking || address.trim().length < 6}
        >
          {looking ? "Checking…" : "Find the jurisdiction"}
        </button>

        {suggestions !== null && suggestions.length === 0 && (
          <p className="t-secondary mt-3">
            No authority matched that address. Pick it from the covered list below — city limits are
            not obvious, and guessing is how a permit gets pulled from the wrong counter.
          </p>
        )}

        {suggestions !== null && suggestions.length > 0 && (
          <ul className="mt-2">
            {suggestions.map((suggestion) => (
              <li key={suggestion.id}>
                <button
                  type="button"
                  className="row row-tap"
                  onClick={() => setJurisdictionId(suggestion.id)}
                  aria-pressed={jurisdictionId === suggestion.id}
                >
                  <span className="min-w-0 flex-1">
                    <span className="t-title block">{suggestion.name}</span>
                    <span className="t-secondary block">{suggestion.reason}</span>
                  </span>
                  <span
                    className="t-data shrink-0"
                    style={{
                      color:
                        jurisdictionId === suggestion.id
                          ? "var(--color-brick)"
                          : "var(--color-fg-3)",
                    }}
                  >
                    {jurisdictionId === suggestion.id ? "selected" : suggestion.confidence}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="block">
        <span className="t-label">Jurisdiction</span>
        <select
          className="input mt-2"
          name="jurisdictionId"
          required
          value={jurisdictionId}
          onChange={(event) => setJurisdictionId(event.target.value)}
        >
          <option value="">Choose the authority having jurisdiction</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name} — {option.recordCount} records
            </option>
          ))}
        </select>
        {chosen && (
          <span className="t-secondary mt-2 block">
            {chosen.departmentName} · coverage {chosen.coverage}
          </span>
        )}
      </label>

      <fieldset>
        <legend className="t-label">Job type</legend>
        <div className="chiprow mt-2">
          {JOB_TYPES.map((code) => (
            <button
              key={code}
              type="button"
              className="chip"
              data-active={jobType === code}
              onClick={() => setJobType(code)}
              aria-pressed={jobType === code}
            >
              {JOB_TYPE_META[code].label}
            </button>
          ))}
        </div>
        <input type="hidden" name="jobType" value={jobType} />
        <p className="t-secondary mt-2">{JOB_TYPE_META[jobType as keyof typeof JOB_TYPE_META]?.scope}</p>
      </fieldset>

      <label className="block">
        <span className="t-label">Job label (optional)</span>
        <input className="input mt-2" name="label" placeholder="Contreras — 3-ton changeout" />
      </label>

      {members.length > 1 && (
        <label className="block">
          <span className="t-label">Assign to</span>
          <select className="input mt-2" name="assignedUserId" defaultValue="">
            <option value="">Nobody yet</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block">
        <span className="t-label">Notes (optional)</span>
        <textarea
          className="input mt-2"
          name="notes"
          placeholder="Homeowner works nights — inspection after 11am only"
        />
      </label>

      {state.error && (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-signal-red)" }}>
          {state.error}
        </p>
      )}

      <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
        {pending ? "Generating checklist…" : "Generate the checklist"}
      </button>
    </form>
  );
}
