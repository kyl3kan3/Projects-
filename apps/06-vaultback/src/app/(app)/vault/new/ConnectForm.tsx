"use client";

/**
 * Connect a database — one screen.
 *
 * The connection string field renders in mono with its middle masked while the
 * field is not focused, because a production password on a laptop screen in a
 * coffee shop is a real threat and a dot-obscured field is unreadable when you
 * need to check a hostname.
 *
 * The provider chip appears inline as you type, before anything touches the
 * network: hostname patterns are enough to name the provider and to warn about a
 * transaction pooler, which is the single most common cause of a broken dump.
 */

import { useActionState, useMemo, useState } from "react";
import { IconAlertTriangle, IconCheck, IconDatabase } from "@/components/icons";
import { maskConnectionString } from "@/lib/providers";
import type { ConnectFormState } from "../actions";

export interface ProviderHint {
  provider: string;
  label: string;
  pooled: boolean;
  poolerAdvice: string;
  note: string;
  host: string;
  database: string;
}

export function ConnectForm({
  action,
  detect,
  first,
}: {
  action: (prev: ConnectFormState, form: FormData) => Promise<ConnectFormState>;
  /** Server action doing the hostname-pattern detection — one source of truth. */
  detect: (connectionString: string) => Promise<ProviderHint | null>;
  first: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [hint, setHint] = useState<ProviderHint | null>(null);

  const masked = useMemo(() => (value ? maskConnectionString(value) : ""), [value]);

  async function onChange(next: string) {
    setValue(next);
    if (next.length < 16) {
      setHint(null);
      return;
    }
    try {
      setHint(await detect(next));
    } catch {
      setHint(null);
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <label className="flex flex-col gap-2">
        <span className="t-label">Connection string</span>
        <input
          className="input input-mono"
          name="connectionString"
          required
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
          value={focused ? value : masked || value}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => void onChange(e.target.value)}
          placeholder="postgres://user:password@db.abcdefgh.supabase.co:5432/postgres"
          aria-describedby="conn-help"
        />
        <span id="conn-help" className="t-secondary">
          {hint?.note ??
            "Paste the URI your provider shows. The password is masked here and encrypted before it is stored."}
        </span>
      </label>

      {hint ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip" data-active="true">
            <IconDatabase size={16} />
            {hint.label}
            {hint.pooled ? " — pooler detected" : ""}
          </span>
          <span className="t-data" style={{ color: "var(--color-text-3)" }}>
            {hint.host} / {hint.database}
          </span>
        </div>
      ) : null}

      {hint?.pooled ? (
        <p
          className="panel t-secondary flex items-start gap-2 p-4"
          style={{ borderColor: "color-mix(in srgb, var(--color-brass) 40%, transparent)" }}
        >
          <span style={{ color: "var(--color-brass)", marginTop: 2 }}>
            <IconAlertTriangle size={16} />
          </span>
          <span>{hint.poolerAdvice}</span>
        </p>
      ) : null}

      <label className="flex flex-col gap-2">
        <span className="t-label">Name it</span>
        <input
          className="input"
          name="name"
          maxLength={64}
          placeholder={hint ? `${hint.provider}-${hint.database}` : "prod-supabase"}
        />
        <span className="t-secondary">What you would call it at 3am. Shown in every alert.</span>
      </label>

      <section>
        <p className="t-label mb-3">What happens when you press connect</p>
        <ul className="flex flex-col">
          {[
            "Reachability and TLS are checked from this server",
            "The backup role's read access is probed table by table",
            "Size and table count are estimated, not scanned",
            "A schedule is created at your plan's best frequency",
            "The first backup runs immediately",
          ].map((item) => (
            <li key={item} className="hairline-b flex items-start gap-2.5 py-3">
              <span style={{ color: "var(--color-text-3)", marginTop: 2 }}>
                <IconCheck size={16} />
              </span>
              <span className="t-secondary">{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-torch)" }} role="alert">
          {state.error}
        </p>
      ) : null}

      <div className={first ? "" : "thumb-cta"}>
        <button className="btn btn-primary btn-full" type="submit" disabled={pending || !value}>
          {pending ? "Checking and taking the first backup…" : "Connect and back up now"}
        </button>
      </div>
      {first ? null : <div className="h-12" />}
    </form>
  );
}
