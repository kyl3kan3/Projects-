import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listConnections } from "@/lib/connections";
import { listDrills } from "@/lib/drills";
import { listPolicies } from "@/lib/policies";
import { StatusPill } from "@/components/StatusPill";
import { plan } from "@/lib/plans";
import { formatCount, formatDuration, formatShortDate, formatTimestamp, timeUntil } from "@/lib/format";

export const metadata: Metadata = { title: "Drills" };
export const dynamic = "force-dynamic";

export default async function DrillsPage() {
  const { org } = await requireUser();
  const [drills, connections, policies] = await Promise.all([
    listDrills(org.id, 30),
    listConnections(org.id),
    listPolicies(org.id),
  ]);
  const limits = plan(org.plan);
  const nameFor = (id: string) => connections.find((c) => c.id === id)?.name ?? "database";

  const passed = drills.filter((d) => d.status === "passed").length;
  const failed = drills.filter((d) => d.status === "failed").length;
  const nextDrill = policies
    .map((p) => p.nextDrillAt)
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => a.getTime() - b.getTime())[0];

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <p className="t-label">Restore drills</p>
        <h1 className="t-h2 mt-2">
          {drills.length === 0
            ? "No drill has run yet."
            : failed > 0
              ? `${failed} of the last ${drills.length} drills failed.`
              : `${passed} of ${drills.length} drills passed.`}
        </h1>
        <p className="t-secondary mt-1">
          {limits.maxDrill === "none"
            ? "Automated drills start on Startup. You can run one by hand from any database."
            : `${limits.name} runs ${limits.maxDrill} drills${nextDrill ? ` · next ${timeUntil(nextDrill)}` : ""}.`}
        </p>
      </header>

      {drills.length === 0 ? (
        <section className="panel p-5">
          <p className="t-title">A backup that has never been restored is a hypothesis.</p>
          <p className="t-secondary mt-2">
            A drill takes your newest snapshot, creates a throwaway Postgres database, restores into
            it through the same code path a real recovery uses, counts the rows in every table
            against the manifest recorded at dump time, then drops the database. Pass or fail, the
            evidence lands here.
          </p>
          <p className="t-secondary mt-3" style={{ color: "var(--color-text-3)" }}>
            Open a database and press &ldquo;Run a drill now&rdquo; to see one immediately.
          </p>
          <Link href="/vault" className="btn btn-primary btn-full mt-4 no-underline">
            Go to the vault
          </Link>
        </section>
      ) : (
        <section className="flex flex-col gap-4">
          {drills.map((drill) => {
            const checks = drill.rowcountChecks ?? [];
            const mismatched = checks.filter((c) => !c.ok);
            return (
              <article key={drill.id} className="report-card">
                <div className="flex items-center justify-between gap-3">
                  <span className="t-label">
                    Restore drill · {formatShortDate(drill.createdAt)}
                  </span>
                  <StatusPill
                    state={
                      drill.status === "passed"
                        ? "verified"
                        : drill.status === "failed"
                          ? "failed"
                          : "running"
                    }
                    label={
                      drill.status === "passed"
                        ? "Passed"
                        : drill.status === "failed"
                          ? "Failed"
                          : drill.status
                    }
                  />
                </div>

                <p className="t-title mt-3">{nameFor(drill.databaseConnectionId)}</p>

                <p className="t-data mt-2">
                  {formatCount(Number(drill.rowsRestored))} rows ·{" "}
                  {formatCount(drill.tablesRestored)} tables ·{" "}
                  {drill.status === "passed" ? "match" : "mismatch"}
                </p>

                {drill.errorDetail ? (
                  <p className="t-secondary mt-2" style={{ color: "var(--color-torch)" }}>
                    {drill.errorDetail}
                  </p>
                ) : null}

                {checks.length ? (
                  <div className="scroll-x mt-4">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th className="t-label hairline-b py-2 text-left font-semibold">Table</th>
                          <th className="t-label hairline-b py-2 text-right font-semibold">
                            Expected
                          </th>
                          <th className="t-label hairline-b py-2 text-right font-semibold">
                            Restored
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(mismatched.length ? mismatched : checks).slice(0, 12).map((check) => (
                          <tr key={check.table}>
                            <td className="t-data hairline-b py-2 pr-4">{check.table}</td>
                            <td className="t-data hairline-b py-2 text-right">
                              {formatCount(check.expected)}
                            </td>
                            <td
                              className="t-data hairline-b py-2 text-right"
                              style={{
                                color: check.ok ? "var(--color-seal)" : "var(--color-torch)",
                              }}
                            >
                              {check.actual < 0 ? "missing" : formatCount(check.actual)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                <p className="t-data mt-4" style={{ color: "var(--color-text-3)" }}>
                  {formatTimestamp(drill.createdAt)} · {formatDuration(drill.durationMs)} ·{" "}
                  checksum {drill.checksumVerified ? "verified" : "not verified"} · scratch{" "}
                  {drill.scratchInstance ?? "—"}
                </p>
              </article>
            );
          })}

          <p className="t-secondary" style={{ color: "var(--color-text-3)" }}>
            This evidence feeds your compliance PDF.
          </p>
        </section>
      )}
    </main>
  );
}
