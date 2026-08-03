import type { AttendanceMatrix as Matrix } from "@/lib/signoff";
import { monthDay } from "@/lib/dates";

/**
 * The employees × weeks pivot from DESIGN.md: a panel frame in its own
 * horizontal scroll track, 24px cells, a filled green dot for signed, a faint
 * ring for absent, an orange ring for a missed talk. Every state is also readable
 * as text in the row's title attribute and in the legend — the grid is never the
 * only way to know.
 */
export function AttendanceMatrix({ matrix }: { matrix: Matrix }) {
  if (matrix.rows.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between">
        <h2 className="t-label">Attendance · last {matrix.weeks.length} weeks</h2>
        <a className="btn-quiet" href="/api/attendance/export" style={{ minHeight: 0 }}>
          Export CSV
        </a>
      </div>
      <div className="panel mt-3 overflow-hidden">
        <div className="matrix-track">
          <table className="w-max border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 px-4 py-3 text-left" style={{ background: "var(--color-surface)" }}>
                  <span className="t-label">Employee</span>
                </th>
                {matrix.weeks.map((week) => (
                  <th key={week} className="px-1 py-3">
                    <span className="t-data" style={{ color: "var(--color-fg-3)", fontSize: 10 }}>
                      {monthDay(week)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row) => (
                <tr key={row.employee.id} className="rule-t">
                  <td
                    className="sticky left-0 z-10 max-w-[168px] truncate px-4 py-2"
                    style={{ background: "var(--color-surface)" }}
                  >
                    <span className="t-title text-[14px]">{row.employee.name}</span>
                    <span className="t-secondary block truncate" style={{ fontSize: 11 }}>
                      {row.crewName ?? "No crew"}
                    </span>
                  </td>
                  {row.cells.map((cell, i) => (
                    <td key={matrix.weeks[i]} className="px-1 py-2">
                      <div
                        className="matrix-cell"
                        title={`${row.employee.name} · week of ${matrix.weeks[i]} · ${cellLabel(cell.state)}${
                          cell.signedAt ? ` at ${cell.signedAt.toISOString().slice(11, 16)}` : ""
                        }`}
                      >
                        <span className={`matrix-mark ${markClass(cell.state)}`} />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        <Legend cls="matrix-signed" label="Signed" />
        <Legend cls="matrix-absent" label="Absent, noted" />
        <Legend cls="matrix-missed" label="Talk missed" />
        <Legend cls="matrix-pending" label="Waiting" />
        <Legend cls="matrix-none" label="Not scheduled" />
      </ul>
    </section>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`matrix-mark ${cls}`} />
      <span className="t-secondary">{label}</span>
    </li>
  );
}

function cellLabel(state: string): string {
  switch (state) {
    case "signed":
      return "signed";
    case "absent":
      return "absent, noted by the foreman";
    case "missed":
      return "talk missed";
    case "pending":
      return "waiting for a signature";
    default:
      return "no talk scheduled";
  }
}

function markClass(state: string): string {
  switch (state) {
    case "signed":
      return "matrix-signed";
    case "absent":
      return "matrix-absent";
    case "missed":
      return "matrix-missed";
    case "pending":
      return "matrix-pending";
    default:
      return "matrix-none";
  }
}
