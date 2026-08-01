import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { IconChevronRight, IconPlus } from "@/components/icons";
import { coverageLine, coveragePct, dueStamp } from "@/lib/format";
import { listProjectSummaries } from "@/lib/projects";
import { PLANS } from "@/lib/plans";
import { Pill } from "@/components/StatusPill";
import type { ProjectStatus } from "@/db/schema";

export const metadata: Metadata = { title: "Projects" };

const GROUPS: { status: ProjectStatus[]; label: string }[] = [
  { status: ["bidding"], label: "Bidding" },
  { status: ["leveling"], label: "Leveling" },
  { status: ["awarded"], label: "Awarded" },
  { status: ["draft", "archived"], label: "Archived" },
];

export default async function ProjectsPage() {
  const { company } = await requireUser();
  const summaries = await listProjectSummaries(company.id);
  const now = new Date();

  const activeCount = summaries.filter((s) =>
    ["draft", "bidding", "leveling"].includes(s.project.status),
  ).length;
  const limit = PLANS[company.plan].activeProjects;

  return (
    <main className="wrap">
      {summaries.length === 0 ? <FirstRun /> : null}

      {GROUPS.map(({ status, label }) => {
        const group = summaries.filter((s) => status.includes(s.project.status));
        if (group.length === 0) return null;
        return (
          <section key={label} style={{ paddingTop: "var(--s6)" }}>
            <h2 className="t-label gutter">{label}</h2>
            <div className="rows stagger" style={{ marginTop: "var(--s3)" }}>
              {group.map(({ project, packageCount, invited, submitted, awardedPackages }) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="row gutter"
                  style={{ alignItems: "flex-start", paddingBlock: "var(--s4)" }}
                >
                  <div className="stack" style={{ gap: "var(--s2)", flex: 1, minWidth: 0 }}>
                    <span className="t-title">{project.name}</span>
                    <span className="t-data" style={{ color: "var(--fg-2)" }}>
                      {dueStamp(project.bidDueAt, now)}
                    </span>
                    <span className="t-secondary">
                      {packageCount} package{packageCount === 1 ? "" : "s"} ·{" "}
                      {coverageLine(submitted, invited)}
                      {awardedPackages > 0 ? ` · ${awardedPackages} awarded` : ""}
                    </span>
                    <div className="track" style={{ marginTop: 2, maxWidth: 280 }}>
                      <span style={{ width: `${coveragePct(submitted, invited)}%` }} />
                    </div>
                  </div>
                  <IconChevronRight size={18} />
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      <div className="sticky-actions" style={{ marginTop: "var(--s7)" }}>
        <Link href="/projects/new" className="btn btn-primary btn-full">
          <IconPlus size={18} />
          New project
        </Link>
      </div>
      <p className="gutter t-secondary" style={{ marginTop: "calc(var(--s2) * -1)" }}>
        {Number.isFinite(limit)
          ? `${activeCount} of ${limit} active projects on ${PLANS[company.plan].name}.`
          : `${activeCount} active projects. Unlimited on Precon.`}
      </p>
    </main>
  );
}

function FirstRun() {
  return (
    <section className="gutter" style={{ paddingTop: "var(--s7)" }}>
      <h1 className="t-h2">Three steps to your first leveled package</h1>
      <p className="t-secondary" style={{ marginTop: "var(--s2)" }}>
        Run the job you are bidding this week. It is the only way to know whether this
        beats your spreadsheet.
      </p>

      <ol
        className="stack"
        style={{ gap: "var(--s3)", marginTop: "var(--s6)", listStyle: "none" }}
      >
        {[
          {
            n: "1",
            title: "Import your subs",
            body: "Paste the columns out of your spreadsheet. Company, contact, email, trade.",
            href: "/subs",
            cta: "Import subs",
          },
          {
            n: "2",
            title: "Create the project and its packages",
            body: "Name, address, bid due date. Each trade gets a bid form seeded from its division.",
            href: "/projects/new",
            cta: "New project",
          },
          {
            n: "3",
            title: "Send three invites",
            body: "Your subs get a link — no account, no password. Bids come back already comparable.",
            href: "/subs",
            cta: "Pick subs",
          },
        ].map((step) => (
          <li key={step.n} className="card" style={{ padding: "var(--s5)" }}>
            <span className="t-label">STEP {step.n}</span>
            <h3 className="t-title" style={{ marginTop: "var(--s2)" }}>
              {step.title}
            </h3>
            <p className="t-secondary" style={{ marginTop: "var(--s2)" }}>
              {step.body}
            </p>
            <Link
              href={step.href}
              className="btn-quiet"
              style={{ marginTop: "var(--s2)", display: "inline-block" }}
            >
              {step.cta}
            </Link>
          </li>
        ))}
      </ol>

      <div className="notice notice-accent" style={{ marginTop: "var(--s6)" }}>
        <Pill tone="neutral">NOTHING OUT FOR BID YET</Pill>
        <p style={{ marginTop: "var(--s2)" }}>
          Once a package has bids in, this screen becomes the board: who has bid, who is
          silent, and how many days are left.
        </p>
      </div>
    </section>
  );
}
