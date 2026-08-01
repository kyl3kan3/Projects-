"use client";

/**
 * The parent registration form: one child per screen, progress dots, the waiver
 * inline with a real checkbox, and a fee summary in mono with our fee shown
 * honestly. Daylight theme, thumb-zone primary, under five minutes on a phone —
 * which is a design requirement, not a hope (DESIGN.md).
 *
 * Steps are client state rather than routes so nothing typed is lost when a parent
 * goes back to fix a birthdate, and the whole thing is one form post at the end.
 */

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { useValueRestore, type FormState } from "@/components/ActionForm";
import { IconCheck } from "@/components/icons";
import { formatMoney } from "@/lib/money";

export interface DivisionOption {
  id: string;
  name: string;
  feeCents: number;
  spotsLeft: number;
  full: boolean;
  waitlistEnabled: boolean;
  waitlistCount: number;
  earlyBirdEndsOn: string | null;
  earlyBirdOffCents: number;
}

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

const MAX_CHILDREN = 6;

export function RegisterForm({
  action,
  quote,
  slug,
  divisions,
  waiverText,
  siblingPercent,
  installments,
  absorbPlatformFee,
  platformFeeCents,
  clubName,
}: {
  action: Action;
  quote: Action;
  slug: string;
  divisions: DivisionOption[];
  waiverText: string;
  siblingPercent: number;
  installments: { enabled: boolean; depositCents: number; count: number };
  absorbPlatformFee: boolean;
  platformFeeCents: number;
  clubName: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const [quoteState, quoteFormAction] = useActionState(quote, {});
  // React 19 clears an uncontrolled form once an action has run. On this form
  // that would throw away three children's details the moment a code is
  // mistyped or the fees are re-checked, so every field is restored.
  const registerRestore = useValueRestore(state, { always: true });
  // Two actions, one form element: the re-quote button shares the same ref.
  const quoteRestore = useValueRestore(quoteState, {
    always: true,
    formRef: registerRestore.formRef,
  });
  const [step, setStep] = useState(0);
  const [childCount, setChildCount] = useState(1);
  const [chosen, setChosen] = useState<string[]>([divisions[0]?.id ?? ""]);

  const steps = ["You", ...Array.from({ length: childCount }, (_, i) => `Child ${i + 1}`), "Pay"];
  const last = steps.length - 1;

  // Running total, computed from the same rules the server applies. The server
  // reprices before charging; this is the honest preview, not the authority.
  const paying = chosen
    .slice(0, childCount)
    .map((id) => divisions.find((d) => d.id === id))
    .filter((d): d is DivisionOption => Boolean(d));
  const ordered = [...paying].sort((a, b) => b.feeCents - a.feeCents);
  let payingIndex = 0;
  let subtotal = 0;
  const preview = ordered.map((division) => {
    const waitlisted = division.spotsLeft <= 0;
    let amount = division.feeCents;
    if (division.earlyBirdOffCents > 0) amount -= Math.min(amount, division.earlyBirdOffCents);
    if (payingIndex > 0 && siblingPercent > 0) {
      amount -= Math.round((amount * siblingPercent) / 100);
    }
    if (!waitlisted) {
      payingIndex += 1;
      subtotal += amount;
    }
    return { division, amount, waitlisted };
  });
  const ourFee = absorbPlatformFee ? 0 : platformFeeCents * payingIndex;
  const total = subtotal + ourFee;

  return (
    <form
      ref={registerRestore.formRef}
      action={formAction}
      onSubmit={(event) => {
        registerRestore.capture(event.currentTarget);
        quoteRestore.capture(event.currentTarget);
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="childCount" value={childCount} />

      <div className="dots" aria-label={`Step ${step + 1} of ${steps.length}`}>
        {steps.map((label, i) => (
          <span key={label} data-state={i < step ? "done" : i === step ? "current" : "todo"} />
        ))}
      </div>
      <p className="t-label">{steps[step]}</p>

      {/* --- Step 0: the parent ------------------------------------------- */}
      <fieldset hidden={step !== 0} className="flex flex-col gap-4 border-0 p-0">
        <div className="field">
          <label className="t-label" htmlFor="contactName">
            Your name
          </label>
          <input id="contactName" name="contactName" className="input" required />
        </div>
        <div className="field">
          <label className="t-label" htmlFor="email">
            Email
          </label>
          <input id="email" name="email" type="email" className="input" required />
          <p className="t-secondary">
            Your schedule, messages and volunteer slots all live behind one link we send here. No
            app, no password.
          </p>
        </div>
        <div className="field">
          <label className="t-label" htmlFor="phone">
            Mobile
          </label>
          <input id="phone" name="phone" type="tel" className="input" placeholder="+1 555 0147" />
        </div>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="smsConsent" className="check" />
          <span className="t-body">
            Text me time-sensitive things — a rain-out, a field change, three hours before a game.
            Nothing else, and you can stop any time by replying STOP.
          </span>
        </label>
        <div className="field">
          <label className="t-label" htmlFor="childCount">
            How many children
          </label>
          <select
            id="childCount"
            className="input"
            value={childCount}
            onChange={(e) => {
              const n = Number(e.currentTarget.value);
              setChildCount(n);
              setChosen((prev) => {
                const next = [...prev];
                while (next.length < n) next.push(divisions[0]?.id ?? "");
                return next.slice(0, n);
              });
            }}
          >
            {Array.from({ length: MAX_CHILDREN }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {siblingPercent > 0 && childCount > 1 ? (
            <p className="t-secondary">
              {siblingPercent}% off each child after the first — applied automatically.
            </p>
          ) : null}
        </div>
      </fieldset>

      {/* --- Steps 1..n: one child per screen ----------------------------- */}
      {Array.from({ length: childCount }, (_, i) => (
        <fieldset
          key={i}
          hidden={step !== i + 1}
          className="flex flex-col gap-4 border-0 p-0"
        >
          <div className="split-even">
            <div className="field">
              <label className="t-label" htmlFor={`child-${i}-firstName`}>
                First name
              </label>
              <input
                id={`child-${i}-firstName`}
                name={`child-${i}-firstName`}
                className="input"
                required={step === i + 1}
              />
            </div>
            <div className="field">
              <label className="t-label" htmlFor={`child-${i}-lastName`}>
                Last name
              </label>
              <input
                id={`child-${i}-lastName`}
                name={`child-${i}-lastName`}
                className="input"
                required={step === i + 1}
              />
            </div>
          </div>
          <div className="field">
            <label className="t-label" htmlFor={`child-${i}-birthdate`}>
              Date of birth
            </label>
            <input
              id={`child-${i}-birthdate`}
              name={`child-${i}-birthdate`}
              type="date"
              className="input input-mono"
              required={step === i + 1}
            />
            <p className="t-secondary">Used to check the age group. Nothing else.</p>
          </div>
          <div className="field">
            <label className="t-label" htmlFor={`child-${i}-divisionId`}>
              Age group
            </label>
            <select
              id={`child-${i}-divisionId`}
              name={`child-${i}-divisionId`}
              className="input"
              value={chosen[i] ?? ""}
              onChange={(e) => {
                // Read the value synchronously. Inside the updater the event has
                // already been released and `currentTarget` is null, which
                // crashed this screen — on the one flow a parent has to finish.
                const value = e.currentTarget.value;
                setChosen((prev) => {
                  const next = [...prev];
                  next[i] = value;
                  return next;
                });
              }}
              required={step === i + 1}
            >
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} — {formatMoney(d.feeCents)}
                  {d.full
                    ? d.waitlistEnabled
                      ? ` · full, waitlist (${d.waitlistCount} waiting)`
                      : " · full"
                    : ` · ${d.spotsLeft} spot${d.spotsLeft === 1 ? "" : "s"} left`}
                </option>
              ))}
            </select>
            {divisions.find((d) => d.id === chosen[i])?.full ? (
              <p className="t-secondary" style={{ color: "var(--warn)" }}>
                That group is full. You can join the waitlist — nothing is charged, and the club
                collects the fee only if a place opens.
              </p>
            ) : null}
          </div>
          <div className="field">
            <label className="t-label" htmlFor={`child-${i}-medicalNotes`}>
              Anything a coach must know
            </label>
            <textarea
              id={`child-${i}-medicalNotes`}
              name={`child-${i}-medicalNotes`}
              className="input"
              rows={3}
              placeholder="Inhaler in the kit bag, mild peanut allergy"
            />
            <p className="t-secondary">
              Encrypted, visible to the registrar only, and never in an export or a coach&apos;s
              roster. Leave it blank if there is nothing.
            </p>
          </div>
          <div className="split-even">
            <div className="field">
              <label className="t-label" htmlFor={`child-${i}-emergencyName`}>
                Emergency contact
              </label>
              <input
                id={`child-${i}-emergencyName`}
                name={`child-${i}-emergencyName`}
                className="input"
                placeholder="An adult who is not you"
              />
            </div>
            <div className="field">
              <label className="t-label" htmlFor={`child-${i}-emergencyPhone`}>
                Their number
              </label>
              <input
                id={`child-${i}-emergencyPhone`}
                name={`child-${i}-emergencyPhone`}
                type="tel"
                className="input"
              />
            </div>
          </div>
          <div className="field">
            <label className="t-label" htmlFor={`child-${i}-emergencyRelationship`}>
              Who they are
            </label>
            <input
              id={`child-${i}-emergencyRelationship`}
              name={`child-${i}-emergencyRelationship`}
              className="input"
              placeholder="Grandparent"
            />
          </div>
        </fieldset>
      ))}

      {/* --- Last step: fees, waiver, pay --------------------------------- */}
      <fieldset hidden={step !== last} className="flex flex-col gap-4 border-0 p-0">
        <div className="panel p-4">
          <p className="t-label">What this costs</p>
          {preview.map(({ division, amount, waitlisted }, i) => (
            <div key={`${division.id}-${i}`} className="mt-2 flex items-baseline justify-between gap-3">
              <span className="t-body">
                {division.name}
                {waitlisted ? " · waitlist" : ""}
              </span>
              <span className="t-data">{waitlisted ? "$0.00" : formatMoney(amount)}</span>
            </div>
          ))}
          {ourFee > 0 ? (
            <div className="mt-2 flex items-baseline justify-between gap-3">
              <span className="t-secondary">RosterRally fee</span>
              <span className="t-data">{formatMoney(ourFee)}</span>
            </div>
          ) : null}
          <div className="mt-3 flex items-baseline justify-between gap-3 hairline-t pt-3">
            <span className="t-title">Total today</span>
            <span className="t-data-lg">{formatMoney(total)}</span>
          </div>
          {absorbPlatformFee ? (
            <p className="t-secondary mt-2">{clubName} covers the RosterRally fee for you.</p>
          ) : null}
        </div>

        <div className="field">
          <label className="t-label" htmlFor="scholarshipCode">
            Scholarship or discount code
          </label>
          <input
            id="scholarshipCode"
            name="scholarshipCode"
            className="input"
            placeholder="If the club gave you one"
          />
        </div>

        {installments.enabled ? (
          <div className="field">
            <span className="t-label">How you would like to pay</span>
            <label className="flex items-start gap-3">
              <input type="radio" name="payPlan" value="full" defaultChecked className="check" />
              <span className="t-body">All of it now — {formatMoney(total)}</span>
            </label>
            <label className="flex items-start gap-3">
              <input type="radio" name="payPlan" value="installments" className="check" />
              <span className="t-body">
                {formatMoney(installments.depositCents)} now, then {installments.count} monthly
                payments
              </span>
            </label>
          </div>
        ) : null}

        <div className="panel p-4">
          <p className="t-label">The waiver</p>
          <p className="t-body mt-2 whitespace-pre-wrap">{waiverText}</p>
        </div>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="waiverAccepted" className="check" required />
          <span className="t-body">
            I have read the waiver above and I acknowledge it on behalf of my child. The date and
            time of this acknowledgment is recorded.
          </span>
        </label>

        {state.error ? (
          <p className="t-secondary" style={{ color: "var(--bad)" }} role="alert">
            {state.error}
          </p>
        ) : null}
        {quoteState.ok ? (
          <p className="t-secondary turf" role="status">
            {quoteState.ok}
          </p>
        ) : null}
        {quoteState.error ? (
          <p className="t-secondary" style={{ color: "var(--bad)" }} role="alert">
            {quoteState.error}
          </p>
        ) : null}
        <button type="submit" formAction={quoteFormAction} className="btn-quiet">
          Check the fees again
        </button>
      </fieldset>

      {state.error && step !== last ? (
        <p className="t-secondary" style={{ color: "var(--bad)" }} role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="thumb-cta-plain flex gap-3">
        {step > 0 ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </button>
        ) : null}
        {step < last ? (
          <button
            type="button"
            className="btn btn-primary btn-full"
            onClick={() => setStep((s) => Math.min(last, s + 1))}
          >
            Continue
          </button>
        ) : (
          <PayButton total={total} />
        )}
      </div>
      {/* Space so the fixed CTA never covers the last field. */}
      <div style={{ height: 72 }} />
    </form>
  );
}

function PayButton({ total }: { total: number }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
      {pending ? "Working…" : total > 0 ? `Pay ${formatMoney(total)}` : "Complete registration"}
      {pending ? null : <IconCheck size={18} />}
    </button>
  );
}
