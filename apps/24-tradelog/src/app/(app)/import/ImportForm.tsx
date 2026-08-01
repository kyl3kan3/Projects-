"use client";

/**
 * The import: a drop target with a dashed hairline, or a paste box for the people
 * who copy rows straight out of a spreadsheet. Matched-trade counts stream in
 * afterwards with a 20ms stagger, capped at eight rows of motion.
 *
 * The report is the point. Every line of the file is accounted for — imported,
 * duplicate, skipped, or rejected with the reason and the row number — because an
 * importer that quietly loses one trade has made the whole journal a lie.
 */

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { importFileAction, type ImportFormState } from "./actions";
import { IconAlert, IconCheck, IconImport } from "@/components/icons";

export function ImportForm({
  accounts,
  defaultAccountId,
}: {
  accounts: { id: string; label: string; broker: string }[];
  defaultAccountId: string;
}) {
  const [state, formAction, pending] = useActionState<ImportFormState, FormData>(
    importFileAction,
    {},
  );
  const [filename, setFilename] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <>
      <form action={formAction} className="flex flex-col gap-5">
        {accounts.length > 1 ? (
          <label className="flex flex-col gap-2">
            <span className="t-label">Into which account</span>
            <select className="input" name="accountId" defaultValue={defaultAccountId}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="accountId" value={defaultAccountId} />
        )}

        <div
          className="flex flex-col items-center justify-center gap-2 px-5 py-10 text-center"
          style={{
            border: `1px dashed ${dragging ? "var(--color-blue)" : "var(--color-hairline)"}`,
            borderRadius: "var(--radius-card)",
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const dropped = event.dataTransfer.files?.[0];
            if (dropped && fileInput.current) {
              const transfer = new DataTransfer();
              transfer.items.add(dropped);
              fileInput.current.files = transfer.files;
              setFilename(dropped.name);
            }
          }}
        >
          <IconImport size={22} />
          <p className="t-body">{filename ?? "Drop a broker export here"}</p>
          <p className="t-secondary">CSV or XML, up to 5 MB. We detect the format.</p>
          <input
            ref={fileInput}
            className="input mt-3 py-2"
            type="file"
            name="file"
            accept=".csv,.txt,.xml,text/csv,text/plain,application/xml,text/xml"
            onChange={(event) => setFilename(event.target.files?.[0]?.name ?? null)}
          />
        </div>

        <details>
          <summary className="btn-quiet cursor-pointer">Or paste the rows instead</summary>
          <textarea
            className="input mt-3"
            name="pasted"
            rows={6}
            placeholder={
              "Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,PRICE\n11/4/25 09:31:12,STOCK,BUY,+200,TO OPEN,AAPL,,,STOCK,241.15"
            }
          />
        </details>

        {state.error ? (
          <p className="t-secondary flex items-start gap-2" role="alert">
            <IconAlert size={16} className="mt-1 shrink-0" />
            {state.error}
          </p>
        ) : null}

        <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
          {pending ? "Matching your fills…" : "Import and match"}
        </button>
      </form>

      {state.outcome ? <Report outcome={state.outcome} /> : null}
    </>
  );
}

function Report({ outcome }: { outcome: NonNullable<ImportFormState["outcome"]> }) {
  if (!outcome.ok) {
    return (
      <section className="card mt-6 p-5">
        <p className="t-label flex items-center gap-2">
          <IconAlert size={14} />
          Nothing was imported
        </p>
        <p className="t-finding mt-3">{outcome.refusal}</p>
        {outcome.parserLabel ? (
          <p className="t-secondary mt-2">Read as {outcome.parserLabel}.</p>
        ) : null}
        <Link href="/settings/billing" className="btn-quiet mt-4 inline-block">
          See the plans
        </Link>
      </section>
    );
  }

  const lines: { label: string; value: string }[] = [
    { label: "Fills imported", value: String(outcome.imported) },
    { label: "Already had", value: String(outcome.duplicates) },
    { label: "Rows skipped", value: String(outcome.skipped) },
    { label: "Rows rejected", value: String(outcome.errors.length) },
    { label: "Trades matched", value: String(outcome.matchedTrades) },
    { label: "New trades", value: String(outcome.newTrades) },
    { label: "Still open", value: String(outcome.openTrades) },
  ];

  return (
    <section className="card mt-6 p-5">
      <p className="t-label flex items-center gap-2" style={{ color: "var(--color-blue)" }}>
        <IconCheck size={14} />
        {outcome.parserLabel}
      </p>

      <dl className="mt-4">
        {lines.map((line, index) => (
          <div
            key={line.label}
            className="stream-row hairline-b flex items-baseline justify-between py-2"
            style={{ animationDelay: `${Math.min(index, 8) * 20}ms` }}
          >
            <dt className="t-secondary">{line.label}</dt>
            <dd className="t-cell">{line.value}</dd>
          </div>
        ))}
      </dl>

      {outcome.imported === 0 && outcome.duplicates > 0 ? (
        <p className="t-secondary mt-4">
          Every fill in that file was already in this account, so nothing changed. Re-importing an
          overlapping export is safe.
        </p>
      ) : null}

      {outcome.errors.length ? (
        <div className="mt-5">
          <p className="t-label flex items-center gap-2">
            <IconAlert size={14} />
            Rows we could not read
          </p>
          <ul className="mt-2">
            {outcome.errors.slice(0, 12).map((error, index) => (
              <li key={`${error.rowNumber}-${index}`} className="hairline-b py-2">
                <p className="t-cell">
                  Line {error.rowNumber}: {error.message}
                </p>
                <p className="t-secondary mt-1 truncate">{error.raw}</p>
              </li>
            ))}
          </ul>
          {outcome.errors.length > 12 ? (
            <p className="t-secondary mt-2">and {outcome.errors.length - 12} more.</p>
          ) : null}
          <p className="t-secondary mt-3">
            Nothing was dropped silently — fix these rows in the file and import it again. Duplicates
            are ignored, so re-importing the whole file is safe.
          </p>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/journal" className="btn btn-secondary no-underline">
          See the journal
        </Link>
        <Link href="/insights" className="btn btn-secondary no-underline">
          See the findings
        </Link>
      </div>
    </section>
  );
}
