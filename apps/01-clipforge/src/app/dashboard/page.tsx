import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { planFor } from "@/lib/plans";
import { formatDuration, STATUS_LABELS } from "@/lib/utils";
import { UploadCard } from "@/components/UploadCard";
import { PlanControls } from "@/components/PlanControls";

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
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2 text-lg font-bold">
          <span className="inline-block h-6 w-6 rounded-md bg-gradient-to-br from-[var(--color-brand-2)] to-[var(--color-brand)]" />
          ClipForge
        </Link>
        <div className="flex items-center gap-3 text-sm text-[var(--color-muted)]">
          <span>{user.email}</span>
          <form action="/api/auth/logout" method="post">
            <button className="btn btn-ghost text-xs">Log out</button>
          </form>
        </div>
      </header>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 card p-5">
        <div>
          <div className="text-sm text-[var(--color-muted)]">Current plan</div>
          <div className="font-display text-xl font-bold">
            {plan.name}
            {workspace.subscriptionStatus === "past_due" && (
              <span className="badge ml-2 text-amber-300">past due</span>
            )}
          </div>
          <div className="mt-1 text-sm text-[var(--color-muted)]">
            <span className="mono">{used}</span> / <span className="mono">{limit}</span>{" "}
            uploads used this period
          </div>
          {/* Quota as a film strip: one frame per upload, used frames lit. */}
          <div className="mt-3 flex gap-1" aria-hidden>
            {Array.from({ length: Math.min(limit, 40) }).map((_, i) => (
              <span
                key={i}
                className="h-5 w-3 rounded-[2px] border"
                style={{
                  borderColor: "var(--color-line)",
                  background:
                    i < used
                      ? "linear-gradient(180deg, var(--color-brand-2), var(--color-brand))"
                      : "var(--color-panel-2)",
                  boxShadow: i < used ? "0 0 8px -2px var(--color-brand)" : "none",
                }}
              />
            ))}
          </div>
        </div>
        <PlanControls currentPlan={plan.id} />
      </div>

      <div className="grid gap-6 md:grid-cols-[360px_1fr]">
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            New content kit
          </h2>
          <UploadCard overLimit={overLimit} />
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Your projects
          </h2>
          {rows.length === 0 ? (
            <div className="card p-8 text-center text-sm text-[var(--color-muted)]">
              No projects yet. Upload a video or podcast to get started.
            </div>
          ) : (
            <ul className="space-y-2">
              {rows.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.id}`}
                    className="group card card-lift flex items-center justify-between overflow-hidden p-4"
                  >
                    {/* sprocket reel edge, revealed on hover */}
                    <span className="sprockets absolute inset-x-0 top-0 h-1.5 opacity-0 transition-opacity group-hover:opacity-60" />
                    <span className="sprockets absolute inset-x-0 bottom-0 h-1.5 opacity-0 transition-opacity group-hover:opacity-60" />
                    <div>
                      <div className="font-medium">{p.title}</div>
                      <div className="mono text-xs text-[var(--color-muted)]">
                        {formatDuration(p.durationSeconds)} ·{" "}
                        {new Date(p.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <StatusPill status={p.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}

function StatusPill({ status }: { status: string }) {
  const done = status === "ready";
  const failed = status === "failed";
  const color = done
    ? "text-emerald-300"
    : failed
      ? "text-red-300"
      : "text-[var(--color-accent)]";
  return <span className={`badge ${color}`}>{STATUS_LABELS[status] ?? status}</span>;
}
