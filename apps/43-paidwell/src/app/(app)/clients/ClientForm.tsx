"use client";

import { useActionState } from "react";
import { IconAlert, IconCheck } from "@/components/icons";
import { saveClientAction, type ClientState } from "./actions";

export function ClientForm({
  clientId,
  vip,
  termsDaysOverride,
  emails,
  notes,
  defaultTermsDays,
}: {
  clientId: string;
  vip: boolean;
  termsDaysOverride: number | null;
  emails: string[];
  notes: string | null;
  defaultTermsDays: number;
}) {
  const [state, formAction, pending] = useActionState<ClientState, FormData>(saveClientAction, {});

  return (
    <form action={formAction} style={{ display: "grid", gap: 16 }}>
      <input type="hidden" name="clientId" value={clientId} />

      <label className="row" style={{ cursor: "pointer", alignItems: "flex-start", borderTop: "1px solid var(--color-hairline)" }}>
        <input
          type="checkbox"
          name="vip"
          defaultChecked={vip}
          style={{ marginTop: 6, width: 18, height: 18, accentColor: "var(--color-banker)" }}
        />
        <span style={{ flex: 1 }}>
          <span className="t-title" style={{ display: "block" }}>
            Never chase automatically
          </span>
          <span className="t-secondary" style={{ display: "block", marginTop: 2 }}>
            Their overdue invoices still appear at the top of your aging report — PaidWell just
            will not write to them without you.
          </span>
        </span>
      </label>

      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Payment terms for this client</span>
        <input
          className="field"
          name="termsDaysOverride"
          type="number"
          inputMode="numeric"
          min={0}
          max={365}
          defaultValue={termsDaysOverride ?? ""}
          placeholder={`${defaultTermsDays} (your firm default)`}
          style={{ maxWidth: 200, fontFamily: "var(--font-mono)" }}
        />
        <span className="t-secondary">
          Used when an imported invoice has no due date of its own. Leave it blank to use your
          firm default.
        </span>
      </label>

      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Follow-ups go to</span>
        <textarea
          className="field"
          name="emails"
          defaultValue={emails.join("\n")}
          placeholder="ap@meridian.co"
          style={{ minHeight: 88, fontFamily: "var(--font-mono)", fontSize: 14 }}
        />
        <span className="t-secondary">One address per line. All of them are copied on every step.</span>
      </label>

      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Notes</span>
        <textarea
          className="field"
          name="notes"
          defaultValue={notes ?? ""}
          placeholder="Pays on the 15th and the 30th. Needs a PO on every invoice."
          style={{ minHeight: 88 }}
        />
      </label>

      {state.error ? (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-red)", display: "flex", gap: 8 }}>
          <IconAlert size={18} style={{ flex: "none" }} />
          <span>{state.error}</span>
        </p>
      ) : null}
      {state.notice ? (
        <p className="t-secondary" role="status" style={{ color: "var(--color-banker)", display: "flex", gap: 8 }}>
          <IconCheck size={18} style={{ flex: "none" }} />
          <span>{state.notice}</span>
        </p>
      ) : null}

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save this client"}
      </button>
    </form>
  );
}
