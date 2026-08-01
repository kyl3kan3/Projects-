"use client";

/**
 * The send form. A client component only because picking an existing patient
 * prefills five fields and the channel toggles gate which contact field is
 * required — everything else is a plain form post to the server action.
 *
 * It receives already-decrypted patient summaries as props. It never imports a
 * server module, so nothing here can drag the database client into the browser.
 */

import { useActionState, useState } from "react";
import { sendIntakeAction, type SendIntakeState } from "../actions";
import { IconAlert, IconSend } from "@/components/icons";

export interface PatientOption {
  id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dob: string | null;
}

export function SendIntakeForm({
  forms,
  patients,
  staff,
  defaultAssigneeId,
}: {
  forms: { id: string; title: string; version: number }[];
  patients: PatientOption[];
  staff: { id: string; name: string }[];
  defaultAssigneeId: string;
}) {
  const [state, formAction, pending] = useActionState<SendIntakeState, FormData>(sendIntakeAction, {
    error: null,
  });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [byEmail, setByEmail] = useState(true);
  const [bySms, setBySms] = useState(false);

  function prefill(id: string) {
    const patient = patients.find((p) => p.id === id);
    if (!patient) return;
    setFirstName(patient.firstName);
    setLastName(patient.lastName);
    setEmail(patient.email ?? "");
    setPhone(patient.phone ?? "");
    setDob(patient.dob ?? "");
  }

  return (
    <form action={formAction} noValidate>
      {patients.length > 0 && (
        <label className="field">
          <span className="field-label">Returning patient</span>
          <select
            className="input"
            defaultValue=""
            onChange={(e) => prefill(e.target.value)}
            aria-label="Prefill from an existing patient"
          >
            <option value="">New patient</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </select>
          <span className="field-help">
            Choosing a name fills the fields below. The same person keeps one record, so a records
            request returns one history.
          </span>
        </label>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="field">
          <span className="field-label">First name</span>
          <input
            className="input"
            name="firstName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="off"
            required
          />
        </label>
        <label className="field">
          <span className="field-label">Last name</span>
          <input
            className="input"
            name="lastName"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="off"
            required
          />
        </label>
      </div>

      <label className="field">
        <span className="field-label">Date of birth (optional)</span>
        <input
          className="input input-mono"
          name="dob"
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
        />
      </label>

      <label className="field">
        <span className="field-label">Email</span>
        <input
          className="input"
          name="email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="patient@example.com"
        />
      </label>

      <label className="field">
        <span className="field-label">Mobile number</span>
        <input
          className="input input-mono"
          name="phone"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 303 555 0117"
        />
      </label>

      <label className="field">
        <span className="field-label">Packet</span>
        <select className="input" name="formId" required defaultValue={forms[0]?.id}>
          {forms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title} — v{f.version}
            </option>
          ))}
        </select>
      </label>

      {staff.length > 1 && (
        <label className="field">
          <span className="field-label">Assign to</span>
          <select className="input" name="assignedUserId" defaultValue={defaultAssigneeId}>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {staff.length <= 1 && <input type="hidden" name="assignedUserId" value={defaultAssigneeId} />}

      <fieldset className="field" style={{ border: "none", padding: 0, margin: "0 0 20px" }}>
        <legend className="field-label" style={{ padding: 0 }}>
          How to reach them
        </legend>
        <label className="choice">
          <input
            type="checkbox"
            name="channelEmail"
            checked={byEmail}
            onChange={(e) => setByEmail(e.target.checked)}
            style={{ width: 20, height: 20, accentColor: "var(--color-teal)" }}
          />
          <span className="choice-label">Email the link</span>
        </label>
        <label className="choice">
          <input
            type="checkbox"
            name="channelSms"
            checked={bySms}
            onChange={(e) => setBySms(e.target.checked)}
            style={{ width: 20, height: 20, accentColor: "var(--color-teal)" }}
          />
          <span className="choice-label">Text the link too</span>
        </label>
        <p className="field-help">
          Reminders follow at 48 hours, 5 days and 10 days, shifted out of your quiet hours, and
          stop the moment the packet is finished.
        </p>
      </fieldset>

      {state.error && (
        <p
          className="mb-5 flex items-start gap-2 text-[13px] leading-[1.45]"
          style={{ color: "var(--color-clay)" }}
          role="alert"
        >
          <IconAlert size={18} />
          <span>{state.error}</span>
        </p>
      )}

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        <IconSend size={18} />
        {pending ? "Sending…" : "Send the packet"}
      </button>
    </form>
  );
}
