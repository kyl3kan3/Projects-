"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { IconCamera, IconPlus, IconSend } from "@/components/icons";
import {
  appendEventAction,
  createIssueAction,
  sendNoticeAction,
  setStatusAction,
} from "./actions";

export function NewIssueSheet({
  households,
}: {
  households: { id: string; unitLabel: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="thumb-cta">
        <button className="btn btn-primary btn-full" onClick={() => setOpen(true)}>
          <IconPlus size={18} />
          New issue
        </button>
      </div>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ background: "rgba(30, 39, 50, 0.32)" }}
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="sheet w-full max-h-[88vh] overflow-y-auto p-5"
            style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="t-label">New issue</p>
                <h2 className="t-h2 mt-1">It gets a number and a timeline.</h2>
              </div>
              <button className="btn-quiet" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <div className="mt-4">
              <ActionForm action={createIssueAction} submitLabel="Open the issue" full>
                <label className="field">
                  <span className="t-label">Kind</span>
                  <select className="input" name="kind" defaultValue="violation">
                    <option value="violation">Violation</option>
                    <option value="maintenance">Maintenance request</option>
                    <option value="architectural">Architectural request</option>
                  </select>
                </label>
                <label className="field">
                  <span className="t-label">Household</span>
                  <select className="input" name="householdId" defaultValue="common">
                    <option value="common">Common area — no household</option>
                    {households.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.unitLabel}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="t-label">Title</span>
                  <input
                    className="input"
                    name="title"
                    required
                    placeholder="Fence height exceeds 6 ft on the Maple St side"
                  />
                </label>
                <label className="field">
                  <span className="t-label">What happened</span>
                  <textarea
                    className="input"
                    name="body"
                    placeholder="Measured 7 ft 4 in during the Apr 12 walkthrough. Two neighbours have asked about it."
                  />
                </label>
                <label className="field">
                  <span className="t-label">Photos</span>
                  <input
                    className="input"
                    type="file"
                    name="photos"
                    accept="image/*"
                    capture="environment"
                    multiple
                  />
                  <span className="t-secondary flex items-center gap-2">
                    <IconCamera size={18} className="navy" />
                    Location data is stripped from JPEGs before anything is stored.
                  </span>
                </label>
                <label className="field">
                  <span className="t-label">Who can see the first entry</span>
                  <select className="input" name="visibility" defaultValue="member_visible">
                    <option value="member_visible">The household and the board</option>
                    <option value="board_only">Board only</option>
                  </select>
                  <span className="t-secondary">
                    Board-only entries stay in the record permanently — they are hidden from the
                    household, not deleted. Honest records protect fair boards.
                  </span>
                </label>
              </ActionForm>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function AddEntryForm({ issueId }: { issueId: string }) {
  return (
    <ActionForm action={appendEventAction} submitLabel="Add to the thread" full>
      <input type="hidden" name="issueId" value={issueId} />
      <label className="field">
        <span className="t-label">Entry</span>
        <textarea className="input" name="body" placeholder="Spoke with the owner at the mailbox; they are getting a quote." />
      </label>
      <label className="field">
        <span className="t-label">Photos</span>
        <input className="input" type="file" name="photos" accept="image/*" capture="environment" multiple />
      </label>
      <label className="field">
        <span className="t-label">Visibility</span>
        <select className="input" name="visibility" defaultValue="member_visible">
          <option value="member_visible">The household and the board</option>
          <option value="board_only">Board only</option>
        </select>
      </label>
    </ActionForm>
  );
}

export function StatusForm({ issueId, current }: { issueId: string; current: string }) {
  const [status, setStatus] = useState(current);
  const needsNote = status === "resolved" || status === "closed";
  return (
    <ActionForm
      action={setStatusAction}
      submitLabel="Change the status"
      variant="secondary"
      small
      confirmHold={needsNote}
    >
      <input type="hidden" name="issueId" value={issueId} />
      <label className="field">
        <span className="t-label">Status</span>
        <select
          className="input"
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </label>
      <label className="field">
        <span className="t-label">{needsNote ? "Resolution note (required)" : "Note"}</span>
        <input
          className="input"
          name="note"
          required={needsNote}
          placeholder={needsNote ? "Fence lowered to 5 ft 10 in; verified May 2." : "Optional"}
        />
      </label>
      {needsNote ? (
        <p className="t-secondary">
          Closing an issue without saying why leaves the next board guessing, so the note is required
          and both the change and the note are audit-logged.
        </p>
      ) : null}
    </ActionForm>
  );
}

export function NoticeForm({ issueId, kind }: { issueId: string; kind: string }) {
  return (
    <ActionForm action={sendNoticeAction} submitLabel="Send the notice" variant="secondary" small full>
      <input type="hidden" name="issueId" value={issueId} />
      <label className="field">
        <span className="t-label">What to tell them</span>
        <textarea
          className="input"
          name="detail"
          required
          placeholder={
            kind === "violation"
              ? "Please bring the fence into compliance, or contact the board to discuss options."
              : "The board approved this at the May meeting, subject to the setback in Article VII."
          }
        />
      </label>
      <p className="t-secondary flex items-start gap-2">
        <IconSend size={18} className="navy" />
        Every contact on the household gets it, and the delivery outcome lands on this timeline as a
        dated receipt. The template asks them to review the association&apos;s own governing
        documents — DuesDesk never writes legal language or a fine schedule for you.
      </p>
    </ActionForm>
  );
}
