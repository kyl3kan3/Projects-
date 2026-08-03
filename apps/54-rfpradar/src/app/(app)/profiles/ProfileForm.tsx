"use client";

/**
 * The keyword-profile form.
 *
 * Everything is comma-separated free text on purpose: a firm knows its own NAICS
 * codes and the phrases it wins on, and a code picker with 1,057 options is a
 * worse experience than a text field it can paste into.
 *
 * Negative keywords sit next to keywords rather than in an "advanced" drawer,
 * because they are the difference between a feed worth reading and a feed that
 * gets muted in a week.
 */

import { useActionState } from "react";
import type { KeywordProfile } from "@/db/schema";
import { saveProfileAction, type ProfileFormState } from "./actions";

function dollars(cents: number | null | undefined): string {
  if (typeof cents !== "number") return "";
  return String(Math.round(cents) / 100);
}

export function ProfileForm({ profile }: { profile?: KeywordProfile }) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(saveProfileAction, {
    error: null,
    notice: null,
  });
  const band = (profile?.valueBand ?? null) as { minCents?: number; maxCents?: number } | null;

  return (
    <form action={action} className="flex flex-col gap-4">
      {profile && <input type="hidden" name="id" value={profile.id} />}

      <label className="flex flex-col gap-2">
        <span className="t-label">Profile name</span>
        <input
          className="input"
          name="name"
          required
          defaultValue={profile?.name ?? ""}
          placeholder="Managed IT — VA/MD"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">Keywords</span>
        <textarea
          className="textarea"
          name="keywords"
          rows={3}
          defaultValue={profile?.keywords.join(", ") ?? ""}
          placeholder="managed detection, endpoint detection, security operations"
        />
        <span className="t-secondary">
          Comma-separated phrases. Each one becomes its own scoring factor, and the reason names
          where it was found.
        </span>
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">Negative keywords</span>
        <textarea
          className="textarea"
          name="negativeKeywords"
          rows={2}
          defaultValue={profile?.negativeKeywords.join(", ") ?? ""}
          placeholder="staffing, janitorial, construction"
        />
        <span className="t-secondary">
          Any hit vetoes the notice outright — score 0, suppressed, with the word that did it named
          in the reasons.
        </span>
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="t-label">NAICS codes</span>
          <input
            className="input"
            name="naicsCodes"
            defaultValue={profile?.naicsCodes.join(", ") ?? ""}
            placeholder="541512, 541519"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-label">PSC codes</span>
          <input
            className="input"
            name="pscCodes"
            defaultValue={profile?.pscCodes.join(", ") ?? ""}
            placeholder="D310, D302"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-label">States (US = federal)</span>
          <input
            className="input"
            name="states"
            defaultValue={profile?.states.join(", ") ?? ""}
            placeholder="VA, MD, US"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-label">Agencies of interest</span>
          <input
            className="input"
            name="agencies"
            defaultValue={profile?.agencies.join(", ") ?? ""}
            placeholder="Department of the Army, Virginia Department of General Services"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-label">Minimum contract value ($)</span>
          <input
            className="input"
            name="minValue"
            inputMode="decimal"
            defaultValue={dollars(band?.minCents)}
            placeholder="250000"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-label">Maximum contract value ($)</span>
          <input
            className="input"
            name="maxValue"
            inputMode="decimal"
            defaultValue={dollars(band?.maxCents)}
            placeholder="5000000"
          />
        </label>
      </div>

      {state.error && (
        <p role="alert" className="t-secondary" style={{ color: "var(--color-red)" }}>
          {state.error}
        </p>
      )}
      {state.notice && (
        <p role="status" className="t-secondary" style={{ color: "var(--color-green-text)" }}>
          {state.notice}
        </p>
      )}

      <button className="btn btn-primary w-full" type="submit" disabled={pending}>
        {pending ? "Scoring…" : profile ? "Save and rescore" : "Create profile and score it now"}
      </button>
    </form>
  );
}
