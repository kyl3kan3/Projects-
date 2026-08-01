"use client";

import { useActionState, useState } from "react";
import { IconAlert, IconCheck, IconUpload } from "@/components/icons";
import { SAMPLE_CSV } from "@/lib/csv";
import {
  connectProviderAction,
  disconnectAction,
  importCsvAction,
  resyncAction,
  type ConnectState,
} from "./actions";

function Feedback({ state }: { state: ConnectState }) {
  if (!state.error && !state.notice && !state.problems?.length) return null;
  return (
    <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
      {state.error ? (
        <p
          className="t-secondary"
          role="alert"
          style={{ color: "var(--color-red)", display: "flex", gap: 8 }}
        >
          <IconAlert size={18} style={{ flex: "none" }} />
          <span>{state.error}</span>
        </p>
      ) : null}
      {state.notice ? (
        <p
          className="t-secondary"
          style={{ color: "var(--color-banker)", display: "flex", gap: 8 }}
        >
          <IconCheck size={18} style={{ flex: "none" }} />
          <span>{state.notice}</span>
        </p>
      ) : null}
      {state.problems?.length ? (
        <div>
          <p className="t-label" style={{ marginBottom: 4 }}>
            {state.problems.length} row{state.problems.length === 1 ? "" : "s"} skipped
          </p>
          <ul style={{ display: "grid", gap: 4 }}>
            {state.problems.slice(0, 8).map((problem, i) => (
              <li key={i} className="t-secondary" style={{ color: "var(--color-text-2)" }}>
                <span className="t-data">
                  {problem.line > 0 ? `line ${problem.line}` : "file"}
                </span>{" "}
                — {problem.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function ProviderButtons() {
  const [state, formAction, pending] = useActionState<ConnectState, FormData>(
    connectProviderAction,
    {},
  );
  return (
    <div>
      <div style={{ display: "grid", gap: 12 }}>
        <form action={formAction}>
          <input type="hidden" name="provider" value="qbo" />
          <button className="btn btn-secondary btn-full" type="submit" disabled={pending}>
            {pending ? "Connecting…" : "Connect QuickBooks Online"}
          </button>
        </form>
        <form action={formAction}>
          <input type="hidden" name="provider" value="xero" />
          <button className="btn btn-secondary btn-full" type="submit" disabled={pending}>
            {pending ? "Connecting…" : "Connect Xero"}
          </button>
        </form>
      </div>
      <Feedback state={state} />
    </div>
  );
}

export function ConnectionActions({
  connectionId,
  canResync,
}: {
  connectionId: string;
  canResync: boolean;
}) {
  const [resyncState, resync, resyncing] = useActionState<ConnectState, FormData>(resyncAction, {});
  const [disconnectState, disconnect, disconnecting] = useActionState<ConnectState, FormData>(
    disconnectAction,
    {},
  );
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {canResync ? (
          <form action={resync}>
            <input type="hidden" name="connectionId" value={connectionId} />
            <button className="btn btn-secondary" type="submit" disabled={resyncing}>
              {resyncing ? "Syncing…" : "Sync now"}
            </button>
          </form>
        ) : null}
        <form action={disconnect}>
          <input type="hidden" name="connectionId" value={connectionId} />
          <button className="btn-quiet" type="submit" disabled={disconnecting}>
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </button>
        </form>
      </div>
      <Feedback state={resyncState} />
      <Feedback state={disconnectState} />
    </div>
  );
}

export function CsvImportForm() {
  const [state, formAction, pending] = useActionState<ConnectState, FormData>(importCsvAction, {});
  const [value, setValue] = useState("");

  return (
    <form action={formAction} style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Paste your aging export</span>
        <textarea
          className="field"
          name="csv"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={"Customer,Invoice Number,Invoice Date,Due Date,Total,Balance\nMeridian Co,INV-2041,2026-05-20,2026-06-19,12400.00,12400.00"}
          spellCheck={false}
          style={{ fontFamily: "var(--font-mono)", fontSize: 13, minHeight: 160 }}
        />
      </label>
      <p className="t-secondary">
        Column names are matched loosely — Customer, Client name and Company all work.
        Anything that will not parse is listed by line number and skipped rather than
        guessed at.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-primary" type="submit" disabled={pending || !value.trim()}>
          <IconUpload size={18} />
          {pending ? "Importing…" : "Import invoices"}
        </button>
        <button className="btn-quiet" type="button" onClick={() => setValue(SAMPLE_CSV)}>
          Use a sample file
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}
