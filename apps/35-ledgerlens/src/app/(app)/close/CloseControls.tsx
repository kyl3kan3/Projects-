"use client";

/**
 * The close button, the force-close escape hatch, and the accountant link.
 *
 * Revoking a share link is destructive from the accountant's point of view — their
 * bookmark stops working — so it is hold-to-confirm.
 */

import { useActionState } from "react";
import {
  closePeriodAction,
  createShareLinkAction,
  revokeShareLinkAction,
  type CloseFormState,
} from "./actions";
import { CopyField } from "@/components/CopyField";
import { HoldToConfirm } from "@/components/HoldToConfirm";
import { IconBookClosed, IconLink } from "@/components/icons";
import { useTransition } from "react";

const initial: CloseFormState = { error: null };

export function CloseButton({
  period,
  monthLabel,
  blocking,
  alreadyClosed,
}: {
  period: string;
  monthLabel: string;
  blocking: number;
  alreadyClosed: boolean;
}) {
  const [state, action, pending] = useActionState(closePeriodAction, initial);

  return (
    <div className="mt-4">
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="period" value={period} />
        <button type="submit" className="btn btn-primary btn-full" disabled={pending || blocking > 0}>
          <IconBookClosed size={18} />
          {pending
            ? "Building the package…"
            : alreadyClosed
              ? `Rebuild ${monthLabel}`
              : `Close ${monthLabel}`}
        </button>
      </form>

      {blocking > 0 ? (
        <form action={action} className="mt-3">
          <input type="hidden" name="period" value={period} />
          <input type="hidden" name="force" value="1" />
          <button type="submit" className="btn btn-secondary btn-full" disabled={pending}>
            Close anyway — list the {blocking} unreviewed and exclude them
          </button>
        </form>
      ) : null}

      {state.error ? (
        <p className="t-secondary mt-3" style={{ color: "var(--color-red)" }} role="alert">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

export function ShareLinkForm({ enabled, requiredPlan }: { enabled: boolean; requiredPlan: string }) {
  const [state, action, pending] = useActionState(createShareLinkAction, initial);

  return (
    <div className="mt-4">
      <form action={action} className="flex flex-col gap-3">
        <label className="block">
          <span className="t-label">Who is it for</span>
          <input
            className="input mt-2"
            name="label"
            type="text"
            placeholder="Delgado & Co, my tax preparer"
            maxLength={80}
          />
        </label>
        <button type="submit" className="btn btn-secondary btn-full" disabled={pending || !enabled}>
          <IconLink size={18} />
          {pending ? "Creating…" : "Create a read-only link"}
        </button>
      </form>

      {!enabled ? (
        <p className="t-secondary mt-2" style={{ color: "var(--color-fg-3)" }}>
          Read-only accountant links are on {requiredPlan} and above.
        </p>
      ) : null}

      {state.error ? (
        <p className="t-secondary mt-3" style={{ color: "var(--color-red)" }} role="alert">
          {state.error}
        </p>
      ) : null}

      {state.shareUrl ? (
        <div className="mt-4">
          <p className="t-secondary mb-2">
            Copy it now — it is shown once. Only its hash is stored, so we cannot show it
            again.
          </p>
          <CopyField value={state.shareUrl} label="Accountant link" />
        </div>
      ) : null}
    </div>
  );
}

export function RevokeShareLink({ shareLinkId }: { shareLinkId: string }) {
  const [pending, start] = useTransition();
  return (
    <HoldToConfirm
      label="Revoke"
      confirmLabel="Hold to revoke"
      pending={pending}
      onConfirm={() => {
        const formData = new FormData();
        formData.set("shareLinkId", shareLinkId);
        start(() => {
          void revokeShareLinkAction(formData);
        });
      }}
    />
  );
}
