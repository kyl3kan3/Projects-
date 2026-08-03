"use client";

import { useActionState } from "react";
import { Icon } from "@/components/icons";
import type { PatientState } from "./actions";

export function PatientForms({
  patient,
  update,
  optOut,
  doNotContact,
  recordBooking,
}: {
  patient: {
    id: string;
    recallIntervalMonths: number;
    emailConsent: boolean;
    smsConsent: boolean;
    hasEmail: boolean;
    hasPhone: boolean;
    emailOptedOut: boolean;
    smsOptedOut: boolean;
    doNotContact: boolean;
  };
  update: (state: PatientState, formData: FormData) => Promise<PatientState>;
  optOut: (state: PatientState, formData: FormData) => Promise<PatientState>;
  doNotContact: (state: PatientState, formData: FormData) => Promise<PatientState>;
  recordBooking: (state: PatientState, formData: FormData) => Promise<PatientState>;
}) {
  const [updateState, updateAction, updating] = useActionState(update, { error: null });
  const [optOutState, optOutAction, optingOut] = useActionState(optOut, { error: null });
  const [dncState, dncAction, dncPending] = useActionState(doNotContact, { error: null });
  const [bookState, bookAction, booking] = useActionState(recordBooking, { error: null });
  const today = new Date().toISOString().slice(0, 10);
  const error = updateState.error ?? optOutState.error ?? dncState.error ?? bookState.error;

  return (
    <>
      {error && (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-red)" }}>
          {error}
        </p>
      )}

      <form action={updateAction} style={{ display: "grid", gap: 12, marginTop: 8 }}>
        <input type="hidden" name="patientId" value={patient.id} />

        <label style={{ display: "grid", gap: 4 }}>
          <span className="t-label">Recall interval (months)</span>
          <input
            className="input"
            type="number"
            name="recallIntervalMonths"
            min={1}
            max={24}
            defaultValue={patient.recallIntervalMonths}
          />
          <span className="t-secondary">
            Imports infer this from a patient&rsquo;s own visit history when the history supports it;
            set it by hand to override.
          </span>
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <input
            type="checkbox"
            name="emailConsent"
            defaultChecked={patient.emailConsent}
            disabled={patient.emailOptedOut || !patient.hasEmail}
            style={{ marginTop: 4 }}
          />
          <span className="t-secondary" style={{ color: "var(--color-ink)" }}>
            Email consent
            {patient.emailOptedOut
              ? " — unsubscribed, permanently. Only the patient can undo this."
              : !patient.hasEmail
                ? " — no address on file."
                : ""}
          </span>
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <input
            type="checkbox"
            name="smsConsent"
            defaultChecked={patient.smsConsent}
            disabled={patient.smsOptedOut || !patient.hasPhone}
            style={{ marginTop: 4 }}
          />
          <span className="t-secondary" style={{ color: "var(--color-ink)" }}>
            Text consent
            {patient.smsOptedOut
              ? " — replied STOP, permanently. Only the patient can undo this."
              : !patient.hasPhone
                ? " — no mobile number on file."
                : ""}
          </span>
        </label>

        <button className="btn btn-secondary" type="submit" disabled={updating}>
          {updating ? "Saving…" : "Save"}
        </button>
      </form>

      <form action={bookAction} style={{ display: "grid", gap: 12, marginTop: 24 }}>
        <input type="hidden" name="patientId" value={patient.id} />
        <p className="t-label" style={{ margin: 0 }}>
          Record a booking
        </p>
        <input className="input" type="date" name="appointmentOn" defaultValue={today} min={today} />
        <button className="btn btn-primary" type="submit" disabled={booking}>
          {booking ? "Recording…" : "Mark booked"}
        </button>
        <p className="t-secondary" style={{ margin: 0 }}>
          The ledger decides on its own whether this earns recovered production — a booking with no
          qualifying touch inside the window is recorded and credited nothing.
        </p>
      </form>

      <div className="hairline-t" style={{ marginTop: 24, paddingTop: 16, display: "grid", gap: 12 }}>
        <p className="t-label" style={{ margin: 0 }}>
          Suppression
        </p>

        {!patient.emailOptedOut && patient.hasEmail && (
          <form action={optOutAction}>
            <input type="hidden" name="patientId" value={patient.id} />
            <input type="hidden" name="channel" value="email" />
            <button className="btn-quiet" type="submit" disabled={optingOut} style={{ color: "var(--color-red)" }}>
              Record an email unsubscribe
            </button>
          </form>
        )}

        {!patient.smsOptedOut && patient.hasPhone && (
          <form action={optOutAction}>
            <input type="hidden" name="patientId" value={patient.id} />
            <input type="hidden" name="channel" value="sms" />
            <button className="btn-quiet" type="submit" disabled={optingOut} style={{ color: "var(--color-red)" }}>
              Record a STOP reply
            </button>
          </form>
        )}

        <form action={dncAction}>
          <input type="hidden" name="patientId" value={patient.id} />
          <input type="hidden" name="on" value={patient.doNotContact ? "0" : "1"} />
          <button
            className={patient.doNotContact ? "btn btn-secondary" : "btn btn-secondary hold"}
            type="submit"
            disabled={dncPending}
            style={{
              width: "100%",
              color: patient.doNotContact ? "var(--color-ink)" : "var(--color-red)",
              borderColor: patient.doNotContact ? "var(--color-hairline)" : "var(--color-red)",
            }}
            onPointerDown={(event) =>
              !patient.doNotContact && event.currentTarget.setAttribute("data-holding", "true")
            }
            onPointerUp={(event) => event.currentTarget.removeAttribute("data-holding")}
            onPointerLeave={(event) => event.currentTarget.removeAttribute("data-holding")}
          >
            <Icon name="pause-octagon" size={18} />
            {patient.doNotContact ? "Allow contact again" : "Do not contact"}
          </button>
          {!patient.doNotContact && (
            <p className="t-label" style={{ margin: "8px 0 0" }}>
              Hold to confirm · stops every campaign and the call queue
            </p>
          )}
        </form>
      </div>
    </>
  );
}
