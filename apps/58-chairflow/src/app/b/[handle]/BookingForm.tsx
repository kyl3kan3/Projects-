"use client";

import { useActionState } from "react";
import { bookAction, type BookingValues } from "@/app/b/[handle]/actions";
import { FormError } from "@/components/ui";
import { emptyState, type FormState } from "@/lib/forms";

/**
 * The contact + agreement step. The money surface, one-handed at 390px.
 *
 * The policy panel is rendered by the server above this form and the button label carries the
 * agreement, so there is no checkbox theatre: the tap is the agreement, and the stamp
 * (version + timestamp) is what wins a dispute.
 *
 * Three card states, and the form says which one it is in rather than implying a card was
 * taken when it was not:
 *
 *   "elements" — Stripe is configured; the button hands off to Stripe's own hosted page.
 *   "demo"     — no Stripe key here; the field records a card without charging anything, and
 *                the label says exactly that.
 *   "none"     — the chair has not finished Stripe onboarding; the booking is cardless and the
 *                client is told so before they book, not after.
 */
export type CardMode = "elements" | "demo" | "none";

export function BookingForm({
  handle,
  serviceId,
  startsAt,
  whenLabel,
  serviceLabel,
  depositLabel,
  cardMode,
  nudgeToken,
}: {
  handle: string;
  serviceId: string;
  startsAt: string;
  whenLabel: string;
  serviceLabel: string;
  depositLabel: string | null;
  cardMode: CardMode;
  nudgeToken: string | null;
}) {
  const initial: FormState<BookingValues> = emptyState({
    handle,
    serviceId,
    startsAt,
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    card: "",
    nudge: nudgeToken ?? "",
  });
  const [state, action, pending] = useActionState(bookAction, initial);

  return (
    <form action={action} className="stack" style={{ gap: 16 }}>
      <input type="hidden" name="handle" value={handle} />
      <input type="hidden" name="serviceId" value={serviceId} />
      <input type="hidden" name="startsAt" value={startsAt} />
      <input type="hidden" name="nudge" value={nudgeToken ?? ""} />

      <FormError message={state.error} />

      <div>
        <p className="t-title" style={{ margin: 0 }}>
          {serviceLabel}
        </p>
        <p className="t-mono" style={{ margin: "2px 0 0", color: "var(--color-ink-2)" }}>
          {whenLabel}
        </p>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <label className="field" style={{ flex: 1 }}>
          <span className="t-label">First name</span>
          <input
            className="input"
            name="firstName"
            required
            autoComplete="given-name"
            defaultValue={state.values.firstName}
            placeholder="Marcus"
          />
        </label>
        <label className="field" style={{ flex: 1 }}>
          <span className="t-label">Last name</span>
          <input
            className="input"
            name="lastName"
            autoComplete="family-name"
            defaultValue={state.values.lastName}
            placeholder="Ollet"
          />
        </label>
      </div>

      <label className="field">
        <span className="t-label">Mobile</span>
        <input
          className="input"
          name="phone"
          type="tel"
          inputMode="tel"
          required
          autoComplete="tel"
          defaultValue={state.values.phone}
          placeholder="(512) 555-0147"
        />
      </label>

      <label className="field">
        <span className="t-label">Email (optional)</span>
        <input
          className="input"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          defaultValue={state.values.email}
          placeholder="marcus@example.com"
        />
      </label>

      <label style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "4px 0" }}>
        <input
          type="checkbox"
          name="smsConsent"
          defaultChecked
          style={{ width: 22, height: 22, marginTop: 2, accentColor: "var(--color-cobalt)" }}
        />
        <span className="t-secondary">
          Text me my confirmation and reminders. Reply STOP any time.
        </span>
      </label>

      {cardMode === "demo" && (
        <label className="field">
          <span className="t-label">Card on file</span>
          <input
            className="input"
            name="card"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={state.values.card}
            placeholder="4242 4242 4242 4242"
            style={{ fontFamily: "var(--font-mono)" }}
          />
          <span className="t-secondary" style={{ color: "var(--color-amber-text)" }}>
            Demo mode: this chair has no live Stripe account, so nothing is stored with a card
            network and nothing is ever charged. Only the last four digits are kept, so the
            screens can show a card on file. End the number 0002 to see a decline.
          </span>
        </label>
      )}

      {cardMode === "none" && (
        <p className="t-secondary" style={{ margin: 0 }}>
          This chair cannot hold a card yet, so nothing will be charged — but the policy above
          is still what you are agreeing to.
        </p>
      )}

      {cardMode === "elements" && (
        <p className="t-secondary" style={{ margin: 0 }}>
          The next screen is Stripe&apos;s own, where your card is saved securely.
          {depositLabel ? ` Your ${depositLabel} is taken there.` : " Nothing is charged now."}
        </p>
      )}

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Booking…" : "Book it and agree to the policy"}
      </button>

      <p className="t-secondary" style={{ margin: 0 }}>
        No account, no password. Your confirmation carries a link to reschedule or cancel.
      </p>
    </form>
  );
}
