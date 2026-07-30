"use client";

/**
 * Add monitor — one screen, sane defaults, primary action in the thumb zone.
 * "Time-to-first-monitor under 60s is a layout requirement" (DESIGN.md), so the
 * only always-visible fields are the type, the target, and the name. Everything
 * else lives behind one disclosure with defaults that are already correct.
 */

import { useActionState, useState } from "react";
import type { MonitorType } from "@/db/schema";
import type { MonitorFormState } from "../actions";
import { IconGlobe, IconHeartbeat, IconLockSsl, IconPulse } from "@/components/icons";

const TYPES: { id: MonitorType; label: string; Icon: typeof IconPulse }[] = [
  { id: "http", label: "HTTP", Icon: IconPulse },
  { id: "heartbeat", label: "Cron", Icon: IconHeartbeat },
  { id: "ssl", label: "SSL", Icon: IconLockSsl },
  { id: "domain", label: "Domain", Icon: IconGlobe },
];

export function NewMonitorForm({
  action,
  regions,
  minIntervalSeconds,
  maxRegions,
  first,
}: {
  action: (prev: MonitorFormState, form: FormData) => Promise<MonitorFormState>;
  regions: string[];
  minIntervalSeconds: number;
  maxRegions: number;
  first: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [type, setType] = useState<MonitorType>("http");
  const [scheduleKind, setScheduleKind] = useState<"interval" | "cron">("interval");
  const [advanced, setAdvanced] = useState(false);

  const defaultRegions = regions.slice(0, maxRegions);

  return (
    <form action={formAction} className="flex flex-col gap-6 pb-4">
      <input type="hidden" name="type" value={type} />

      <fieldset>
        <legend className="t-label mb-3">What kind of check</legend>
        <div className="flex flex-wrap gap-2">
          {TYPES.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className="chip"
              aria-pressed={type === id}
              onClick={() => setType(id)}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      {type === "heartbeat" ? (
        <>
          <label className="flex flex-col gap-2">
            <span className="t-label">Job name</span>
            <input
              className="input"
              name="name"
              required
              placeholder="nightly-backup"
              defaultValue={first ? "nightly-backup" : ""}
            />
          </label>

          <fieldset>
            <legend className="t-label mb-3">When it should run</legend>
            <div className="flex gap-2">
              <button
                type="button"
                className="chip"
                aria-pressed={scheduleKind === "interval"}
                onClick={() => setScheduleKind("interval")}
              >
                Every N minutes
              </button>
              <button
                type="button"
                className="chip"
                aria-pressed={scheduleKind === "cron"}
                onClick={() => setScheduleKind("cron")}
              >
                Cron expression
              </button>
            </div>
            <input type="hidden" name="scheduleKind" value={scheduleKind} />

            {scheduleKind === "cron" ? (
              <label className="mt-4 flex flex-col gap-2">
                <span className="t-label">Cron (UTC)</span>
                <input
                  className="input input-mono"
                  name="cronExpression"
                  placeholder="0 3 * * *"
                  defaultValue="0 3 * * *"
                  required
                />
                <span className="t-secondary">
                  Five fields, evaluated in UTC. `0 3 * * *` is every day at 03:00.
                </span>
              </label>
            ) : (
              <label className="mt-4 flex flex-col gap-2">
                <span className="t-label">Expected interval</span>
                <select className="input" name="expectedIntervalSeconds" defaultValue="86400">
                  <option value="3600">Every hour</option>
                  <option value="21600">Every 6 hours</option>
                  <option value="86400">Every day</option>
                  <option value="604800">Every week</option>
                </select>
              </label>
            )}

            <label className="mt-4 flex flex-col gap-2">
              <span className="t-label">Grace period</span>
              <select className="input" name="graceSeconds" defaultValue="900">
                <option value="300">5 minutes</option>
                <option value="900">15 minutes</option>
                <option value="3600">1 hour</option>
              </select>
              <span className="t-secondary">
                How late a ping may be before we call it missed. A backup that usually finishes in
                ten minutes wants fifteen.
              </span>
            </label>
          </fieldset>
        </>
      ) : (
        <>
          <label className="flex flex-col gap-2">
            <span className="t-label">
              {type === "http" ? "URL" : type === "ssl" ? "Hostname" : "Domain"}
            </span>
            <input
              className="input input-mono"
              name="target"
              required
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={type === "http" ? "https://api.helvet.ico/health" : "shopfront.dev"}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="t-label">Name</span>
            <input className="input" name="name" required placeholder="Production API" />
          </label>
        </>
      )}

      {type === "http" ? (
        <>
          <label className="flex flex-col gap-2">
            <span className="t-label">Check every</span>
            <select
              className="input"
              name="intervalSeconds"
              defaultValue={String(Math.max(60, minIntervalSeconds))}
            >
              {[60, 300, 900, 1800, 3600]
                .filter((s) => s >= minIntervalSeconds)
                .map((s) => (
                  <option key={s} value={s}>
                    {s < 3600 ? `${s / 60} minutes` : "1 hour"}
                  </option>
                ))}
            </select>
            {minIntervalSeconds > 60 ? (
              <span className="t-secondary">
                One-minute checks are on Solo and Team. Free checks every five minutes.
              </span>
            ) : null}
          </label>

          <button type="button" className="btn-quiet self-start" onClick={() => setAdvanced((v) => !v)}>
            {advanced ? "Hide assertions" : "Assertions and headers"}
          </button>

          {advanced ? (
            <div className="panel flex flex-col gap-4 p-4">
              <label className="flex flex-col gap-2">
                <span className="t-label">Expected status codes</span>
                <input
                  className="input input-mono"
                  name="expectedStatusCodes"
                  defaultValue="200"
                  placeholder="200, 204 or 200-299"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="t-label">Body must contain</span>
                <input className="input input-mono" name="keyword" placeholder='"status":"ok"' />
              </label>

              <label className="flex items-center justify-between gap-4">
                <span className="t-secondary">Fail if the keyword IS present</span>
                <input type="checkbox" name="keywordInvert" className="size-5" />
              </label>

              <label className="flex items-center justify-between gap-4">
                <span className="t-secondary">Follow redirects</span>
                <input type="checkbox" name="followRedirects" defaultChecked className="size-5" />
              </label>

              <label className="flex flex-col gap-2">
                <span className="t-label">Request headers</span>
                <textarea
                  className="input input-mono"
                  name="requestHeaders"
                  rows={3}
                  placeholder={"X-Api-Key: your-key\nAccept: application/json"}
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="t-label">Timeout</span>
                <select className="input" name="timeoutMs" defaultValue="10000">
                  <option value="5000">5 seconds</option>
                  <option value="10000">10 seconds</option>
                  <option value="30000">30 seconds</option>
                </select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="t-label">Confirm before alerting</span>
                <select className="input" name="failureThreshold" defaultValue="2">
                  <option value="1">1 failure</option>
                  <option value="2">2 failures</option>
                  <option value="3">3 failures</option>
                </select>
                <span className="t-secondary">
                  We never page you on a single blip. Two is the default for a reason.
                </span>
              </label>

              <fieldset>
                <legend className="t-label mb-2">Regions</legend>
                <div className="flex flex-wrap gap-3">
                  {regions.map((region) => (
                    <label key={region} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="regions"
                        value={region}
                        defaultChecked={defaultRegions.includes(region)}
                        className="size-5"
                      />
                      <span className="t-data">{region}</span>
                    </label>
                  ))}
                </div>
                {maxRegions < regions.length ? (
                  <p className="t-secondary mt-2">
                    Your plan checks from {maxRegions} region{maxRegions === 1 ? "" : "s"}; extra
                    picks are ignored.
                  </p>
                ) : null}
              </fieldset>
            </div>
          ) : null}
        </>
      ) : null}

      {type === "ssl" || type === "domain" ? (
        <p className="t-secondary">
          Scanned once a day. You will be alerted at 30, 14, 7 and 1 days — each exactly once.
        </p>
      ) : null}

      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-red)" }} role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="thumb-cta">
        <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
          {pending ? "Starting…" : "Start watching"}
        </button>
      </div>
    </form>
  );
}
