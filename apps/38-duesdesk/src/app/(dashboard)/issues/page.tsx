import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatIso } from "@/lib/dates";
import { ISSUE_KIND_LABELS, listIssues } from "@/lib/issues";
import { roster } from "@/lib/roster";
import { can } from "@/lib/plans";
import { IssuePill, Notice } from "@/components/ledger";
import { IconCamera, IconChevronRight, IconGavel } from "@/components/icons";
import { OverflowLinks } from "@/components/TabBar";
import { NewIssueSheet } from "./IssueForms";
import type { IssueStatus } from "@/db/schema";

export const metadata: Metadata = { title: "Issues" };
export const dynamic = "force-dynamic";

const FILTERS: { key: IssueStatus | "all"; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "Everything" },
];

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { user, association } = await requireUser();
  const params = await searchParams;
  const active = FILTERS.find((f) => f.key === params.status)?.key ?? "open";

  const rows = await listIssues(association.id, active);
  const all = await listIssues(association.id, "all");
  const entries = await roster(association.id);
  const canEdit = can(user.role, "issues");

  return (
    <main className="screen">
      <header className="flex items-start justify-between gap-4 pt-8">
        <div>
          <p className="t-label">Violations and requests</p>
          <h1 className="t-h2 mt-1">
            {all.filter((r) => r.issue.status === "open" || r.issue.status === "in_progress").length}{" "}
            open
          </h1>
          <p className="t-secondary mt-1">
            {all.length} numbered issue{all.length === 1 ? "" : "s"} on the record
          </p>
        </div>
        <OverflowLinks />
      </header>

      <div className="chip-row mt-6">
        {FILTERS.map((filter) => (
          <Link
            key={filter.key}
            href={filter.key === "open" ? "/issues" : `/issues?status=${filter.key}`}
            className="chip"
            data-active={active === filter.key}
          >
            {filter.label}
            <span className="t-data">
              {filter.key === "all"
                ? all.length
                : all.filter((r) => r.issue.status === filter.key).length}
            </span>
          </Link>
        ))}
      </div>

      <section className="mt-4">
        {rows.length === 0 ? (
          <div className="panel mt-4 p-5">
            <div className="flex items-center gap-2">
              <IconGavel size={20} className="ink-3" />
              <p className="t-title">
                {all.length === 0 ? "Nothing logged yet." : "Nothing in this view."}
              </p>
            </div>
            <p className="t-secondary mt-2">
              {all.length === 0
                ? "A numbered issue with photos and dates is what protects a board later. Log the fence, the gate latch, the deck request — the boring ones are the ones that come back."
                : "Try another filter."}
            </p>
          </div>
        ) : (
          <div className="stagger">
            {rows.map(({ issue, household, eventCount, photoCount, lastEventAt }) => (
              <Link key={issue.id} href={`/issues/${issue.id}`} className="row">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="t-number">{issue.number}</span>
                    <span className="t-label">{ISSUE_KIND_LABELS[issue.kind]}</span>
                  </span>
                  <span className="t-title mt-1 block truncate">{issue.title}</span>
                  <span className="t-secondary block truncate">
                    {household?.unitLabel ?? "Common area"} · {eventCount} entr
                    {eventCount === 1 ? "y" : "ies"}
                    {photoCount > 0 ? ` · ${photoCount} photo${photoCount === 1 ? "" : "s"}` : ""}
                    {lastEventAt ? ` · ${formatIso(lastEventAt.toISOString().slice(0, 10))}` : ""}
                  </span>
                </span>
                <span className="flex flex-none items-center gap-2">
                  {photoCount > 0 ? <IconCamera size={18} className="ink-3" /> : null}
                  <IssuePill status={issue.status} />
                  <IconChevronRight size={18} className="ink-3" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {canEdit ? (
        <NewIssueSheet
          households={entries.map((e) => ({ id: e.household.id, unitLabel: e.household.unitLabel }))}
        />
      ) : (
        <section className="mt-8">
          <Notice>
            Your role is {user.role}, so the log is read-only for you. Every board member can read
            every issue, including the board-only notes — that is deliberate.
          </Notice>
        </section>
      )}
    </main>
  );
}
