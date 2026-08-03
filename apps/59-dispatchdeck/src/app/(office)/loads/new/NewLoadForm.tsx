"use client";

/**
 * Type a load in from scratch — the sixty-second path the product promises when
 * a parse fails or a broker calls with a load instead of emailing one.
 *
 * Two stops are there from the start because that is what a load is; a third and
 * fourth appear only if asked for. The rate accepts "1850", "1,850" or "$1850.00"
 * because that is how people type money, and it is parsed to cents once.
 */

import { useActionState, useState } from "react";
import { ActionMessage, Field, SubmitButton, type ActionState } from "@/components/form";
import { PlusIcon } from "@/components/icons";
import { EQUIPMENT_LABELS } from "@/lib/format";
import { JURISDICTION_CODES } from "@/lib/jurisdictions";
import { createLoadAction } from "../actions";

export interface Option {
  id: string;
  label: string;
}

export function NewLoadForm({
  brokers,
  trucks,
  drivers,
}: {
  brokers: Option[];
  trucks: Option[];
  drivers: Option[];
}) {
  const [state, action] = useActionState<ActionState | null, FormData>(createLoadAction, null);
  const [stopCount, setStopCount] = useState(2);

  return (
    <form action={action} noValidate>
      <ActionMessage state={state} />
      <input type="hidden" name="stopCount" value={stopCount} />

      <Field label="Broker" htmlFor="brokerId" hint="Terms and the bill-to come from the broker book.">
        <select id="brokerId" name="brokerId" defaultValue="">
          <option value="">No broker yet</option>
          {brokers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Broker load number" htmlFor="reference" hint="What they will quote back at you.">
        <input id="reference" name="reference" placeholder="SF-448127" />
      </Field>

      <Field label="Rate" htmlFor="rate" hint="Linehaul plus any fuel surcharge rolled in.">
        <input id="rate" name="rate" inputMode="decimal" required placeholder="1850.00" />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Loaded miles" htmlFor="totalMiles">
          <input id="totalMiles" name="totalMiles" inputMode="numeric" placeholder="642" />
        </Field>
        <Field label="Deadhead" htmlFor="deadheadMiles">
          <input id="deadheadMiles" name="deadheadMiles" inputMode="numeric" placeholder="88" />
        </Field>
      </div>

      <Field label="Equipment" htmlFor="equipment">
        <select id="equipment" name="equipment" defaultValue="van">
          {Object.entries(EQUIPMENT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Truck" htmlFor="truckId">
          <select id="truckId" name="truckId" defaultValue="">
            <option value="">Unassigned</option>
            {trucks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Driver" htmlFor="driverUserId">
          <select id="driverUserId" name="driverUserId" defaultValue="">
            <option value="">Unassigned</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <h2 className="t-h2 mt-8 mb-4">Stops</h2>

      {Array.from({ length: stopCount }, (_, index) => (
        <fieldset key={index} className="panel p-4 mb-4" style={{ border: "1px solid var(--line)" }}>
          <legend className="t-placard px-1">Stop {index + 1}</legend>

          <Field label="Type" htmlFor={`stop${index}Kind`}>
            <select
              id={`stop${index}Kind`}
              name={`stop${index}Kind`}
              defaultValue={index === 0 ? "pickup" : "delivery"}
            >
              <option value="pickup">Pickup</option>
              <option value="delivery">Delivery</option>
            </select>
          </Field>

          <Field label="Facility" htmlFor={`stop${index}Facility`}>
            <input
              id={`stop${index}Facility`}
              name={`stop${index}Facility`}
              placeholder={index === 0 ? "Kellogg Distribution Center" : "Wright Cold Storage"}
            />
          </Field>

          <Field label="Street address" htmlFor={`stop${index}Address`}>
            <input
              id={`stop${index}Address`}
              name={`stop${index}Address`}
              placeholder={index === 0 ? "2200 Industrial Blvd" : "910 Getwell Rd"}
            />
          </Field>

          <div className="grid grid-cols-[1fr_auto] gap-4">
            <Field label="City" htmlFor={`stop${index}City`}>
              <input
                id={`stop${index}City`}
                name={`stop${index}City`}
                required={index < 2}
                placeholder={index === 0 ? "Dallas" : "Memphis"}
              />
            </Field>
            <Field label="State" htmlFor={`stop${index}State`}>
              <select
                id={`stop${index}State`}
                name={`stop${index}State`}
                defaultValue={index === 0 ? "TX" : "TN"}
                style={{ width: 96 }}
              >
                {JURISDICTION_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Window opens"
              htmlFor={`stop${index}WindowStart`}
              hint="Local time at the dock."
            >
              <input
                id={`stop${index}WindowStart`}
                name={`stop${index}WindowStart`}
                type="datetime-local"
              />
            </Field>
            <Field label="Window closes" htmlFor={`stop${index}WindowEnd`}>
              <input
                id={`stop${index}WindowEnd`}
                name={`stop${index}WindowEnd`}
                type="datetime-local"
              />
            </Field>
          </div>

          <Field label="Appointment / PU number" htmlFor={`stop${index}Ref`}>
            <input id={`stop${index}Ref`} name={`stop${index}Ref`} placeholder="55219" />
          </Field>
        </fieldset>
      ))}

      {stopCount < 6 ? (
        <button
          type="button"
          className="btn btn-secondary w-full mb-6"
          onClick={() => setStopCount((n) => n + 1)}
        >
          <PlusIcon size={20} />
          Add another stop
        </button>
      ) : null}

      <Field label="Notes" htmlFor="notes" hint="Anything the driver needs. Lumper policy, gate code, dock hours.">
        <textarea id="notes" name="notes" rows={3} placeholder="Driver-assist unload. Lumper receipt required." />
      </Field>

      <SubmitButton pendingLabel="Creating…">Create load</SubmitButton>
    </form>
  );
}
