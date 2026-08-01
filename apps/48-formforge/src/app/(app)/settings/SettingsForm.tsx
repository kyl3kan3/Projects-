"use client";

/**
 * Quiet hours, the reminder ladder, link lifetime and retention.
 *
 * The ladder is entered as a comma-separated list of hours after send. That is
 * blunt on purpose: three numbers a practice can read out loud beat a builder UI
 * that hides which rung fires when, and the validator rejects rungs less than 24
 * hours apart.
 */

import { useActionState } from "react";
import { saveSettingsAction, type SettingsState } from "./actions";
import type { PracticeSettings } from "@/db/schema";
import { IconAlert, IconCheck } from "@/components/icons";

export function SettingsForm({ settings }: { settings: PracticeSettings }) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(saveSettingsAction, {
    error: null,
    saved: false,
  });

  // On a rejected save the action hands back what was typed; React would otherwise
  // reset every field to the stored value and quietly discard the edit.
  const v = (name: string, fallback: string | number) =>
    state.values?.[name] ?? String(fallback);

  return (
    <form action={formAction}>
      <label className="field">
        <span className="field-label">Time zone</span>
        <input className="input" name="timeZone" defaultValue={v("timeZone", settings.timeZone)} required />
        <span className="field-help">
          An IANA name, e.g. America/New_York. Quiet hours and every timestamp on screen are read in
          this zone.
        </span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="field">
          <span className="field-label">Quiet hours start</span>
          <input className="input input-mono" name="quietStart" defaultValue={v("quietStart", settings.quietStart)} required />
        </label>
        <label className="field">
          <span className="field-label">Quiet hours end</span>
          <input className="input input-mono" name="quietEnd" defaultValue={v("quietEnd", settings.quietEnd)} required />
        </label>
      </div>

      <label className="field">
        <span className="field-label">Reminder ladder (hours after sending)</span>
        <input
          className="input input-mono"
          name="reminderHours"
          defaultValue={v("reminderHours", settings.reminderHours.join(", "))}
          required
        />
        <span className="field-help">
          At most five rungs, at least 24 hours apart. Every rung is scheduled once, at a fixed
          distance from the send, and the whole ladder stops the moment the packet is finished.
        </span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="field">
          <span className="field-label">Link lifetime (days)</span>
          <input
            className="input input-mono"
            name="linkDays"
            type="number"
            min={1}
            max={365}
            defaultValue={v("linkDays", settings.linkDays)}
            required
          />
        </label>
        <label className="field">
          <span className="field-label">Retention (years)</span>
          <input
            className="input input-mono"
            name="retentionYears"
            type="number"
            min={1}
            max={30}
            defaultValue={v("retentionYears", settings.retentionYears)}
            required
          />
        </label>
      </div>
      <p className="field-help" style={{ marginTop: -12, marginBottom: 20 }}>
        The daily sweep hard-deletes packets older than the retention window, along with their
        answers, signatures and files, and records the deletion by count.
      </p>

      <label className="choice mb-2">
        <input
          type="checkbox"
          name="notifyOnRiskFlag"
          defaultChecked={settings.notifyOnRiskFlag}
          style={{ width: 20, height: 20, accentColor: "var(--color-teal)" }}
        />
        <span className="choice-label">Email the clinician when PHQ-9 item 9 is above zero</span>
      </label>
      <label className="choice mb-6">
        <input
          type="checkbox"
          name="hideScoresFromFrontDesk"
          defaultChecked={settings.hideScoresFromFrontDesk}
          style={{ width: 20, height: 20, accentColor: "var(--color-teal)" }}
        />
        <span className="choice-label">Hide screener scores from the front-desk role</span>
      </label>

      {state.error && (
        <p
          className="mb-4 flex items-start gap-2 text-[13px] leading-[1.45]"
          style={{ color: "var(--color-clay)" }}
          role="alert"
        >
          <IconAlert size={18} />
          <span>{state.error}</span>
        </p>
      )}
      {state.saved && !state.error && (
        <p
          className="mb-4 flex items-center gap-2 text-[13px]"
          style={{ color: "var(--color-moss)" }}
          role="status"
        >
          <IconCheck size={18} />
          Saved
        </p>
      )}

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
