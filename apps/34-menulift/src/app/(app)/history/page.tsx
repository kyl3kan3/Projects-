import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { loadChangeHistory } from "@/lib/menus";
import { stamp } from "@/lib/format";

export const metadata: Metadata = { title: "Change history" };

/**
 * Who changed what, when. Written as a side effect of every edit, so there is no
 * way to change a price without leaving a row here.
 */
export default async function HistoryPage() {
  const { location } = await requireUser();
  const rows = await loadChangeHistory(location.id, 200);

  return (
    <main className="screen" style={{ paddingTop: 24 }}>
      <h1 className="t-h2" style={{ marginTop: 0, marginBottom: 8 }}>
        Change history
      </h1>
      <p className="t-secondary" style={{ marginTop: 0, marginBottom: 24 }}>
        Every price, description, 86 and photo decision at {location.name}, newest first.
      </p>

      {rows.length === 0 ? (
        <p className="t-body hairline-t" style={{ paddingTop: 24 }}>
          Nothing yet. The first edit you make shows up here with your name on it.
        </p>
      ) : (
        <ul className="hairline-t" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {rows.map((row) => (
            <li key={row.id} className="row" style={{ display: "block" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                <p className="t-body" style={{ margin: 0, flex: 1 }}>
                  {row.itemName ? `${row.itemName} — ` : ""}
                  {row.field}
                </p>
                <p className="t-data" style={{ margin: 0, color: "var(--fg-2)", flex: "0 0 auto" }}>
                  {stamp(row.changedAt, location.timezone)}
                </p>
              </div>
              <p className="t-secondary" style={{ margin: "4px 0 0" }}>
                {row.oldValue !== null || row.newValue !== null ? (
                  <>
                    <span className="t-data">{row.oldValue ?? "—"}</span>
                    {" → "}
                    <span className="t-data">{row.newValue ?? "—"}</span>
                    {" · "}
                  </>
                ) : null}
                {row.actorLabel}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
