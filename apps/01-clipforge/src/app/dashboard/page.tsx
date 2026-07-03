import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { planFor } from "@/lib/plans";
import { formatDuration, STATUS_LABELS } from "@/lib/utils";
import { BottomNav } from "@/components/BottomNav";
import { UploadSheet } from "@/components/UploadSheet";
import { NewKitButton } from "@/components/NewKitButton";
import { BrandMark, IconFilm } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { user, workspace } = await requireUser();
  const plan = planFor(workspace.plan);
  const used = workspace.uploadsUsedThisPeriod;
  const limit = plan.uploadsPerPeriod;
  const overLimit = used >= limit;

  const db = getDb();
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.workspaceId, workspace.id))
    .orderBy(desc(projects.createdAt))
    .limit(50);

  return (
    <main className="mx-auto max-w-2xl px-5 pb-28 pt-4">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2 font-display text-lg">
          <BrandMark size={24} />
          ClipForge
        </div>
        <div className="mono text-xs text-[var(--color-muted)]">
          {used}/{limit} uploads
        </div>
      </header>

      {/* Plan + quota as a compact strip */}
      <div className="card mb-5 flex items-center justify-between p-4">
        <div>
          <div className="text-xs text-[var(--color-muted)]">Plan</div>
          <div className="font-display text-lg">
            {plan.name}
            {workspace.subscriptionStatus === "past_due" && (
              <span className="badge ml-2" style={{ color: "var(--color-danger)" }}>past due</span>
            )}
          </div>
        </div>
        {/* quota as a mini film strip */}
        <div className="flex gap-[3px]" aria-hidden>
          {Array.from({ length: Math.min(limit, 20) }).map((_, i) => (
            <span
              key={i}
              className="h-5 w-[9px] rounded-[2px] border"
              style={{
                borderColor: "var(--color-line)",
                background: i < used ? "rgba(232,163,61,0.8)" : "var(--color-panel-2)",
              }}
            />
          ))}
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h1 className="t-h2 font-display">Your projects</h1>
        <NewKitButton />
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="flex justify-center text-[var(--color-faint)]"><IconFilm size={28} /></div>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            No projects yet. Add a video, podcast, or a YouTube link to get your first kit.
          </p>
          <div className="mt-4">
            <NewKitButton primary />
          </div>
        </div>
      ) : (
        <ul className="rowlist border-y border-[var(--color-line)]">
          {rows.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projects/${p.id}`}
                className="row-tap flex min-h-[56px] items-center justify-between gap-3 py-4"
              >
                <div className="min-w-0">
                  <div className="t-title truncate">{p.title}</div>
                  <div className="mono mt-0.5 text-[13px] text-[var(--color-faint)]">
                    {formatDuration(p.durationSeconds)} · {new Date(p.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <StatusPill status={p.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <UploadSheet overLimit={overLimit} />
      <BottomNav email={user.email} />
    </main>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "ready" ? "is-ready" : status === "failed" ? "is-failed" : "is-active";
  return (
    <span className={`stage-pill ${cls} shrink-0`}>
      <span className="dot" />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
