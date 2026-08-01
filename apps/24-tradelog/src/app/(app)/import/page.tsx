import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { importBatches } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { listAccounts, tradesThisMonth } from "@/lib/trades";
import { PARSERS } from "@/lib/parsers/registry";
import { plan } from "@/lib/plans";
import { has } from "@/lib/env";
import { formatDateKey, zonedClock, zonedDateKey } from "@/lib/tz";
import { ImportForm } from "./ImportForm";
import { AccountForm } from "./AccountForm";
import { SyncForm } from "./SyncForm";
import { deleteBatchAction } from "./actions";
import { HoldToConfirm } from "@/components/HoldToConfirm";
import { IconAlert } from "@/components/icons";

export const metadata: Metadata = { title: "Import" };
export const dynamic = "force-dynamic";

const BROKERS = PARSERS.map((p) => ({ id: p.id, label: p.label, hint: p.hint }));

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ first?: string }>;
}) {
  const user = await requireUser();
  const { first } = await searchParams;
  const limits = plan(user.plan);
  const accounts = await listAccounts(user.id);
  const used = await tradesThisMonth(user.id);
  const syncEnabled = has("SYNC_CREDS_ENCRYPTION_KEY");

  const batches = accounts.length
    ? await getDb()
        .select()
        .from(importBatches)
        .where(eq(importBatches.userId, user.id))
        .orderBy(desc(importBatches.createdAt))
        .limit(15)
    : [];

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <h1 className="t-h2">{first ? "One file and you are set up." : "Import"}</h1>
        <p className="t-secondary mt-2">
          {first
            ? "Export your fills from your broker and drop them in. TradeLog matches them into round trips — scaling in and out handled properly — and tells you what every row of the file did."
            : "Drop an export in, or let IBKR send it. Duplicate fills are ignored, so re-importing an overlapping file is safe."}
        </p>
        {Number.isFinite(limits.tradesPerMonth) ? (
          <p className="t-secondary mt-3">
            <span className="t-mono">{used}</span> of{" "}
            <span className="t-mono">{limits.tradesPerMonth}</span> trades this month on{" "}
            {limits.name}.{" "}
            {used >= limits.tradesPerMonth ? (
              <Link href="/settings/billing" style={{ color: "var(--color-blue)" }}>
                Go unlimited
              </Link>
            ) : null}
          </p>
        ) : null}
      </header>

      {accounts.length === 0 ? (
        <section>
          <h2 className="t-label mb-4">First, name the account</h2>
          <AccountForm brokers={BROKERS} />
          <div className="mt-8">
            <h3 className="t-label mb-3">Where the file comes from</h3>
            <ul>
              {BROKERS.map((broker) => (
                <li key={broker.id} className="row items-start">
                  <div>
                    <p className="t-body">{broker.label}</p>
                    <p className="t-secondary mt-1">{broker.hint}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : (
        <>
          <section className="mb-8">
            <h2 className="t-label mb-3">Accounts</h2>
            <ul>
              {accounts.map((account) => (
                <li key={account.id} className="row items-start">
                  <div className="min-w-0 flex-1">
                    <p className="t-cell" style={{ fontSize: 14 }}>
                      {account.label.toUpperCase()}
                    </p>
                    <p className="t-secondary mt-1">
                      {BROKERS.find((b) => b.id === account.broker)?.label ?? "CSV only"} ·{" "}
                      {account.currency}
                      {account.lastSyncedAt
                        ? ` · synced ${zonedClock(account.lastSyncedAt, user.timezone)}`
                        : account.syncQueryId
                          ? " · sync configured, not run yet"
                          : ""}
                    </p>
                    {account.lastSyncError ? (
                      <p
                        className="t-secondary mt-1 flex items-start gap-2"
                      >
                        <IconAlert size={14} className="mt-1 shrink-0" />
                        {account.lastSyncError}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            {accounts.length < limits.accounts ? (
              <details className="mt-5">
                <summary className="btn-quiet cursor-pointer">Add another account</summary>
                <div className="mt-4">
                  <AccountForm brokers={BROKERS} />
                </div>
              </details>
            ) : (
              <p className="t-secondary mt-4">
                {limits.name} covers {limits.accounts}{" "}
                {limits.accounts === 1 ? "account" : "accounts"}.
                {limits.accounts === 1 ? (
                  <>
                    {" "}
                    <Link href="/settings/billing" style={{ color: "var(--color-blue)" }}>
                      Pro handles ten
                    </Link>
                    .
                  </>
                ) : null}
              </p>
            )}
          </section>

          <section className="mb-8">
            <h2 className="t-label mb-4">Import a file</h2>
            <ImportForm
              accounts={accounts.map((a) => ({ id: a.id, label: a.label, broker: a.broker }))}
              defaultAccountId={accounts[0].id}
            />
          </section>

          {accounts.some((a) => a.broker === "ibkr-flex" || a.broker === "ibkr-flex-xml") ? (
            <section className="mb-8">
              <h2 className="t-label mb-4">IBKR automatic sync</h2>
              {!syncEnabled ? (
                <p className="t-secondary mb-4">
                  This deployment has no <span className="t-mono">SYNC_CREDS_ENCRYPTION_KEY</span>,
                  so credentials cannot be stored safely and sync is switched off. CSV and XML import
                  work regardless.
                </p>
              ) : null}
              {accounts
                .filter((a) => a.broker === "ibkr-flex" || a.broker === "ibkr-flex-xml")
                .map((account) => (
                  <div key={account.id} className="mb-6">
                    <p className="t-body mb-3">{account.label}</p>
                    <SyncForm
                      accountId={account.id}
                      configured={Boolean(account.syncSecretEncrypted)}
                      queryId={account.syncQueryId}
                      syncEnabled={syncEnabled}
                    />
                  </div>
                ))}
            </section>
          ) : null}

          <section>
            <h2 className="t-label mb-3">Import history</h2>
            {batches.length === 0 ? (
              <p className="t-secondary">Nothing imported yet.</p>
            ) : (
              <ul>
                {batches.map((batch) => (
                  <li key={batch.id} className="row items-start">
                    <div className="min-w-0 flex-1">
                      <p className="t-body truncate">{batch.filename}</p>
                      <p className="t-secondary mt-1">
                        {formatDateKey(zonedDateKey(batch.createdAt, user.timezone))}{" "}
                        {zonedClock(batch.createdAt, user.timezone)} · {batch.parserId} v
                        {batch.parserVersion} · {batch.importedCount} imported,{" "}
                        {batch.duplicateCount} duplicate, {batch.skippedCount} skipped,{" "}
                        {batch.errorCount} rejected
                      </p>
                      {batch.errors.length ? (
                        <details className="mt-2">
                          <summary className="btn-quiet cursor-pointer text-[13px]">
                            Show the rejected rows
                          </summary>
                          <ul className="mt-2">
                            {batch.errors.slice(0, 20).map((error, index) => (
                              <li key={`${error.rowNumber}-${index}`} className="py-1">
                                <p className="t-cell">
                                  Line {error.rowNumber}: {error.message}
                                </p>
                                <p className="t-secondary truncate">{error.raw}</p>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                    <HoldToConfirm
                      label="Undo"
                      holdingLabel="Hold to undo"
                      onConfirm={deleteBatchAction.bind(null, batch.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
            <p className="t-secondary mt-4">
              Undoing an import removes its fills and re-derives every trade in the account from
              what is left — never a patch.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
