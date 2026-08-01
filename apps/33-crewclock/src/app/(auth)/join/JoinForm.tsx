"use client";

import { useActionState, useState } from "react";
import { crewCodeAction, crewPinAction, type JoinState } from "../actions";
import type { Locale } from "@/db/schema";

export interface JoinStrings {
  title: string;
  subtitle: string;
  codeLabel: string;
  codePlaceholder: string;
  continue: string;
  setPinTitle: string;
  setPinSubtitle: string;
  pinLabel: string;
  pinConfirmLabel: string;
  setPinSubmit: string;
  enterPinTitle: string;
  enterPinSubmit: string;
  greeting: string;
}

/**
 * The crew door, in two steps and two languages.
 *
 * The EN/ES pill sits here rather than in settings because this is the first
 * screen a worker ever sees, and a worker who cannot read the first screen never
 * reaches settings (DESIGN.md). Both string bundles are handed down from the
 * server so the switch re-renders instantly, with no reload and no round trip.
 */
export function JoinForm({
  strings,
  defaultLocale,
}: {
  strings: Record<Locale, JoinStrings>;
  defaultLocale: Locale;
}) {
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const s = strings[locale];
  const [codeState, codeAction, codePending] = useActionState(crewCodeAction, {
    step: "code",
  } as JoinState);

  return (
    <>
      <div className="mb-8 flex items-center justify-between">
        <span className="t-label">CrewClock</span>
        <div className="lang-pill">
          {(["en", "es"] as const).map((option) => (
            <button
              key={option}
              type="button"
              data-active={locale === option}
              onClick={() => setLocale(option)}
            >
              {option.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {codeState.step === "code" ? (
        <>
          <h1 className="t-h2 mb-1">{s.title}</h1>
          <p className="t-secondary mb-8">{s.subtitle}</p>
          <form action={codeAction} className="flex flex-col gap-4">
            <input type="hidden" name="locale" value={locale} />
            <label className="field">
              <span className="t-label">{s.codeLabel}</span>
              <input
                className="input input-mono"
                name="code"
                required
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={8}
                placeholder={s.codePlaceholder}
                style={{ fontSize: 22, letterSpacing: "0.22em", textAlign: "center", height: 64 }}
              />
            </label>
            {codeState.error ? (
              <p className="t-secondary" role="alert" style={{ color: "var(--bad)" }}>
                {codeState.error}
              </p>
            ) : null}
            <button className="btn btn-primary btn-full" type="submit" disabled={codePending}>
              {s.continue}
            </button>
          </form>
        </>
      ) : (
        <PinStep initial={codeState} s={s} locale={locale} />
      )}
    </>
  );
}

function PinStep({ initial, s, locale }: { initial: JoinState; s: JoinStrings; locale: Locale }) {
  const [state, action, pending] = useActionState(crewPinAction, initial);
  const setting = state.step === "set-pin";
  const name = state.name ?? initial.name;

  return (
    <>
      <h1 className="t-h2 mb-1">{setting ? s.setPinTitle : s.enterPinTitle}</h1>
      <p className="t-secondary mb-8">
        {name ? s.greeting.replace("{name}", name) : setting ? s.setPinSubtitle : ""}
        {name && setting ? ` ${s.setPinSubtitle}` : ""}
      </p>
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="code" value={state.code ?? initial.code ?? ""} />
        <input type="hidden" name="mode" value={state.step} />
        <label className="field">
          <span className="t-label">{s.pinLabel}</span>
          <input
            className="input input-pin"
            name="pin"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]{4}"
            maxLength={4}
            required
          />
        </label>
        {setting ? (
          <label className="field">
            <span className="t-label">{s.pinConfirmLabel}</span>
            <input
              className="input input-pin"
              name="pinConfirm"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]{4}"
              maxLength={4}
              required
            />
          </label>
        ) : null}
        {state.error ? (
          <p className="t-secondary" role="alert" style={{ color: "var(--bad)" }}>
            {state.error}
          </p>
        ) : null}
        <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
          {setting ? s.setPinSubmit : s.enterPinSubmit}
        </button>
      </form>
    </>
  );
}
