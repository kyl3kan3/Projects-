"use client";

import { useActionState, useState } from "react";
import {
  addNoteAction,
  issuePortalLinkAction,
  savePartyAction,
  setDateStatusAction,
  setDealStatusAction,
  setTaskStatusAction,
  updateCommissionAction,
  uploadDocumentAction,
  type FormState,
} from "../actions";
import { TASK_LABELS } from "@/components/Placard";
import { IconUpload } from "@/components/icons";
import { formatBps, formatCents } from "@/lib/commissions";
import { PARTY_ROLE_LABELS } from "@/lib/templates";
import type { CommissionLine } from "@/lib/commissions";
import type { PartyRole, TaskStatus } from "@/db/schema";

const initial: FormState = { error: null, ok: null };

/**
 * React 19 resets an uncontrolled form once its action returns. Every form below
 * that can be rejected echoes its values back so the reset restores them.
 */
function kept(state: FormState, key: string, fallback = ""): string {
  return state.values?.[key] ?? fallback;
}

function Feedback({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p className="field-error" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p className="t-secondary mt-2" style={{ color: "var(--color-cedar-strong)" }} role="status">
        {state.ok}
      </p>
    );
  }
  return null;
}

/* ------------------------------------------------------------- task actions */

const NEXT: Array<{ status: TaskStatus; verb: string }> = [
  { status: "done", verb: "Mark done" },
  { status: "waiting", verb: "Waiting" },
  { status: "todo", verb: "Reopen" },
  { status: "na", verb: "N/A" },
];

export function TaskActions({
  dealId,
  taskId,
  status,
}: {
  dealId: string;
  taskId: string;
  status: TaskStatus;
}) {
  const [state, action, pending] = useActionState(setTaskStatusAction, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="taskId" value={taskId} />
      {NEXT.filter((n) => n.status !== status).map((n) => (
        <button
          key={n.status}
          className="chip"
          type="submit"
          name="status"
          value={n.status}
          disabled={pending}
        >
          {n.verb}
        </button>
      ))}
      {state.error ? <span className="field-error">{state.error}</span> : null}
      <span className="sr-only">Currently {TASK_LABELS[status]}</span>
    </form>
  );
}

export function DateActions({
  dealId,
  dateId,
  storedStatus,
}: {
  dealId: string;
  dateId: string;
  storedStatus: string;
}) {
  const [state, action, pending] = useActionState(setDateStatusAction, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="dateId" value={dateId} />
      {storedStatus !== "met" ? (
        <button className="chip" type="submit" name="status" value="met" disabled={pending}>
          Met
        </button>
      ) : null}
      {storedStatus !== "waived" ? (
        <button className="chip" type="submit" name="status" value="waived" disabled={pending}>
          Waive
        </button>
      ) : null}
      {storedStatus !== "upcoming" ? (
        <button className="chip" type="submit" name="status" value="upcoming" disabled={pending}>
          Reopen
        </button>
      ) : null}
      {state.error ? <span className="field-error">{state.error}</span> : null}
    </form>
  );
}

/* ------------------------------------------------------------- deal status */

const DEAL_STATUSES = [
  ["active", "Active"],
  ["pending_items", "Pending items"],
  ["clear_to_close", "Clear to close"],
  ["closed", "Closed"],
  ["terminated", "Terminated"],
] as const;

export function DealStatusForm({ dealId, status }: { dealId: string; status: string }) {
  const [state, action, pending] = useActionState(setDealStatusAction, initial);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="dealId" value={dealId} />
      <label className="block">
        <span className="field-label">File status</span>
        <select className="input" name="status" defaultValue={status}>
          {DEAL_STATUSES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <button className="btn btn-secondary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save status"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

/* -------------------------------------------------------------- the notes */

export function NoteComposer({ dealId }: { dealId: string }) {
  const [state, action, pending] = useActionState(addNoteAction, initial);
  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="dealId" value={dealId} />
      <label className="field">
        <span className="field-label">Add a note</span>
        <textarea
          className="input"
          name="body"
          rows={3}
          placeholder="Lender confirmed the appraisal is ordered; report expected Thursday."
          defaultValue={kept(state, "body")}
        />
      </label>
      <button className="btn btn-secondary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Add to the file"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

/* --------------------------------------------------------- the commission */

export function CommissionEditor({
  dealId,
  priceCents,
  rateBps,
  referralFeeCents,
  tcFeeCents,
  split,
  lines,
  readOnly,
}: {
  dealId: string;
  priceCents: number | null;
  rateBps: number;
  referralFeeCents: number;
  tcFeeCents: number;
  split: Array<{ label: string; bps: number }>;
  lines: CommissionLine[];
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updateCommissionAction, initial);

  return (
    <div>
      <ul className="list-none p-0">
        {lines.map((line, i) => (
          <li key={`${line.label}-${i}`} className="hairline-b flex items-baseline justify-between gap-4 py-2">
            <span>
              <span className="t-title block">{line.label}</span>
              {line.detail ? <span className="t-secondary block">{line.detail}</span> : null}
            </span>
            {line.kind === "note" ? null : (
              <span className="t-mono-lg shrink-0">{formatCents(line.amountCents)}</span>
            )}
          </li>
        ))}
      </ul>

      {readOnly ? null : (
        <button className="btn-quiet mt-4" type="button" onClick={() => setOpen(!open)}>
          {open ? "Close" : "Edit the commission basis"}
        </button>
      )}

      {open ? (
        <form action={action} className="mt-4 border-t border-line pt-4">
          <input type="hidden" name="dealId" value={dealId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field">
              <span className="field-label">Sale price</span>
              <input
                className="input input-mono"
                name="price"
                inputMode="decimal"
                defaultValue={kept(state, "price", priceCents ? (priceCents / 100).toFixed(2) : "")}
              />
            </label>
            <label className="field">
              <span className="field-label">Rate (%)</span>
              <input
                className="input input-mono"
                name="rate"
                inputMode="decimal"
                defaultValue={kept(state, "rate", rateBps ? formatBps(rateBps).replace("%", "") : "")}
              />
            </label>
            <label className="field">
              <span className="field-label">Referral fee</span>
              <input
                className="input input-mono"
                name="referralFee"
                inputMode="decimal"
                defaultValue={kept(
                  state,
                  "referralFee",
                  referralFeeCents ? (referralFeeCents / 100).toFixed(2) : "",
                )}
              />
            </label>
            <label className="field">
              <span className="field-label">Coordination fee</span>
              <input
                className="input input-mono"
                name="tcFee"
                inputMode="decimal"
                defaultValue={kept(state, "tcFee", tcFeeCents ? (tcFeeCents / 100).toFixed(2) : "")}
              />
            </label>
          </div>

          <p className="t-label mt-2">Named shares of what is left after fees</p>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="mt-2 grid gap-3 sm:grid-cols-[2fr_1fr]">
              <input
                className="input"
                name={`splitLabel${i}`}
                placeholder={i === 0 ? "Buyer's agent — Marisol Vance" : "Label"}
                defaultValue={kept(state, `splitLabel${i}`, split[i]?.label ?? "")}
              />
              <input
                className="input input-mono"
                name={`splitShare${i}`}
                inputMode="decimal"
                placeholder="70"
                defaultValue={kept(
                  state,
                  `splitShare${i}`,
                  split[i] ? (split[i].bps / 100).toString() : "",
                )}
              />
            </div>
          ))}

          <button className="btn btn-primary mt-4" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save the commission"}
          </button>
          <Feedback state={state} />
        </form>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- the parties */

const ROLES: PartyRole[] = [
  "buyer",
  "seller",
  "buyer_agent",
  "listing_agent",
  "lender",
  "title",
  "hoa",
  "tc",
  "other",
];

export function PartyEditor({
  dealId,
  party,
  portalAllowed,
  readOnly,
}: {
  dealId: string;
  party: {
    id: string;
    role: PartyRole;
    name: string;
    email: string | null;
    phone: string | null;
    notify: boolean;
    hasPortal: boolean;
  } | null;
  portalAllowed: boolean;
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(savePartyAction, initial);
  const [portalState, portalAction, portalPending] = useActionState(issuePortalLinkAction, initial);

  if (!party) {
    return (
      <div className="mt-3">
        {!open ? (
          <button className="btn-quiet" type="button" onClick={() => setOpen(true)} disabled={readOnly}>
            Add a party
          </button>
        ) : (
          <PartyFields
            action={action}
            pending={pending}
            state={state}
            dealId={dealId}
            party={null}
            onClose={() => setOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <li className="hairline-b py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span>
          <span className="t-label">{PARTY_ROLE_LABELS[party.role]}</span>
          <span className="t-title mt-0.5 block">{party.name}</span>
          <span className="t-secondary block">
            {party.email ?? "No email — reminders cannot reach them"}
            {party.phone ? ` · ${party.phone}` : ""}
          </span>
        </span>
        <span className="t-secondary shrink-0">
          Reminders {party.notify && party.email ? "on" : "off"}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {readOnly ? null : (
          <button className="btn-quiet" type="button" onClick={() => setOpen(!open)}>
            {open ? "Close" : "Edit"}
          </button>
        )}
        {portalAllowed && party.email ? (
          <form action={portalAction} className="inline-flex items-center gap-2">
            <input type="hidden" name="dealId" value={dealId} />
            <input type="hidden" name="partyId" value={party.id} />
            <input type="hidden" name="revoke" value={party.hasPortal ? "1" : "0"} />
            <button className="btn-quiet" type="submit" disabled={portalPending}>
              {portalPending
                ? "Working…"
                : party.hasPortal
                  ? "Revoke portal link"
                  : "Create portal link"}
            </button>
          </form>
        ) : null}
        {party.hasPortal ? <span className="t-secondary">Portal live</span> : null}
      </div>
      <Feedback state={portalState} />

      {open ? (
        <PartyFields
          action={action}
          pending={pending}
          state={state}
          dealId={dealId}
          party={party}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </li>
  );
}

function PartyFields({
  action,
  pending,
  state,
  dealId,
  party,
  onClose,
}: {
  action: (formData: FormData) => void;
  pending: boolean;
  state: FormState;
  dealId: string;
  party: {
    id: string;
    role: PartyRole;
    name: string;
    email: string | null;
    phone: string | null;
    notify: boolean;
  } | null;
  onClose: () => void;
}) {
  return (
    <form action={action} className="mt-3 border-t border-line pt-3">
      <input type="hidden" name="dealId" value={dealId} />
      {party ? <input type="hidden" name="partyId" value={party.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="field-label">Role</span>
          <select className="input" name="role" defaultValue={kept(state, "role", party?.role ?? "other")}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {PARTY_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Name</span>
          <input
            className="input"
            name="name"
            defaultValue={kept(state, "name", party?.name ?? "")}
            required
          />
        </label>
        <label className="block">
          <span className="field-label">Email</span>
          <input
            className="input"
            name="email"
            type="email"
            defaultValue={kept(state, "email", party?.email ?? "")}
          />
        </label>
        <label className="block">
          <span className="field-label">Phone</span>
          <input
            className="input"
            name="phone"
            defaultValue={kept(state, "phone", party?.phone ?? "")}
          />
        </label>
      </div>
      <label className="checkline mt-2">
        <input type="checkbox" name="notify" defaultChecked={party?.notify ?? true} />
        <span className="t-body">Send this party the reminders for dates they own</span>
      </label>
      <div className="mt-2 flex gap-3">
        <button className="btn btn-secondary btn-sm" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button className="btn-quiet" type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

/* ------------------------------------------------------------ the uploader */

export function UploadForm({
  dealId,
  taskId,
  label,
  compact,
}: {
  dealId: string;
  taskId: string | null;
  label: string;
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState(uploadDocumentAction, initial);
  return (
    <form action={action} className={compact ? "mt-2" : "mt-4"}>
      <input type="hidden" name="dealId" value={dealId} />
      {taskId ? <input type="hidden" name="taskId" value={taskId} /> : null}
      <input type="hidden" name="label" value={label} />
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="input max-w-xs"
          type="file"
          name="file"
          required
          aria-label={`Upload for ${label}`}
        />
        <button className="btn btn-secondary btn-sm" type="submit" disabled={pending}>
          <IconUpload size={16} />
          {pending ? "Uploading…" : "Upload"}
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}
