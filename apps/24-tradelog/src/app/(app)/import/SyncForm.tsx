"use client";

import { useActionState } from "react";
import { saveSyncCredentialsAction, syncNowAction, type SyncFormState } from "./actions";
import { IconAlert, IconArrowRight } from "@/components/icons";

export function SyncForm({
  accountId,
  configured,
  queryId,
  syncEnabled,
}: {
  accountId: string;
  configured: boolean;
  queryId: string | null;
  syncEnabled: boolean;
}) {
  const [saveState, saveAction, saving] = useActionState<SyncFormState, FormData>(
    saveSyncCredentialsAction,
    {},
  );
  const [syncState, doSync, syncing] = useActionState<SyncFormState, FormData>(syncNowAction, {});

  return (
    <div className="flex flex-col gap-4">
      <form action={saveAction} className="flex flex-col gap-4">
        <input type="hidden" name="accountId" value={accountId} />
        <label className="flex flex-col gap-2">
          <span className="t-label">Flex Web Service token</span>
          <input
            className="input input-mono"
            name="token"
            inputMode="numeric"
            placeholder={configured ? "Stored — enter a new one to replace it" : "123456789012345"}
            autoComplete="off"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-label">Flex query id</span>
          <input
            className="input input-mono"
            name="queryId"
            inputMode="numeric"
            defaultValue={queryId ?? ""}
            placeholder="998877"
          />
        </label>
        <p className="t-secondary">
          In IBKR: Performance &amp; Reports → Flex Queries → make a Trades query, then Flex Web
          Service to get the token. The token is stored encrypted and only ever used to fetch your own
          statement.
        </p>
        {saveState.error ? (
          <p className="t-secondary flex items-start gap-2" role="alert">
          <IconAlert size={14} className="mt-1 shrink-0" />
            {saveState.error}
          </p>
        ) : null}
        {saveState.message ? (
          <p className="t-secondary" style={{ color: "var(--color-blue)" }} role="status">
            {saveState.message}
          </p>
        ) : null}
        <button className="btn btn-secondary" type="submit" disabled={saving || !syncEnabled}>
          {saving ? "Saving…" : configured ? "Replace credentials" : "Save credentials"}
        </button>
      </form>

      {configured ? (
        <form action={doSync}>
          <input type="hidden" name="accountId" value={accountId} />
          <button className="btn btn-secondary btn-full" type="submit" disabled={syncing}>
            {syncing ? "Fetching from IBKR…" : "Sync now"}
            <IconArrowRight size={16} />
          </button>
          {syncState.error ? (
            <p className="t-secondary mt-2 flex items-start gap-2" role="alert">
              <IconAlert size={14} className="mt-1 shrink-0" />
              {syncState.error}
            </p>
          ) : null}
          {syncState.message ? (
            <p className="t-secondary mt-2" style={{ color: "var(--color-blue)" }} role="status">
              {syncState.message}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
