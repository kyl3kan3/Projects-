"use client";

import { useActionState } from "react";
import { addAppointmentAction, type ManualBookingValues } from "@/app/(app)/today/new/actions";
import { FormError } from "@/components/ui";
import { emptyState, type FormState } from "@/lib/forms";

/**
 * The contact half of adding an appointment by hand.
 *
 * Every field is echoed back through `defaultValue` on rejection: React 19 resets an
 * uncontrolled form after the action returns, so an unrecognised phone number would
 * otherwise take the name and the email with it.
 */
export function ManualBookingForm({
  serviceId,
  startsAt,
  whenLabel,
  serviceLabel,
}: {
  serviceId: string;
  startsAt: string;
  whenLabel: string;
  serviceLabel: string;
}) {
  const initial: FormState<ManualBookingValues> = emptyState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    serviceId,
    startsAt,
  });
  const [state, action, pending] = useActionState(addAppointmentAction, initial);

  return (
    <form action={action} className="stack" style={{ gap: 16 }}>
      <input type="hidden" name="serviceId" value={serviceId} />
      <input type="hidden" name="startsAt" value={startsAt} />

      <FormError message={state.error} />

      <p className="t-secondary" style={{ margin: 0 }}>
        {serviceLabel} · {whenLabel}
      </p>

      <div style={{ display: "flex", gap: 12 }}>
        <label className="field" style={{ flex: 1 }}>
          <span className="t-label">First name</span>
          <input
            className="input"
            name="firstName"
            required
            defaultValue={state.values.firstName}
            placeholder="Marcus"
          />
        </label>
        <label className="field" style={{ flex: 1 }}>
          <span className="t-label">Last name</span>
          <input
            className="input"
            name="lastName"
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
          defaultValue={state.values.phone}
          placeholder="(512) 555-0147"
        />
        <span className="t-secondary">
          Their number is how their history, cadence and card stay attached to them.
        </span>
      </label>

      <label className="field">
        <span className="t-label">Email (optional)</span>
        <input
          className="input"
          name="email"
          type="email"
          inputMode="email"
          defaultValue={state.values.email}
          placeholder="marcus@example.com"
        />
      </label>

      <label style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "4px 0" }}>
        <input
          type="checkbox"
          name="smsConsent"
          style={{ width: 22, height: 22, marginTop: 2, accentColor: "var(--color-cobalt)" }}
        />
        <span className="t-secondary">
          They said yes to text reminders. Only tick this if they actually did — STOP is
          honoured everywhere and consent is what keeps you the right side of TCPA.
        </span>
      </label>

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add the appointment"}
      </button>
    </form>
  );
}
