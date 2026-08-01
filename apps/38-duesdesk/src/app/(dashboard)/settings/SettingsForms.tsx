"use client";

import { ActionForm } from "@/components/ActionForm";
import type { ReminderRung } from "@/db/schema";
import {
  inviteBoardMemberAction,
  refreshConnectAction,
  saveAssociationAction,
  saveLadderAction,
  setRoleAction,
} from "./actions";

export function AssociationForm({
  name,
  timezone,
  invoiceFooter,
  fiscalYearStartMonth,
}: {
  name: string;
  timezone: string;
  invoiceFooter: string;
  fiscalYearStartMonth: number;
}) {
  return (
    <ActionForm action={saveAssociationAction} submitLabel="Save" full>
      <label className="field">
        <span className="t-label">Association name</span>
        <input className="input" name="name" defaultValue={name} required />
      </label>
      <div className="flex gap-3">
        <label className="field flex-1">
          <span className="t-label">Time zone</span>
          <input className="input" name="timezone" defaultValue={timezone} />
        </label>
        <label className="field flex-1">
          <span className="t-label">Fiscal year starts</span>
          <select className="input" name="fiscalYearStartMonth" defaultValue={fiscalYearStartMonth}>
            {[
              "January",
              "February",
              "March",
              "April",
              "May",
              "June",
              "July",
              "August",
              "September",
              "October",
              "November",
              "December",
            ].map((month, index) => (
              <option key={month} value={index + 1}>
                {month}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="t-label">Note on every invoice</span>
        <textarea className="input" name="invoiceFooter" defaultValue={invoiceFooter} />
      </label>
    </ActionForm>
  );
}

export function LadderForm({
  ladder,
  smsAllowed,
  upgradeName,
}: {
  ladder: ReminderRung[];
  smsAllowed: boolean;
  upgradeName: string;
}) {
  return (
    <ActionForm action={saveLadderAction} submitLabel="Save the ladder" full>
      {ladder.map((rung, index) => (
        <div key={index} className={index === 0 ? "" : "hairline-t pt-4"}>
          <p className="t-label">
            Step {index + 1} · {rung.tone}
          </p>
          <div className="mt-2 flex gap-3">
            <label className="field flex-1">
              <span className="t-label">Days after due</span>
              <input
                className="input input-mono"
                name={`afterDays_${index}`}
                type="number"
                min={1}
                max={365}
                defaultValue={rung.afterDays}
              />
            </label>
            <label className="field flex-1">
              <span className="t-label">Channel</span>
              <select
                className="input"
                name={`channel_${index}`}
                defaultValue={rung.channel}
                disabled={!smsAllowed}
              >
                <option value="email">Email</option>
                <option value="sms">Text message</option>
              </select>
            </label>
          </div>
          <label className="field mt-3">
            <span className="t-label">Subject</span>
            <input className="input" name={`subject_${index}`} defaultValue={rung.subject} />
          </label>
          <label className="field mt-3">
            <span className="t-label">Message</span>
            <textarea className="input" name={`body_${index}`} defaultValue={rung.body} />
          </label>
        </div>
      ))}
      <p className="t-secondary">
        Each invoice receives at most one step, and only a step it has newly crossed. An invoice that
        is 40 days late with nothing sent yet gets step 3 — not a gentle nudge pretending it is day
        three.
        {smsAllowed
          ? ""
          : ` Text steps need ${upgradeName}; until then they are delivered by email so the ladder never goes silent.`}
      </p>
    </ActionForm>
  );
}

export function InviteForm({
  rolesAllowed,
  upgradeName,
}: {
  rolesAllowed: boolean;
  upgradeName: string;
}) {
  return (
    <ActionForm action={inviteBoardMemberAction} submitLabel="Add to the board" variant="secondary" full>
      <label className="field">
        <span className="t-label">Name</span>
        <input className="input" name="name" required placeholder="Ruth Nakamura" />
      </label>
      <label className="field">
        <span className="t-label">Email</span>
        <input className="input" name="email" type="email" required placeholder="ruth@example.com" />
      </label>
      <div className="flex gap-3">
        <label className="field flex-1">
          <span className="t-label">Role</span>
          <select className="input" name="role" defaultValue="secretary">
            <option value="treasurer">Treasurer</option>
            <option value="secretary">Secretary</option>
            <option value="president">President</option>
            <option value="member">Board member (read-only)</option>
          </select>
        </label>
        <label className="field flex-1">
          <span className="t-label">Term note</span>
          <input className="input" name="termNote" placeholder="Secretary since Mar 2026" />
        </label>
      </div>
      <p className="t-secondary">
        Board seats are unlimited and free — a volunteer board rotates, and charging per seat would
        punish good governance.
        {rolesAllowed ? "" : ` Roles beyond read-only come with ${upgradeName}.`}
      </p>
    </ActionForm>
  );
}

export function RoleForm({
  userId,
  current,
  name,
}: {
  userId: string;
  current: string;
  name: string;
}) {
  return (
    <ActionForm action={setRoleAction} submitLabel="Change role" variant="quiet">
      <input type="hidden" name="userId" value={userId} />
      <label className="field">
        <span className="t-label">{name}</span>
        <select className="input" name="role" defaultValue={current}>
          <option value="president">President</option>
          <option value="treasurer">Treasurer</option>
          <option value="secretary">Secretary</option>
          <option value="member">Board member (read-only)</option>
        </select>
      </label>
    </ActionForm>
  );
}

export function RefreshConnectForm() {
  return (
    <ActionForm action={refreshConnectAction} submitLabel="Check with Stripe again" variant="secondary" small>
      <p className="t-secondary">
        Onboarding happens in Stripe&apos;s own tab. Once it is done, this pulls the answer back.
      </p>
    </ActionForm>
  );
}
