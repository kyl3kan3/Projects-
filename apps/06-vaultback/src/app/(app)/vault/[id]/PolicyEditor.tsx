"use client";

/**
 * The backup policy editor.
 *
 * Frequency, retention and drill cadence are chips rather than selects: there are
 * three or four choices each, and a chip row states the whole ladder — including
 * the options this plan cannot have, disabled and labelled, which is a better
 * upsell than hiding them.
 */

import { useActionState, useState } from "react";
import type { BackupPolicy, DrillFrequency, Frequency, PlanId, StorageTarget } from "@/db/schema";
import { COMMON_TIMEZONES } from "@/lib/timezones";
import { plan } from "@/lib/plans";
import { IconCheck } from "@/components/icons";
import type { PolicyFormState } from "../actions";

const RETENTION_STEPS = [7, 30, 90, 365];
const DRILLS: DrillFrequency[] = ["none", "monthly", "weekly"];

export function PolicyEditor({
  policy,
  connectionId,
  planId,
  targets,
  hour,
  minute,
  action,
}: {
  policy: BackupPolicy;
  connectionId: string;
  planId: PlanId;
  targets: StorageTarget[];
  hour: number;
  minute: number;
  action: (prev: PolicyFormState, form: FormData) => Promise<PolicyFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const limits = plan(planId);

  const [frequency, setFrequency] = useState<Frequency>(policy.frequency);
  const [retention, setRetention] = useState(policy.retentionDays);
  const [drill, setDrill] = useState<DrillFrequency>(policy.drillFrequency);
  const [enabled, setEnabled] = useState(policy.enabled);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="policyId" value={policy.id} />
      <input type="hidden" name="connectionId" value={connectionId} />
      <input type="hidden" name="frequency" value={frequency} />
      <input type="hidden" name="retentionDays" value={retention} />
      <input type="hidden" name="drillFrequency" value={drill} />

      <div>
        <p className="t-label mb-3">Frequency</p>
        <div className="flex gap-2">
          {(["hourly", "daily"] as Frequency[]).map((option) => {
            const blocked = option === "hourly" && limits.maxFrequency === "daily";
            return (
              <button
                key={option}
                type="button"
                className="chip"
                aria-pressed={frequency === option}
                disabled={blocked}
                onClick={() => setFrequency(option)}
                title={blocked ? "Hourly backups start on Startup" : undefined}
              >
                {option === "hourly" ? "Hourly" : "Daily"}
                {blocked ? " · Startup" : ""}
              </button>
            );
          })}
        </div>
      </div>

      <div className={frequency === "hourly" ? "opacity-60" : ""}>
        <p className="t-label mb-3">Time of day</p>
        <div className="flex items-center gap-2">
          <input
            className="input input-mono"
            style={{ width: 84 }}
            name="hour"
            type="number"
            min={0}
            max={23}
            defaultValue={hour}
            disabled={frequency === "hourly"}
            aria-label="Hour"
          />
          <span className="t-data" style={{ color: "var(--color-text-3)" }}>
            :
          </span>
          <input
            className="input input-mono"
            style={{ width: 84 }}
            name="minute"
            type="number"
            min={0}
            max={59}
            defaultValue={minute}
            aria-label="Minute"
          />
          <select
            className="input"
            name="timezone"
            defaultValue={policy.timezone}
            aria-label="Timezone"
          >
            {COMMON_TIMEZONES.includes(policy.timezone as (typeof COMMON_TIMEZONES)[number]) ? null : (
              <option value={policy.timezone}>{policy.timezone}</option>
            )}
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
        <p className="t-secondary mt-2">
          {frequency === "hourly"
            ? "Hourly backups run every hour at the minute you set."
            : "Daily backups run at this local time, so summer time does not move your window."}
        </p>
      </div>

      <div>
        <p className="t-label mb-3">Keep snapshots for</p>
        <div className="flex flex-wrap gap-2">
          {RETENTION_STEPS.map((days) => {
            const blocked = days > limits.retentionDays;
            return (
              <button
                key={days}
                type="button"
                className="chip"
                aria-pressed={retention === days}
                disabled={blocked}
                onClick={() => setRetention(days)}
              >
                {days === 365 ? "1 year" : `${days} days`}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="t-label mb-3">Restore drills</p>
        <div className="flex gap-2">
          {DRILLS.map((option) => {
            const blocked =
              (option === "monthly" && limits.maxDrill === "none") ||
              (option === "weekly" && limits.maxDrill !== "weekly");
            return (
              <button
                key={option}
                type="button"
                className="chip"
                aria-pressed={drill === option}
                disabled={blocked}
                onClick={() => setDrill(option)}
              >
                {option === "none" ? "Off" : option === "monthly" ? "Monthly" : "Weekly"}
              </button>
            );
          })}
        </div>
        <p className="t-secondary mt-2">
          A drill restores the newest snapshot into a throwaway database and compares every table's
          row count against the manifest taken at dump time. It is the only thing that proves a
          backup works.
        </p>
      </div>

      <div>
        <p className="t-label mb-3">Storage</p>
        <select className="input" name="storageTargetId" defaultValue={policy.storageTargetId}>
          {targets.map((target) => (
            <option key={target.id} value={target.id} disabled={!target.verifiedAt}>
              {target.name}
              {target.verifiedAt ? "" : " — not verified"}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          name="enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-5 w-5"
          style={{ accentColor: "var(--color-brass)" }}
        />
        <span className="t-body">Run this schedule</span>
      </label>

      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-torch)" }} role="alert">
          {state.error}
        </p>
      ) : null}

      {state.saved ? (
        <div role="status">
          <p className="t-secondary flex items-center gap-2" style={{ color: "var(--color-seal)" }}>
            <IconCheck size={16} />
            Policy saved.
          </p>
          {state.clamped?.length ? (
            <ul className="mt-2 flex flex-col gap-1">
              {state.clamped.map((line) => (
                <li key={line} className="t-secondary" style={{ color: "var(--color-brass)" }}>
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <button className="btn btn-secondary btn-full" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save policy"}
      </button>
    </form>
  );
}
