"use client";

import { ActionForm } from "@/components/ActionForm";
import {
  createScheduleAction,
  generateRunAction,
  specialAssessmentAction,
} from "../actions";

export function RunForm({ scheduleId, periodIndex }: { scheduleId: string; periodIndex: number }) {
  return (
    <ActionForm
      action={generateRunAction}
      submitLabel="Generate this run"
      pendingLabel="Generating…"
      variant="primary"
      full
    >
      <input type="hidden" name="scheduleId" value={scheduleId} />
      <input type="hidden" name="periodIndex" value={periodIndex} />
      <p className="t-secondary">
        Households are emailed their invoice with a payment link. Running this twice creates nothing
        the second time.
      </p>
    </ActionForm>
  );
}

export function NewScheduleForm({
  todayIso,
  lateFeesAllowed,
  upgradeName,
}: {
  todayIso: string;
  lateFeesAllowed: boolean;
  upgradeName: string;
}) {
  return (
    <ActionForm action={createScheduleAction} submitLabel="Create the schedule" full>
      <label className="field">
        <span className="t-label">Name</span>
        <input className="input" name="name" required placeholder="2026 Quarterly Dues" />
      </label>

      <div className="flex gap-3">
        <label className="field flex-1">
          <span className="t-label">Cadence</span>
          <select className="input" name="cadence" defaultValue="quarterly">
            <option value="quarterly">Quarterly</option>
            <option value="monthly">Monthly</option>
            <option value="annual">Annual</option>
          </select>
        </label>
        <label className="field flex-1">
          <span className="t-label">Per household</span>
          <input
            className="input input-mono"
            name="amount"
            inputMode="decimal"
            required
            placeholder="180.00"
          />
        </label>
      </div>

      <div className="flex gap-3">
        <label className="field flex-1">
          <span className="t-label">First period starts</span>
          <input
            className="input input-mono"
            name="startsOn"
            type="date"
            defaultValue={todayIso}
            required
          />
        </label>
        <label className="field flex-1">
          <span className="t-label">Due day</span>
          <input
            className="input input-mono"
            name="dueDay"
            type="number"
            min={1}
            max={28}
            defaultValue={1}
          />
        </label>
      </div>

      <div className="flex gap-3">
        <label className="field flex-1">
          <span className="t-label">Grace days</span>
          <input
            className="input input-mono"
            name="graceDays"
            type="number"
            min={0}
            max={90}
            defaultValue={10}
          />
        </label>
        <label className="field flex-1">
          <span className="t-label">Late fee</span>
          <input
            className="input input-mono"
            name="lateFee"
            inputMode="decimal"
            defaultValue={lateFeesAllowed ? "15.00" : "0.00"}
            disabled={!lateFeesAllowed}
          />
        </label>
      </div>

      {!lateFeesAllowed ? (
        <p className="t-secondary">
          Late-fee rules come with {upgradeName}. Schedules created now simply carry no fee; you can
          switch fees on later without re-creating anything.
        </p>
      ) : null}

      <label className="flex items-center gap-3">
        <input type="checkbox" name="prorate" defaultChecked className="h-5 w-5" />
        <span className="t-secondary" style={{ color: "var(--color-ink)" }}>
          Prorate mid-period joiners by the days they own the unit
        </span>
      </label>
      <p className="t-secondary">
        With proration on, a household that closes on May 12 in an Apr–Jun quarter pays 50 of 91
        days. The seller pays the other 41, so the period is charged exactly once.
      </p>
    </ActionForm>
  );
}

export function SpecialAssessmentForm({
  todayIso,
  households,
}: {
  todayIso: string;
  households: number;
}) {
  return (
    <ActionForm action={specialAssessmentAction} submitLabel="Create the assessment" full confirmHold>
      <label className="field">
        <span className="t-label">Name</span>
        <input
          className="input"
          name="name"
          required
          placeholder="Roof Special Assessment"
        />
      </label>
      <div className="flex gap-3">
        <label className="field flex-1">
          <span className="t-label">Per household</span>
          <input
            className="input input-mono"
            name="amount"
            inputMode="decimal"
            required
            placeholder="450.00"
          />
        </label>
        <label className="field flex-1">
          <span className="t-label">Due</span>
          <input className="input input-mono" name="dueOn" type="date" defaultValue={todayIso} required />
        </label>
      </div>
      <p className="t-secondary">
        Every one of your {households} active households gets the same amount — a roof costs the
        same whoever owns the unit this month, so special assessments are never prorated.
      </p>
    </ActionForm>
  );
}
