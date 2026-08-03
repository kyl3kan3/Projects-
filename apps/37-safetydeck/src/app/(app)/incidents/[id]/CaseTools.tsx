"use client";

import { useEffect, useState } from "react";
import { recordOshaReportAction, updateDayCountsAction } from "../actions";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { countdownLabel } from "@/lib/dates";
import { IconAlertTriangle, IconPhone } from "@/components/icons";

export interface DutyProps {
  hours: 8 | 24;
  reason: string;
  citation: string;
  deadlineIso: string;
  phone: string;
  phoneLabel: string;
  portal: string;
  note: string;
}

/**
 * The two things that change on an open case: the day counts, and whether the
 * severe-incident notification happened.
 *
 * The countdown ticks on the client because a deadline rendered once on the server
 * is wrong by the time anyone reads it — and this is the one number in the product
 * where being wrong by an hour matters.
 */
export function CaseTools({
  incidentId,
  daysAway,
  daysRestricted,
  stillCounting,
  duty,
  reportedAt,
  reportNote,
}: {
  incidentId: string;
  daysAway: number;
  daysRestricted: number;
  stillCounting: boolean;
  duty: DutyProps | null;
  reportedAt: string;
  reportNote: string;
}) {
  return (
    <>
      {duty ? (
        <DutyBlock
          duty={duty}
          incidentId={incidentId}
          reportedAt={reportedAt}
          reportNote={reportNote}
        />
      ) : null}

      <ActionForm action={updateDayCountsAction} className="mt-10">
        <input type="hidden" name="incidentId" value={incidentId} />
        <p className="t-label">Day counts</p>
        <p className="t-secondary mt-2">
          Update these as the worker's situation changes. Counting stops at 180 days combined,
          per 1904.7(b)(3)(vii), and the classification is re-derived when you save.
        </p>
        <div className="mt-3 flex gap-3">
          <label className="flex flex-1 flex-col gap-2">
            <span className="t-secondary">Days away</span>
            <input
              className="input input-mono"
              type="number"
              min={0}
              name="daysAway"
              defaultValue={daysAway}
            />
          </label>
          <label className="flex flex-1 flex-col gap-2">
            <span className="t-secondary">Days restricted</span>
            <input
              className="input input-mono"
              type="number"
              min={0}
              name="daysRestricted"
              defaultValue={daysRestricted}
            />
          </label>
        </div>
        <label className="mt-3 flex items-center gap-3">
          <input
            type="checkbox"
            name="stillCounting"
            value="yes"
            defaultChecked={stillCounting}
            style={{ width: 20, height: 20, accentColor: "var(--color-hardhat)" }}
          />
          <span className="t-secondary">Still off work or still restricted</span>
        </label>
        <div className="mt-4">
          <SubmitButton className="btn btn-secondary btn-full" pendingLabel="Saving…">
            Update day counts
          </SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}

function DutyBlock({
  duty,
  incidentId,
  reportedAt,
  reportNote,
}: {
  duty: DutyProps;
  incidentId: string;
  reportedAt: string;
  reportNote: string;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const deadline = new Date(duty.deadlineIso);
  const done = Boolean(reportedAt);

  return (
    <section className="mt-8">
      <div
        className="panel p-5"
        style={{ borderLeft: `2px solid ${done ? "var(--color-green)" : "var(--color-red)"}` }}
      >
        <div className="flex items-center gap-2">
          <IconAlertTriangle
            size={20}
            style={{ color: done ? "var(--color-green)" : "var(--color-red)" }}
          />
          <p className="t-label" style={{ color: done ? "var(--color-green)" : "var(--color-red)" }}>
            {duty.hours}-hour reporting duty · {duty.citation}
          </p>
        </div>
        <p className="t-title mt-2">{duty.reason}</p>
        {done ? (
          <p className="t-data mt-2" style={{ color: "var(--color-green)" }}>
            REPORTED {reportedAt.replace("T", " ")}
          </p>
        ) : (
          <>
            <p className="t-stat mt-2">{countdownLabel(deadline, now)}</p>
            <p className="t-data mt-1" style={{ color: "var(--color-fg-3)" }}>
              DUE {deadline.toISOString().slice(0, 16).replace("T", " ")} UTC
            </p>
          </>
        )}
        <p className="t-secondary mt-3">{duty.note}</p>
        <div className="mt-3 flex flex-wrap gap-4">
          <a className="btn-quiet" href={`tel:${duty.phone}`}>
            <IconPhone size={16} />
            {duty.phoneLabel}
          </a>
          <a className="btn-quiet" href={duty.portal} target="_blank" rel="noreferrer">
            osha.gov/report
          </a>
        </div>
      </div>

      <ActionForm action={recordOshaReportAction} className="mt-5">
        <input type="hidden" name="incidentId" value={incidentId} />
        <p className="t-label">Record what you did</p>
        <label className="mt-3 flex flex-col gap-2">
          <span className="t-secondary">When you notified OSHA</span>
          <input
            className="input input-mono"
            type="datetime-local"
            name="reportedAt"
            defaultValue={reportedAt}
          />
        </label>
        <label className="mt-3 flex flex-col gap-2">
          <span className="t-secondary">Who you spoke to, and what you told them</span>
          <input
            className="input"
            name="note"
            defaultValue={reportNote}
            placeholder="Called the hotline, spoke to duty officer, ref 2026-04-118"
          />
        </label>
        <div className="mt-4">
          <SubmitButton className="btn btn-secondary btn-full" pendingLabel="Saving…">
            Save the notification record
          </SubmitButton>
        </div>
      </ActionForm>
    </section>
  );
}
