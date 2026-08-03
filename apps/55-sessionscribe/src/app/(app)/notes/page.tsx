import type { Metadata } from "next";
import Link from "next/link";
import { requirePractice } from "@/lib/auth";
import { listSessions, type SessionFilter } from "@/lib/sessions";
import { SessionRow } from "@/components/SessionRow";

export const metadata: Metadata = { title: "Notes" };
export const dynamic = "force-dynamic";

const FILTERS: { key: SessionFilter; label: string }[] = [
  { key: "needs_review", label: "Needs review" },
  { key: "signed", label: "Signed" },
  { key: "failed", label: "Failed" },
  { key: "all", label: "All" },
];

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { practice } = await requirePractice();
  const params = await searchParams;
  const filter = (FILTERS.find((f) => f.key === params.filter)?.key ??
    "needs_review") as SessionFilter;
  const rows = await listSessions(practice.id, filter);
  const now = new Date();

  return (
    <main className="screen pt-6">
      <h1 className="t-h2 mb-3">Notes</h1>

      <div className="chip-row mb-4">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            className="chip"
            data-active={f.key === filter}
            href={`/notes?filter=${f.key}`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="t-secondary py-4">
          {filter === "needs_review"
            ? "Nothing waiting on your signature. That is the whole idea."
            : filter === "signed"
              ? "No signed notes yet. Sign your first draft and it will appear here, locked."
              : filter === "failed"
                ? "No failed sessions. If a capture ever fails, it appears here with the reason and a retry."
                : "No sessions captured yet."}
        </p>
      ) : (
        rows.map((row, i) => (
          <div
            key={row.session.id}
            className="enter"
            style={{ animationDelay: `${Math.min(i, 8) * 24}ms` }}
          >
            <SessionRow row={row} timeZone={practice.timezone} now={now} />
          </div>
        ))
      )}

      <div className="sticky-action">
        <Link className="btn btn-primary btn-full" href="/capture">
          Capture session
        </Link>
      </div>
    </main>
  );
}
