"use client";

/**
 * The interactive parts of a grant: stage move, add a date, enter an award, edit
 * the checklist. Split out as a client island so the page itself stays a server
 * component — nothing here imports anything that can reach the database client.
 */

import { useActionState, useState } from "react";
import { Sheet } from "@/components/Sheet";
import {
  IconCheck,
  IconChevronDown,
  IconEdit,
  IconPlus,
  IconTrash,
} from "@/components/icons";
import { REPORT_SCHEDULES, type ReportScheduleKey } from "@/lib/reminders";
import { answerKindLabel, excerpt } from "@/lib/answers";
import type { AnswerKind, GrantStage, WorkspaceStatus } from "@/db/schema";
import {
  addDeadlineAction,
  addRequirementAction,
  enterAwardAction,
  linkAnswerAction,
  moveStageAction,
  saveDraftAction,
  updateGrantAction,
  type ActionState,
} from "../actions";

const INITIAL: ActionState = { error: null };

export interface StageOption {
  id: GrantStage;
  label: string;
  hint: string;
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="t-secondary" role="alert" style={{ color: "var(--color-brick-text)" }}>
      {error}
    </p>
  );
}

/* ------------------------------------------------------------------- stage --- */

export function StageMover({
  grantId,
  stage,
  stages,
  prompt,
}: {
  grantId: string;
  stage: GrantStage;
  stages: StageOption[];
  prompt: string | null;
}) {
  const [state, formAction, pending] = useActionState(moveStageAction, INITIAL);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <span className="t-label">Stage</span>
      <input type="hidden" name="grantId" value={grantId} />
      <div className="flex gap-2">
        <select className="select min-w-0 flex-1" name="stage" defaultValue={stage}>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary shrink-0" type="submit" disabled={pending}>
          {pending ? "Moving…" : "Move"}
        </button>
      </div>
      {prompt ? (
        <p className="t-secondary" style={{ color: "var(--color-ink-2)" }}>
          {prompt}
        </p>
      ) : null}
      <ErrorLine error={state.error} />
    </form>
  );
}

/* --------------------------------------------------------------- deadlines --- */

export function AddDeadline({ grantId }: { grantId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(addDeadlineAction, INITIAL);

  return (
    <>
      <button type="button" className="btn-quiet" onClick={() => setOpen(true)}>
        <IconPlus size={18} />
        Add a date
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Add a date">
        <form action={formAction} className="flex flex-col gap-4 pt-2">
          <input type="hidden" name="grantId" value={grantId} />
          <label className="flex flex-col gap-2">
            <span className="t-label">Kind</span>
            <select className="select" name="kind" defaultValue="application">
              <option value="loi">LOI</option>
              <option value="application">Application</option>
              <option value="report">Report</option>
              <option value="renewal">Renewal window</option>
              <option value="custom">Other task</option>
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Due on</span>
            <input className="input t-data-lg" type="date" name="dueOn" required />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Label</span>
            <input
              className="input"
              name="label"
              placeholder="Interim report — narrative plus expense detail"
            />
          </label>
          <ErrorLine error={state.error} />
          <button className="btn btn-primary w-full" type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add date"}
          </button>
          <p className="t-secondary" style={{ color: "var(--color-ink-2)" }}>
            Reminders start automatically: 14 days out, 7 days out, the day before, and
            one final notice if it slips. Four emails, never more.
          </p>
        </form>
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------------------ awards --- */

export function AwardEntry({
  grantId,
  today,
  defaultAmount,
  existing,
}: {
  grantId: string;
  today: string;
  defaultAmount: string;
  existing: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [schedule, setSchedule] = useState<ReportScheduleKey>("interim_final");
  const [state, formAction, pending] = useActionState(enterAwardAction, INITIAL);

  return (
    <>
      <button
        type="button"
        className={existing ? "btn btn-secondary w-full" : "btn btn-primary w-full"}
        onClick={() => setOpen(true)}
      >
        {existing ? (
          <>
            <IconEdit size={18} />
            Edit the award
          </>
        ) : (
          <>
            <IconCheck size={18} />
            Enter an award
          </>
        )}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Enter the award">
        <form action={formAction} className="flex flex-col gap-4 pt-2">
          <input type="hidden" name="grantId" value={grantId} />
          <label className="flex flex-col gap-2">
            <span className="t-label">Amount awarded</span>
            <input
              className="input t-data-lg"
              name="awardedAmount"
              defaultValue={defaultAmount}
              placeholder="7,500"
              required
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Awarded on</span>
            <input
              className="input t-data-lg"
              type="date"
              name="awardedOn"
              defaultValue={today}
              required
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Restrictions</span>
            <textarea
              className="textarea"
              name="restrictions"
              rows={3}
              placeholder="Restricted to the summer camp program. No indirect costs. Funds released on receipt of a signed agreement."
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Report schedule</span>
            <select
              className="select"
              name="schedule"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value as ReportScheduleKey)}
            >
              {Object.entries(REPORT_SCHEDULES).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.label}
                </option>
              ))}
            </select>
          </label>
          <p className="t-secondary" style={{ color: "var(--color-ink-2)" }}>
            {REPORT_SCHEDULES[schedule].months.length
              ? `${REPORT_SCHEDULES[schedule].months.length} report ${
                  REPORT_SCHEDULES[schedule].months.length === 1 ? "date" : "dates"
                } will be added to your calendar and the ICS feed, counted in calendar months from the award date. A late report is the quietest way to lose a renewal, so the last-call and overdue notices go to everyone on the account.`
              : "No report dates will be created. You can add one by hand later if the funder asks for something."}
          </p>
          <ErrorLine error={state.error} />
          <button className="btn btn-primary w-full" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save award and schedule reports"}
          </button>
        </form>
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------------------- notes --- */

export function GrantEditor({
  grantId,
  title,
  funderName,
  askAmount,
  notes,
}: {
  grantId: string;
  title: string;
  funderName: string;
  askAmount: string;
  notes: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(updateGrantAction, INITIAL);

  return (
    <>
      <button type="button" className="btn-quiet" onClick={() => setOpen(true)}>
        <IconEdit size={18} />
        Edit details
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Edit this grant">
        <form action={formAction} className="flex flex-col gap-4 pt-2">
          <input type="hidden" name="grantId" value={grantId} />
          <label className="flex flex-col gap-2">
            <span className="t-label">Funder</span>
            <input className="input" name="funderName" defaultValue={funderName} required />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">What you are asking for</span>
            <input className="input" name="title" defaultValue={title} required />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Ask amount</span>
            <input className="input t-data-lg" name="askAmount" defaultValue={askAmount} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Notes</span>
            <textarea className="textarea" name="notes" rows={5} defaultValue={notes} />
          </label>
          <ErrorLine error={state.error} />
          <button className="btn btn-primary w-full" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </button>
        </form>
      </Sheet>
    </>
  );
}

/* --------------------------------------------------------------- workspace --- */

export interface LibraryOption {
  id: string;
  kind: AnswerKind;
  title: string;
  version: number;
  excerptText: string;
}

export function ChecklistItem({
  grantId,
  itemId,
  requirement,
  status,
  draftBody,
  answerSource,
  snapshotStale,
  library,
}: {
  grantId: string;
  itemId: string;
  requirement: string;
  status: WorkspaceStatus;
  draftBody: string;
  answerSource: string | null;
  snapshotStale: boolean;
  library: LibraryOption[];
}) {
  const [open, setOpen] = useState(false);
  const [draftState, draftAction, draftPending] = useActionState(saveDraftAction, INITIAL);
  const [linkState, linkAction, linkPending] = useActionState(linkAnswerAction, INITIAL);

  const dotColor =
    status === "final"
      ? "var(--color-leaf-text)"
      : status === "drafted"
        ? "var(--color-gold-text)"
        : "var(--color-hairline)";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="row w-full text-left"
        style={{ background: "none", border: 0, borderBottom: "1px solid var(--color-hairline)" }}
      >
        <span
          aria-hidden="true"
          className="shrink-0"
          style={{ width: 8, height: 8, borderRadius: 4, background: dotColor }}
        />
        <span className="min-w-0 flex-1">
          <span className="t-title block truncate">{requirement}</span>
          <span className="t-secondary block truncate">
            {answerSource
              ? `${answerSource}${snapshotStale ? " · library has moved on" : ""}`
              : draftBody
                ? excerpt(draftBody, 64)
                : "Nothing drafted yet"}
          </span>
        </span>
        <span className="t-label shrink-0">
          {status === "final" ? "Final" : status === "drafted" ? "Draft" : "To do"}
        </span>
        <IconChevronDown size={18} style={{ color: "var(--color-ink-2)" }} />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={requirement}>
        <form action={linkAction} className="flex flex-col gap-3 pt-2">
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="grantId" value={grantId} />
          <label className="flex flex-col gap-2">
            <span className="t-label">Use a library block</span>
            <select className="select" name="answerId" defaultValue="">
              <option value="">Nothing linked — write it here</option>
              {library.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.title || answerKindLabel(option.kind)} · V{option.version}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-secondary w-full" type="submit" disabled={linkPending}>
            {linkPending ? "Copying…" : "Copy the block into this draft"}
          </button>
          <ErrorLine error={linkState.error} />
          <p className="t-secondary" style={{ color: "var(--color-ink-2)" }}>
            Linking copies the block&rsquo;s text as it reads today. Editing the library
            afterwards will not change what this application says.
          </p>
        </form>

        <form action={draftAction} className="mt-6 flex flex-col gap-3 rule-t pt-4">
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="grantId" value={grantId} />
          <label className="flex flex-col gap-2">
            <span className="t-label">Draft for this funder</span>
            <textarea
              className="textarea"
              name="draftBody"
              rows={10}
              defaultValue={draftBody}
              placeholder="Paste or write the answer this funder asked for."
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Status</span>
            <select className="select" name="status" defaultValue={status}>
              <option value="todo">To do</option>
              <option value="drafted">Drafted</option>
              <option value="final">Final</option>
            </select>
          </label>
          <ErrorLine error={draftState.error} />
          <button className="btn btn-primary w-full" type="submit" disabled={draftPending}>
            {draftPending ? "Saving…" : "Save draft"}
          </button>
        </form>
      </Sheet>
    </>
  );
}

export function AddRequirement({ grantId }: { grantId: string }) {
  const [state, formAction, pending] = useActionState(addRequirementAction, INITIAL);
  return (
    <form action={formAction} className="mt-4 flex flex-col gap-2">
      <input type="hidden" name="grantId" value={grantId} />
      <span className="t-label">Add what this funder asks for</span>
      <div className="flex gap-2">
        <input
          className="input min-w-0 flex-1"
          name="requirement"
          placeholder="Logic model, one page"
          required
        />
        <button className="btn btn-secondary shrink-0" type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      <ErrorLine error={state.error} />
    </form>
  );
}

/**
 * Deleting a grant is hold-to-confirm (DESIGN.md motion rules) — 600ms of
 * deliberate pressure, because the alternative is someone losing a year of history
 * to a mis-tap on a phone.
 */
export function HoldToDelete({
  action,
  hiddenFields,
  label,
  confirmLabel,
}: {
  action: (formData: FormData) => void;
  hiddenFields: Record<string, string>;
  label: string;
  confirmLabel: string;
}) {
  const [progress, setProgress] = useState(0);
  const [armed, setArmed] = useState(false);

  function start() {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const p = Math.min(1, (Date.now() - startedAt) / 600);
      setProgress(p);
      if (p >= 1) {
        clearInterval(timer);
        setArmed(true);
      }
    }, 30);
    const stop = () => {
      clearInterval(timer);
      if (!armed) setProgress(0);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  return (
    <form action={action} className="mt-6 rule-t pt-4">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {armed ? (
        <button className="btn btn-secondary w-full" type="submit" style={{ color: "var(--color-brick-text)" }}>
          <IconTrash size={18} />
          {confirmLabel}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-secondary w-full"
          onPointerDown={start}
          style={{
            color: "var(--color-ink-2)",
            background: `linear-gradient(to right, color-mix(in srgb, var(--color-brick-text) 14%, transparent) ${Math.round(progress * 100)}%, transparent ${Math.round(progress * 100)}%)`,
          }}
        >
          <IconTrash size={18} />
          {label}
        </button>
      )}
    </form>
  );
}
