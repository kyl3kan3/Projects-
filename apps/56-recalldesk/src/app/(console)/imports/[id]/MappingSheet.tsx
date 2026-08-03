"use client";

import { useActionState } from "react";
import { Icon } from "@/components/icons";
import { count, phoneDisplay } from "@/lib/format";
import { IMPORT_FIELDS, fieldLabel, type ImportField } from "@/lib/pms";
import type { ImportFormState } from "../actions";

/**
 * The mapping editor and the import-preview sheet (DESIGN.md: radius 20, mono
 * counts, anomaly rows in amber, then **Commit import** primary with the "Dry run
 * — nothing saved yet" label under it).
 *
 * Three separate forms rather than one with three submits: re-mapping, committing
 * and rolling back are three different consequences, and a mis-tap between them
 * should be impossible.
 */
export function MappingSheet({
  importId,
  headers,
  mapping,
  sample,
  counts,
  anomalies,
  problems,
  status,
  canCommit,
  remap,
  commit,
  rollback,
}: {
  importId: string;
  headers: string[];
  mapping: Record<string, string>;
  sample: { name: string; externalId: string | null; email: string | null; phone: string | null; visits: number }[];
  counts: { rows: number; patients: number; visits: number };
  anomalies: { code: string; message: string; severity: "info" | "warn" }[];
  problems: string[];
  status: string;
  canCommit: boolean;
  remap: (state: ImportFormState, formData: FormData) => Promise<ImportFormState>;
  commit: (state: ImportFormState, formData: FormData) => Promise<ImportFormState>;
  rollback: (state: ImportFormState, formData: FormData) => Promise<ImportFormState>;
}) {
  const [remapState, remapAction, remapping] = useActionState(remap, { error: null });
  const [commitState, commitAction, committing] = useActionState(commit, { error: null });
  const [rollbackState, rollbackAction, rollingBack] = useActionState(rollback, { error: null });

  const committed = status === "committed";
  const rolledBack = status === "rolled_back";

  return (
    <>
      {!committed && !rolledBack && (
        <form action={remapAction} style={{ marginTop: 8 }}>
          <input type="hidden" name="importId" value={importId} />
          <p className="t-label" style={{ margin: "0 0 8px" }}>
            Column mapping
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            {headers.map((header) => (
              <label key={header} style={{ display: "grid", gap: 4 }}>
                <span className="t-secondary" style={{ color: "var(--color-ink)" }}>
                  {header}
                </span>
                <select className="input" name={`col:${header}`} defaultValue={mapping[header] ?? ""}>
                  <option value="">Ignore this column</option>
                  {IMPORT_FIELDS.map((field) => (
                    <option key={field} value={field}>
                      {fieldLabel(field as ImportField)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {remapState.error && (
            <p className="t-secondary" role="alert" style={{ color: "var(--color-red)" }}>
              {remapState.error}
            </p>
          )}
          <button className="btn btn-secondary" type="submit" disabled={remapping} style={{ marginTop: 16 }}>
            {remapping ? "Re-reading…" : "Re-run the dry run"}
          </button>
        </form>
      )}

      <section className="sheet" style={{ padding: 20, marginTop: 24 }}>
        <p className="t-mono" style={{ margin: 0, fontSize: "1.0625rem" }}>
          {count(counts.rows)} rows · {count(counts.patients)} patients · {count(counts.visits)} visits
        </p>

        {anomalies.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 0", display: "grid", gap: 10 }}>
            {anomalies.map((anomaly) => (
              <li
                key={anomaly.code}
                className="t-secondary"
                style={{
                  display: "flex",
                  gap: 8,
                  color: anomaly.severity === "warn" ? "var(--color-amber-text)" : "var(--color-ink-2)",
                }}
              >
                <Icon
                  name={anomaly.severity === "warn" ? "alert" : "shield-line"}
                  size={18}
                  style={{ flex: "none", marginTop: 1 }}
                />
                {anomaly.message}
              </li>
            ))}
          </ul>
        )}

        {sample.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p className="t-label" style={{ margin: "0 0 4px" }}>
              First rows, as they will import
            </p>
            {sample.map((row, i) => (
              <div
                key={`${row.name}-${i}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "8px 0",
                  borderBottom: "1px solid var(--color-hairline)",
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span className="t-title" style={{ display: "block" }}>
                    {row.name}
                  </span>
                  <span className="t-secondary">
                    {row.externalId ? `chart ${row.externalId} · ` : ""}
                    {row.email ?? "no email"} · {row.phone ? phoneDisplay(row.phone) : "no mobile"}
                  </span>
                </span>
                <span className="t-mono" style={{ whiteSpace: "nowrap" }}>
                  {row.visits} {row.visits === 1 ? "visit" : "visits"}
                </span>
              </div>
            ))}
          </div>
        )}

        {problems.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 0", display: "grid", gap: 8 }}>
            {problems.map((problem) => (
              <li key={problem} className="t-secondary" style={{ color: "var(--color-red)" }}>
                {problem}
              </li>
            ))}
          </ul>
        )}

        {(commitState.error || rollbackState.error) && (
          <p className="t-secondary" role="alert" style={{ color: "var(--color-red)", marginTop: 16 }}>
            {commitState.error ?? rollbackState.error}
          </p>
        )}

        {committed ? (
          <form action={rollbackAction} style={{ marginTop: 20 }}>
            <input type="hidden" name="importId" value={importId} />
            <HoldToConfirm label={rollingBack ? "Rolling back…" : "Roll this import back"} pending={rollingBack} />
            <p className="t-label" style={{ margin: "8px 0 0" }}>
              Hold to confirm · restores every row this import changed
            </p>
          </form>
        ) : rolledBack ? (
          <p className="t-secondary" style={{ marginTop: 20, marginBottom: 0 }}>
            This import was rolled back. Upload the corrected file to try again.
          </p>
        ) : (
          <form action={commitAction} style={{ marginTop: 20 }}>
            <input type="hidden" name="importId" value={importId} />
            <button
              className="btn btn-primary"
              type="submit"
              disabled={committing || !canCommit}
              style={{ width: "100%" }}
            >
              {committing ? "Committing…" : "Commit import"}
            </button>
            <p className="t-label" style={{ margin: "8px 0 0" }}>
              Dry run — nothing saved yet
            </p>
          </form>
        )}
      </section>
    </>
  );
}

/**
 * Hold-to-confirm, 600ms (DESIGN.md: destructive and compliance actions).
 * A real button that submits on hold completion, and it is still keyboard-usable —
 * Enter submits, because a hold gesture cannot be the only path.
 */
function HoldToConfirm({ label, pending }: { label: string; pending: boolean }) {
  return (
    <button
      className="btn btn-secondary hold"
      type="submit"
      disabled={pending}
      style={{ width: "100%", color: "var(--color-red)", borderColor: "var(--color-red)" }}
      onPointerDown={(event) => event.currentTarget.setAttribute("data-holding", "true")}
      onPointerUp={(event) => event.currentTarget.removeAttribute("data-holding")}
      onPointerLeave={(event) => event.currentTarget.removeAttribute("data-holding")}
    >
      <Icon name="pause-octagon" size={18} />
      {label}
    </button>
  );
}
