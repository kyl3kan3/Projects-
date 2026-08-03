"use client";

import { useActionState, useRef, useState } from "react";
import { completeOnboarding, type OnboardingState } from "./actions";
import { IconChevronLeft, TallyMark } from "@/components/icons";

/**
 * Four steps, one form. The whole thing posts once, so a half-finished wizard leaves no
 * rows behind and the back button never resurrects a stale draft.
 *
 * Every step keeps its primary action in the thumb zone at 390px and asks for exactly
 * what the calculation needs — the grid region because it selects the eGRID factor, the
 * floor area because it powers the unit-plausibility check, the questionnaires because
 * they decide which answer templates get generated.
 */

const INDUSTRIES = [
  { code: "332710", label: "Machine shops" },
  { code: "333517", label: "Machine tool manufacturing" },
  { code: "311999", label: "Food manufacturing, other" },
  { code: "311412", label: "Frozen speciality food manufacturing" },
  { code: "326199", label: "Plastics product manufacturing" },
  { code: "484121", label: "Long-distance trucking" },
  { code: "493110", label: "General warehousing and storage" },
  { code: "541330", label: "Engineering services" },
  { code: "541511", label: "Custom software services" },
  { code: "561720", label: "Janitorial services" },
  { code: "238220", label: "Plumbing and HVAC contractors" },
  { code: "423830", label: "Industrial machinery wholesale" },
  { code: "000000", label: "Something else" },
];

const REGIONS_US = [
  { code: "AZNM", label: "AZNM — WECC Southwest" },
  { code: "CAMX", label: "CAMX — WECC California" },
  { code: "ERCT", label: "ERCT — ERCOT (most of Texas)" },
  { code: "FRCC", label: "FRCC — Florida" },
  { code: "MROE", label: "MROE — MRO East" },
  { code: "MROW", label: "MROW — MRO West" },
  { code: "NEWE", label: "NEWE — New England" },
  { code: "NWPP", label: "NWPP — WECC Northwest" },
  { code: "NYCW", label: "NYCW — NYC & Westchester" },
  { code: "NYLI", label: "NYLI — Long Island" },
  { code: "NYUP", label: "NYUP — Upstate New York" },
  { code: "RFCE", label: "RFCE — RFC East (mid-Atlantic)" },
  { code: "RFCM", label: "RFCM — Michigan" },
  { code: "RFCW", label: "RFCW — RFC West (Ohio Valley)" },
  { code: "RMPA", label: "RMPA — Rockies" },
  { code: "SPNO", label: "SPNO — SPP North" },
  { code: "SPSO", label: "SPSO — SPP South" },
  { code: "SRMV", label: "SRMV — Mississippi Valley" },
  { code: "SRMW", label: "SRMW — SERC Midwest" },
  { code: "SRSO", label: "SRSO — SERC South" },
  { code: "SRTV", label: "SRTV — Tennessee Valley" },
  { code: "SRVC", label: "SRVC — Virginia & Carolina" },
  { code: "US", label: "US — national average (if unsure)" },
];

const STEPS = ["Company", "Site", "Reporting year", "Questionnaires"];

export function OnboardingWizard({
  orgName,
  defaultYear,
}: {
  orgName: string;
  defaultYear: number;
}) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(
    completeOnboarding,
    {},
  );
  const [step, setStep] = useState(0);
  const [country, setCountry] = useState("US");
  const [industry, setIndustry] = useState(INDUSTRIES[0]);
  const [marketMethod, setMarketMethod] = useState("residual_mix");
  const [year, setYear] = useState(defaultYear);
  const formRef = useRef<HTMLFormElement>(null);

  const years = [defaultYear, defaultYear - 1, defaultYear - 2];
  const last = step === STEPS.length - 1;

  /**
   * The advance button is **always** `type="button"`, and the last step submits through
   * `requestSubmit()`.
   *
   * Not a style choice: with `type={last ? "submit" : "button"}`, React flushes the
   * attribute change inside the click handler and the browser then performs the default
   * action against the *new* type — so the second-to-last "Continue" advanced the step and
   * submitted the wizard in the same click. Caught driving the real form in a browser;
   * nothing in a typecheck or a build would have shown it.
   */
  function advance() {
    if (!last) {
      setStep((s) => Math.min(STEPS.length - 1, s + 1));
      return;
    }
    formRef.current?.requestSubmit();
  }

  return (
    <div className="screen-plain pt-8">
      <div className="flex items-center gap-2" style={{ color: "var(--color-accent-text)" }}>
        <TallyMark size={20} />
        <span className="t-label" style={{ color: "var(--color-accent-text)" }}>
          GreenTally setup
        </span>
      </div>

      <p className="t-label mt-6">
        Step {step + 1} of {STEPS.length} · {STEPS[step]}
      </p>
      <div className="mt-3 grid grid-cols-4 gap-1" aria-hidden="true">
        {STEPS.map((s, i) => (
          <span
            key={s}
            style={{
              height: 2,
              borderRadius: 999,
              background: i <= step ? "var(--color-moss)" : "var(--color-cell-empty)",
            }}
          />
        ))}
      </div>

      <form ref={formRef} action={action} className="mt-6">
        {/* Step 1 — company profile */}
        <fieldset hidden={step !== 0} className="flex flex-col gap-5 border-0 p-0">
          <div>
            <h1 className="t-h2">{orgName}</h1>
            <p className="t-secondary mt-2" style={{ maxWidth: "42ch" }}>
              Revenue and headcount are the denominators for the intensity metrics every
              questionnaire asks for. Both stay inside your account.
            </p>
          </div>

          <label className="field">
            <span className="t-label">What the company does</span>
            <select
              name="industryCode"
              className="input"
              value={industry.code}
              onChange={(e) =>
                setIndustry(INDUSTRIES.find((i) => i.code === e.target.value) ?? INDUSTRIES[0])
              }
            >
              {INDUSTRIES.map((i) => (
                <option key={i.code} value={i.code}>
                  {i.label}
                  {i.code === "000000" ? "" : ` — NAICS ${i.code}`}
                </option>
              ))}
            </select>
          </label>
          <input type="hidden" name="industryLabel" value={industry.label} />

          <label className="field">
            <span className="t-label">Annual revenue, reporting year</span>
            <input
              name="revenue"
              className="input input-mono"
              inputMode="decimal"
              placeholder="4,200,000"
              defaultValue=""
            />
          </label>

          <label className="field">
            <span className="t-label">Full-time employees</span>
            <input
              name="fteCount"
              className="input input-mono"
              inputMode="numeric"
              placeholder="42"
              defaultValue=""
            />
          </label>
        </fieldset>

        {/* Step 2 — first site */}
        <fieldset hidden={step !== 1} className="flex flex-col gap-5 border-0 p-0">
          <div>
            <h1 className="t-h2">Your first site</h1>
            <p className="t-secondary mt-2" style={{ maxWidth: "42ch" }}>
              The grid region decides which published electricity factor your Scope 2 uses,
              so it changes the number. If you are unsure, the national average is honest
              and you can correct it later.
            </p>
          </div>

          <label className="field">
            <span className="t-label">Site name</span>
            <input
              name="siteName"
              className="input"
              // Only the visible step is `required`: a hidden fieldset's invalid control
              // cannot be focused, and Chromium then blocks the submit with a console
              // warning and no visible explanation.
              required={step === 1}
              placeholder="Brooklyn shop"
              defaultValue=""
            />
          </label>

          <label className="field">
            <span className="t-label">Address</span>
            <input
              name="address"
              className="input"
              placeholder="118 Meserole Ave, Brooklyn NY 11222"
              defaultValue=""
            />
          </label>

          <label className="field">
            <span className="t-label">Country</span>
            <select
              name="country"
              className="input"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              <option value="US">United States</option>
              <option value="GB">United Kingdom</option>
            </select>
          </label>

          <label className="field">
            <span className="t-label">Grid region</span>
            {country === "GB" ? (
              <select name="gridRegion" className="input">
                <option value="GB">UK national grid</option>
              </select>
            ) : (
              <select name="gridRegion" className="input" defaultValue="NYCW">
                {REGIONS_US.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="field">
            <span className="t-label">Floor area, m² (optional)</span>
            <input
              name="floorAreaSqm"
              className="input input-mono"
              inputMode="numeric"
              placeholder="1450"
              defaultValue=""
            />
            <span className="t-secondary mt-2 block">
              Used only to sanity-check electricity readings — a bill thirty times too
              large gets caught instead of reported.
            </span>
          </label>

          <label className="field">
            <span className="t-label">Market-based Scope 2</span>
            <select
              name="marketMethod"
              className="input"
              value={marketMethod}
              onChange={(e) => setMarketMethod(e.target.value)}
            >
              <option value="residual_mix">No renewable contract — use the grid average</option>
              <option value="renewable_contract">
                We buy renewable electricity under contract
              </option>
            </select>
          </label>

          {marketMethod === "renewable_contract" && (
            <>
              <label className="field">
                <span className="t-label">Share covered, %</span>
                <input
                  name="renewableSharePct"
                  className="input input-mono"
                  inputMode="numeric"
                  placeholder="35"
                  defaultValue=""
                />
              </label>
              <label className="field">
                <span className="t-label">The instrument, named</span>
                <input
                  name="contractNote"
                  className="input"
                  placeholder="Con Edison Solutions 35% renewable supply agreement (2025)"
                  defaultValue=""
                />
                <span className="t-secondary mt-2 block">
                  This sentence is printed in the report. An analyst will ask what the
                  claim rests on.
                </span>
              </label>
            </>
          )}
        </fieldset>

        {/* Step 3 — reporting year */}
        <fieldset hidden={step !== 2} className="flex flex-col gap-5 border-0 p-0">
          <div>
            <h1 className="t-h2">Which year are they asking about?</h1>
            <p className="t-secondary mt-2" style={{ maxWidth: "42ch" }}>
              Almost always the last complete calendar year. Bills whose service period
              falls outside it are flagged rather than filed.
            </p>
          </div>
          <div className="chip-row">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                className="chip"
                data-active={year === y}
                onClick={() => setYear(y)}
              >
                <span className="t-mono">{y}</span>
              </button>
            ))}
          </div>
          <input type="hidden" name="year" value={year} />
        </fieldset>

        {/* Step 4 — questionnaires */}
        <fieldset hidden={step !== 3} className="flex flex-col gap-4 border-0 p-0">
          <div>
            <h1 className="t-h2">Which forms landed on your desk?</h1>
            <p className="t-secondary mt-2" style={{ maxWidth: "42ch" }}>
              The answer bank is generated for the frameworks you pick, with your figures
              already interpolated.
            </p>
          </div>

          {[
            {
              name: "framework_cdp_style",
              title: "CDP-style supplier request",
              detail: "Numbered disclosure questions: C6.1 Scope 1, C6.3 Scope 2, C6.5 Scope 3…",
              defaultChecked: true,
            },
            {
              name: "framework_ecovadis_style",
              title: "EcoVadis-style assessment",
              detail: "Policy, measurement, energy, renewable share, verification status.",
              defaultChecked: true,
            },
            {
              name: "framework_custom",
              title: "A customer's own form",
              detail: "Generates every answer so you can pick the closest match.",
              defaultChecked: false,
            },
          ].map((f) => (
            <label key={f.name} className="row-plain flex items-start gap-3">
              <input
                type="checkbox"
                name={f.name}
                defaultChecked={f.defaultChecked}
                style={{ width: 20, height: 20, marginTop: 2, accentColor: "var(--color-moss)" }}
              />
              <span>
                <span className="t-title block">{f.title}</span>
                <span className="t-secondary">{f.detail}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {state.error && (
          <p className="t-secondary mt-5" role="alert" style={{ color: "var(--color-red)" }}>
            {state.error}
          </p>
        )}

        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            className="btn btn-primary btn-full"
            disabled={pending}
            onClick={advance}
          >
            {last ? (pending ? "Saving…" : "Finish setup") : "Continue"}
          </button>
          {step > 0 && (
            <button
              type="button"
              className="btn-quiet inline-flex items-center gap-1 self-start"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              <IconChevronLeft size={16} />
              Back
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
