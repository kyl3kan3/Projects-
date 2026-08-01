"use client";

import { useActionState } from "react";
import { submitApplicationAction, type ApplyState } from "./actions";
import { formatMoney } from "@/lib/money";

export function ApplicationForm({
  slug,
  rentCents,
  availableOn,
}: {
  slug: string;
  rentCents: number;
  availableOn: string;
}) {
  const [state, formAction, pending] = useActionState<ApplyState, FormData>(submitApplicationAction, {});

  if (state.ok) {
    return (
      <div className="notice" data-tone="good">
        <p className="t-title">Sent.</p>
        <p className="t-secondary mt-2">
          The landlord has it, with anything you attached. They will contact you at the email and phone number you gave.
          If they want a screening check, you will get a separate email asking you to authorise it — nothing is run
          without that.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />

      <label className="field">
        <span className="t-label">Your full name</span>
        <input className="input" name="applicantName" required autoComplete="name" placeholder="Marta Alvarez" />
      </label>

      <div className="flex flex-col gap-4 sm:flex-row">
        <label className="field flex-1">
          <span className="t-label">Email</span>
          <input className="input input-mono" name="applicantEmail" type="email" required autoComplete="email" placeholder="marta@example.com" />
        </label>
        <label className="field flex-1">
          <span className="t-label">Mobile</span>
          <input className="input input-mono" name="applicantPhone" required autoComplete="tel" inputMode="tel" placeholder="937-555-0142" />
        </label>
      </div>

      <label className="field">
        <span className="t-label">Where you live now</span>
        <input className="input" name="currentAddress" required autoComplete="street-address" placeholder="88 Warren Street, Apt 3, Dayton OH" />
      </label>

      <div className="flex flex-col gap-4 sm:flex-row">
        <label className="field flex-1">
          <span className="t-label">Move-in date you want</span>
          <input className="input input-mono" name="moveInOn" type="date" required defaultValue={availableOn} />
        </label>
        <label className="field w-full sm:w-[140px]">
          <span className="t-label">People living there</span>
          <input className="input input-mono" name="occupants" type="number" min={1} max={12} defaultValue={2} required />
        </label>
      </div>

      <h3 className="t-label mt-4">Work and income</h3>

      <div className="flex flex-col gap-4 sm:flex-row">
        <label className="field flex-1">
          <span className="t-label">Employer</span>
          <input className="input" name="employer" placeholder="Kettering Health" />
        </label>
        <label className="field flex-1">
          <span className="t-label">Your role</span>
          <input className="input" name="jobTitle" placeholder="Respiratory therapist" />
        </label>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <label className="field flex-1">
          <span className="t-label">Monthly income before tax</span>
          <input className="input input-mono" name="monthlyIncome" inputMode="decimal" placeholder="5400" />
          <span className="t-secondary">Rent here is {formatMoney(rentCents)} a month.</span>
        </label>
        <label className="field w-full sm:w-[160px]">
          <span className="t-label">Years there</span>
          <input className="input input-mono" name="employmentYears" type="number" step="0.5" min={0} max={60} placeholder="3" />
        </label>
      </div>

      <h3 className="t-label mt-4">Where you live now</h3>

      <div className="flex flex-col gap-4 sm:flex-row">
        <label className="field flex-1">
          <span className="t-label">Current landlord</span>
          <input className="input" name="previousLandlordName" placeholder="Ray Doyle" />
        </label>
        <label className="field flex-1">
          <span className="t-label">Their phone</span>
          <input className="input input-mono" name="previousLandlordPhone" inputMode="tel" placeholder="937-555-0188" />
        </label>
      </div>

      <label className="field">
        <span className="t-label">Pets</span>
        <input className="input" name="pets" placeholder="One cat, six years old, spayed" />
      </label>

      <label className="field">
        <span className="t-label">Vehicles</span>
        <input className="input" name="vehicles" placeholder="2016 Honda Civic" />
      </label>

      <label className="flex items-center gap-3">
        <input type="checkbox" name="smoker" />
        <span className="t-body">Someone moving in smokes</span>
      </label>

      <label className="field">
        <span className="t-label">Anything else</span>
        <textarea
          className="input"
          name="notes"
          rows={4}
          placeholder="I work nights at the hospital, so I am quiet during the day. Happy to give you my current landlord's number — I have been there four years."
        />
      </label>

      <label className="field">
        <span className="t-label">Documents</span>
        <input
          className="input"
          style={{ paddingTop: 12 }}
          type="file"
          name="documents"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          multiple
        />
        <span className="t-secondary">
          A photo of your ID and a recent pay stub speed this up a lot. PDF or photo, up to 12MB each. Only your landlord
          can open them.
        </span>
      </label>

      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-red)" }} role="alert">
          {state.error}
        </p>
      ) : null}

      <button className="btn btn-primary btn-full mt-2" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send my application"}
      </button>

      <p className="t-secondary">
        Nothing to pay to apply. If the landlord asks for a screening check you will be emailed separately to authorise
        it, and you pay the screening company directly — not TenantFile.
      </p>
    </form>
  );
}
