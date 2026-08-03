"use client";

import { saveCompanyAction } from "./actions";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { dayName } from "@/lib/dates";

/**
 * Company details — which are also the 300A's establishment header, which is why
 * NAICS and the address are here rather than buried. A 300A with a blank
 * establishment block is a 300A that gets handed back.
 */
export function CompanyForm({
  company,
}: {
  company: {
    name: string;
    establishmentName: string;
    streetAddress: string;
    city: string;
    state: string;
    postalCode: string;
    naicsCode: string;
    industryDescription: string;
    timezone: string;
    talkDay: number;
    missedGraceHours: number;
    opsEmail: string;
    opsPhone: string;
  };
}) {
  return (
    <ActionForm action={saveCompanyAction} className="mt-10">
      <h2 className="t-label">Company and establishment</h2>
      <p className="t-secondary mt-2">
        These fields print at the top of the OSHA 300 and 300A.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        <Field label="Company name" name="name" defaultValue={company.name} required />
        <Field
          label="Establishment name on the forms"
          name="establishmentName"
          defaultValue={company.establishmentName}
          placeholder="Same as the company name"
        />
        <Field label="Street address" name="streetAddress" defaultValue={company.streetAddress} placeholder="1420 Fremont Ave" />
        <div className="flex gap-3">
          <Field label="City" name="city" defaultValue={company.city} placeholder="Spokane" className="flex-1" />
          <Field label="State" name="state" defaultValue={company.state} placeholder="WA" className="w-24" />
          <Field label="ZIP" name="postalCode" defaultValue={company.postalCode} placeholder="99201" className="w-28" mono />
        </div>
        <div className="flex gap-3">
          <Field label="NAICS code" name="naicsCode" defaultValue={company.naicsCode} placeholder="238220" className="w-36" mono />
          <Field
            label="Industry description"
            name="industryDescription"
            defaultValue={company.industryDescription}
            placeholder="Plumbing, heating and air-conditioning contractor"
            className="flex-1"
          />
        </div>
        <Field
          label="Time zone"
          name="timezone"
          defaultValue={company.timezone}
          placeholder="America/Los_Angeles"
          required
          mono
        />
      </div>

      <h2 className="t-label mt-8">Cadence and reminders</h2>
      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="t-label">Default talk day</span>
          <select className="input" name="talkDay" defaultValue={company.talkDay}>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <option key={d} value={d}>
                {dayName(d)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-label">Hours before an unsigned talk counts as missed</span>
          <input
            className="input input-mono"
            type="number"
            min={0}
            max={120}
            name="missedGraceHours"
            defaultValue={company.missedGraceHours}
          />
        </label>
        <Field
          label="Ops email for reminders"
          name="opsEmail"
          defaultValue={company.opsEmail}
          placeholder="ops@ridgelinemech.com"
        />
        <Field
          label="Ops mobile for the 7-day and expired rungs"
          name="opsPhone"
          defaultValue={company.opsPhone}
          placeholder="+15095550142"
          mono
        />
      </div>

      <div className="mt-6">
        <SubmitButton className="btn btn-secondary btn-full" pendingLabel="Saving…">
          Save settings
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  required,
  className,
  mono,
}: {
  label: string;
  name: string;
  defaultValue: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  mono?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-2 ${className ?? ""}`}>
      <span className="t-label">{label}</span>
      <input
        className={`input ${mono ? "input-mono" : ""}`}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
      />
    </label>
  );
}
