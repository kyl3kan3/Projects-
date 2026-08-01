import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { IconChevronRight, IconColumns } from "@/components/icons";
import { divisionLabel } from "@/lib/csi";
import { dueStamp, moneyShort } from "@/lib/format";
import { listProjectSummaries, packageSummaries } from "@/lib/projects";
import { Pill } from "@/components/StatusPill";

export const metadata: Metadata = { title: "Leveling" };

/**
 * Every package with bids in it, across projects, sorted by how soon it is due.
 * This is the tab an estimator lives in during bid week — the answer to "what am I
 * comparing tonight".
 */
export default async function LevelingIndexPage() {
  const { company } = await requireUser();
  const summaries = await listProjectSummaries(company.id);
  const live = summaries.filter((s) =>
    ["bidding", "leveling", "awarded"].includes(s.project.status),
  );

  const rows = (
    await Promise.all(
      live.map(async (s) => ({
        project: s.project,
        packages: await packageSummaries(company.id, s.project.id),
      })),
    )
  )
    .flatMap(({ project, packages }) => packages.map((pkg) => ({ project, ...pkg })))
    .filter((row) => row.submitted > 0)
    .sort((a, b) => a.project.bidDueAt.getTime() - b.project.bidDueAt.getTime());

  return (
    <main className="wrap">
      <header className="gutter" style={{ paddingBlock: "var(--s5)" }}>
        <h1 className="t-h2">
          <IconColumns size={20} /> Leveling
        </h1>
        <p className="t-secondary" style={{ marginTop: "var(--s2)" }}>
          Packages with bids in them, soonest due first.
        </p>
      </header>

      {rows.length === 0 ? (
        <section className="gutter">
          <div className="card" style={{ padding: "var(--s6)" }}>
            <p className="t-label">NOTHING TO COMPARE YET</p>
            <p className="t-secondary" style={{ marginTop: "var(--s3)" }}>
              A package shows up here the moment its first bid lands. Until then the work is on the
              status board: who has been invited, who has opened the link, who is silent.
            </p>
            <Link href="/projects" className="btn btn-secondary" style={{ marginTop: "var(--s5)" }}>
              Go to projects
            </Link>
          </div>
        </section>
      ) : (
        <div className="rows stagger">
          {rows.map((row) => (
            <Link
              key={row.pkg.id}
              href={`/projects/${row.project.id}/packages/${row.pkg.id}/leveling`}
              className="row gutter"
              style={{ alignItems: "flex-start", paddingBlock: "var(--s4)" }}
            >
              <div className="stack" style={{ gap: "var(--s1)", flex: 1, minWidth: 0 }}>
                <span className="t-label">
                  {row.pkg.csiDivision} · {divisionLabel(row.pkg.csiDivision)}
                </span>
                <span className="t-title">{row.project.name}</span>
                <span className="t-data" style={{ color: "var(--fg-2)" }}>
                  {dueStamp(row.project.bidDueAt)}
                </span>
                <span className="t-secondary">
                  {row.submitted} of {row.invited} bids in
                  {row.lowestSubmittedCents !== null
                    ? ` · raw low ${moneyShort(row.lowestSubmittedCents)}`
                    : ""}
                </span>
              </div>
              <div className="stack" style={{ gap: "var(--s2)", alignItems: "flex-end" }}>
                {row.pkg.status === "awarded" ? <Pill tone="green">AWARDED</Pill> : null}
                <IconChevronRight size={18} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
