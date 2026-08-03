"use client";

import { useActionState } from "react";
import { IconAlert, IconCheck, IconExternal, IconPlug } from "@/components/icons";
import {
  addAccountAction,
  removeAccountAction,
  saveCurAction,
  verifyAccountAction,
  type ConnectState,
} from "./actions";

function Feedback({ state }: { state: ConnectState }) {
  if (state.error) {
    return (
      <p
        className="t-secondary"
        role="alert"
        style={{ color: "var(--color-amber)", display: "flex", gap: 8, alignItems: "flex-start" }}
      >
        <IconAlert size={18} />
        <span>{state.error}</span>
      </p>
    );
  }
  if (state.notice) {
    return (
      <p
        className="t-secondary"
        role="status"
        style={{ color: "var(--color-green)", display: "flex", gap: 8, alignItems: "flex-start" }}
      >
        <IconCheck size={18} />
        <span>{state.notice}</span>
      </p>
    );
  }
  return null;
}

export function AddAccountForm() {
  const [state, formAction, pending] = useActionState<ConnectState, FormData>(
    addAccountAction,
    {},
  );
  // React resets the form after the action; these bring the typed values back.
  const kept = state.values ?? {};
  return (
    <form action={formAction} style={{ display: "grid", gap: 16 }}>
      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">AWS account id</span>
        <input
          className="field field-mono"
          name="accountId"
          defaultValue={kept.accountId ?? ""}
          inputMode="numeric"
          placeholder="481029384756"
          pattern="[0-9\s-]{12,20}"
          required
        />
      </label>
      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Name it</span>
        <input
          className="field field-mono"
          name="label"
          defaultValue={kept.label ?? ""}
          placeholder="4821-prod"
          required
        />
      </label>
      <Feedback state={state} />
      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        <IconPlug size={18} />
        {pending ? "Adding…" : "Add account"}
      </button>
    </form>
  );
}

export function VerifyForm({
  accountId,
  defaultRoleArn,
  quickCreateHref,
}: {
  accountId: string;
  defaultRoleArn: string;
  quickCreateHref: string;
}) {
  const [state, formAction, pending] = useActionState<ConnectState, FormData>(
    verifyAccountAction,
    {},
  );
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <a
        className="btn btn-secondary btn-full"
        href={quickCreateHref}
        target="_blank"
        rel="noreferrer"
      >
        Open the CloudFormation quick-create
        <IconExternal size={18} />
      </a>
      <form action={formAction} style={{ display: "grid", gap: 16 }}>
        <input type="hidden" name="accountId" value={accountId} />
        <label style={{ display: "grid", gap: 8 }}>
          <span className="t-label">Role ARN from the stack output</span>
          <input
            className="field field-mono"
            name="roleArn"
            defaultValue={defaultRoleArn}
            spellCheck={false}
          />
          <span className="t-secondary">
            The template creates this exact ARN, so it is usually already right.
          </span>
        </label>
        <Feedback state={state} />
        <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
          {pending ? "Checking the role…" : "I created the stack — check it"}
        </button>
      </form>
    </div>
  );
}

export function CurForm({
  accountId,
  curBucket,
  curPrefix,
}: {
  accountId: string;
  curBucket: string;
  curPrefix: string;
}) {
  const [state, formAction, pending] = useActionState<ConnectState, FormData>(saveCurAction, {});
  const kept = state.values ?? {};
  return (
    <form action={formAction} style={{ display: "grid", gap: 16 }}>
      <input type="hidden" name="accountId" value={accountId} />
      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">CUR bucket</span>
        <input
          className="field field-mono"
          name="curBucket"
          defaultValue={kept.curBucket ?? curBucket}
          placeholder="northwind-cur-reports"
          spellCheck={false}
        />
      </label>
      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Prefix</span>
        <input
          className="field field-mono"
          name="curPrefix"
          defaultValue={kept.curPrefix ?? curPrefix}
          placeholder="billing/cur"
          spellCheck={false}
        />
      </label>
      <Feedback state={state} />
      <button className="btn btn-secondary btn-full" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save report location"}
      </button>
    </form>
  );
}

export function RemoveAccountForm({ accountId, label }: { accountId: string; label: string }) {
  const [state, formAction, pending] = useActionState<ConnectState, FormData>(
    removeAccountAction,
    {},
  );
  return (
    <form action={formAction} style={{ display: "grid", gap: 8 }}>
      <input type="hidden" name="accountId" value={accountId} />
      <Feedback state={state} />
      <button className="btn-quiet" type="submit" disabled={pending}>
        {pending ? "Disconnecting…" : `Disconnect ${label}`}
      </button>
    </form>
  );
}
