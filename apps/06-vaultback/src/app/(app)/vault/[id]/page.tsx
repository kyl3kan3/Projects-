import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getConnection, healthFor, policyFor } from "@/lib/connections";
import { listSnapshots, recentJobs } from "@/lib/backups";
import { latestDrillFor } from "@/lib/drills";
import { listTargets } from "@/lib/storage-targets";
import { PolicyEditor } from "./PolicyEditor";
import { Pipeline } from "@/components/Pipeline";
import { StatusPill, type PillState } from "@/components/StatusPill";
import { ChecksumLock } from "@/components/Checksum";
import { HoldToConfirm } from "@/components/HoldToConfirm";
import { IconAlertTriangle, IconRestore, IconShieldCheck } from "@/components/icons";
import { PROVIDER_GUIDANCE, PROVIDER_LABELS } from "@/lib/providers";
import { formatBytes, formatCount, formatDuration, formatTimestamp, timeAgo, timeUntil } from "@/lib/format";
import { parseScheduleFields, describeSchedule } from "@/lib/schedule";
import {
  backupNowAction,
  deleteConnectionAction,
  drillNowAction,
  recheckConnectionAction,
  savePolicyAction,
} from "../actions";
import type { Stage } from "@/db/schema";

export const metadata: Metadata = { title: "Database" };
export const dynamic = "force-dynamic";

export default async function DatabasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ connected?: string }>;
}) {
  const { org, user } = await requireUser();
  const { id } = await params;
  const { connected } = await searchParams;

  const connection = await getConnection(id, org.id);
  if (!connection) notFound();

  const [health, policy, snapshots, jobs, drill, targets] = await Promise.all([
    healthFor(connection),
    policyFor(connection.id),
    listSnapshots(connection.id, { limit: 20 }),
    recentJobs(connection.id, 8),
    latestDrillFor(connection.id),
    listTargets(org.id),
  ]);

  const latest = snapshots[0] ?? null;
  const fields = policy ? parseScheduleFields(policy.scheduleCron) : { hour: 4, minute: 0 };

  const state: PillState = health.runningJob
    ? "running"
    : health.lastFailure
      ? "failed"
      : health.verified
        ? "verified"
        : "pending";

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <Link href="/vault" className="btn-quiet no-underline">
          Vault
        </Link>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="t-h2 truncate">{connection.name}</h1>
            <p className="t-data mt-2" style={{ color: "var(--color-text-3)" }}>
              {connection.hostFingerprint}
            </p>
          </div>
          <StatusPill state={state} />
        </div>
        <p className="t-secondary mt-3">
          {PROVIDER_LABELS[connection.provider]}
          {connection.postgresVersion ? ` · ${connection.postgresVersion}` : ""}
          {connection.tableCount != null ? ` · ${formatCount(connection.tableCount)} tables` : ""}
          {connection.approxSizeBytes ? ` · ${formatBytes(connection.approxSizeBytes)} on disk` : ""}
        </p>
      </header>

      {connected ? (
        <p className="panel t-secondary mb-6 p-4" style={{ color: "var(--color-seal)" }} role="status">
          Connected. The first snapshot has been taken and its checksum verified.
        </p>
      ) : null}

      {connection.roleIsSuperuser ? (
        <Advisory>
          This connection uses a superuser role. VaultBack only reads, but a dedicated read-only role
          limits what a compromise of our systems could do with it.
        </Advisory>
      ) : null}

      {connection.pooled ? (
        <Advisory>{PROVIDER_GUIDANCE[connection.provider].poolerAdvice}</Advisory>
      ) : null}

      {health.lastFailure ? (
        <section
          className="panel mb-6 p-4"
          style={{ borderColor: "color-mix(in srgb, var(--color-torch) 40%, transparent)" }}
          role="alert"
        >
          <p className="t-title" style={{ color: "var(--color-torch)" }}>
            Last backup failed
          </p>
          <p className="t-secondary mt-1">{health.lastFailure.detail}</p>
          <p className="t-data mt-2" style={{ color: "var(--color-text-3)" }}>
            {formatTimestamp(health.lastFailure.at)}
          </p>
        </section>
      ) : null}

      {health.runningJob ? (
        <section className="mb-8">
          <p className="t-label">Running now</p>
          <Pipeline stage={health.runningJob.stage as Stage} state="running" />
        </section>
      ) : null}

      <div className="two-pane">
        <div className="min-w-0">
          {/* --- the evidence, first: what exists and whether it verified --- */}
          <section className="mb-8">
            <p className="t-label mb-3">Latest snapshot</p>
            {latest ? (
              <div className="report-card">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="t-data">{formatTimestamp(latest.createdAt)}</span>
                  <span className="t-data" style={{ color: "var(--color-text-2)" }}>
                    {formatBytes(latest.compressedSizeBytes)}
                  </span>
                </div>
                <div className="mt-3">
                  <ChecksumLock sha256={latest.sha256} verified animate={Boolean(connected)} />
                </div>
                <p className="t-data mt-3" style={{ color: "var(--color-text-3)" }}>
                  {formatCount(latest.manifest?.totalRows ?? 0)} rows ·{" "}
                  {formatCount(latest.manifest?.tables.length ?? 0)} tables ·{" "}
                  {formatBytes(latest.sizeBytes)} raw · {formatDuration(latest.durationMs)} ·{" "}
                  {latest.dumpEngine}
                </p>
                <p className="t-secondary mt-3">
                  Expires {latest.expiresAt ? formatTimestamp(latest.expiresAt) : "never"} · encrypted
                  with a per-snapshot AES-256-GCM key
                </p>
              </div>
            ) : (
              <p className="t-secondary">
                No snapshot yet. The first scheduled run is {policy ? timeUntil(policy.nextRunAt) : "not scheduled"}.
              </p>
            )}
          </section>

          {/* --- drill evidence --- */}
          <section className="mb-8">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="t-label">Restore drill</p>
              {policy?.nextDrillAt ? (
                <span className="t-data" style={{ color: "var(--color-text-3)" }}>
                  next {timeUntil(policy.nextDrillAt)}
                </span>
              ) : null}
            </div>
            {drill ? (
              <div className="report-card">
                <div className="flex items-center justify-between gap-3">
                  <span className="t-label">Restore drill · {formatTimestamp(drill.createdAt)}</span>
                  <StatusPill
                    state={drill.status === "passed" ? "verified" : drill.status === "failed" ? "failed" : "running"}
                    label={drill.status === "passed" ? "Passed" : drill.status === "failed" ? "Failed" : drill.status}
                  />
                </div>
                <p className="t-data mt-3">
                  {formatCount(Number(drill.rowsRestored))} rows ·{" "}
                  {formatCount(drill.tablesRestored)} of {formatCount(drill.tablesExpected)} tables ·{" "}
                  {drill.status === "passed" ? "match" : "mismatch"}
                </p>
                {drill.errorDetail ? (
                  <p className="t-secondary mt-2" style={{ color: "var(--color-torch)" }}>
                    {drill.errorDetail}
                  </p>
                ) : null}
                <p className="t-secondary mt-3" style={{ color: "var(--color-text-3)" }}>
                  Scratch database {drill.scratchInstance ?? "—"} · created and dropped for this drill ·{" "}
                  {formatDuration(drill.durationMs)}
                </p>
                <Link href="/drills" className="btn-quiet mt-3 inline-block no-underline">
                  All drill evidence
                </Link>
              </div>
            ) : (
              <p className="t-secondary">
                No drill has run for this database yet.{" "}
                {policy?.drillFrequency === "none"
                  ? "Automated drills start on the Startup plan; you can run one by hand now."
                  : "The first scheduled drill will use the newest snapshot."}
              </p>
            )}
            {latest ? (
              <form action={drillNowAction} className="mt-4">
                <input type="hidden" name="connectionId" value={connection.id} />
                <button className="btn btn-secondary btn-full" type="submit">
                  <IconShieldCheck size={18} />
                  Run a drill now
                </button>
              </form>
            ) : null}
          </section>

          {/* --- snapshot history --- */}
          <section className="mb-8">
            <p className="t-label mb-2">Snapshots</p>
            {snapshots.length ? (
              <>
                {snapshots.map((snapshot) => (
                  <Link
                    key={snapshot.id}
                    href={`/restore?snapshot=${snapshot.id}`}
                    className="row row-snapshot"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="t-data block">{formatTimestamp(snapshot.createdAt)}</span>
                      <span className="t-data mt-1.5 block" style={{ color: "var(--color-text-3)" }}>
                        {formatBytes(snapshot.compressedSizeBytes)} ·{" "}
                        {formatCount(snapshot.manifest?.totalRows ?? 0)} rows
                      </span>
                    </span>
                    <ChecksumLock sha256={snapshot.sha256} verified />
                  </Link>
                ))}
                <Link href="/restore" className="btn-quiet mt-4 inline-flex items-center gap-2 no-underline">
                  <IconRestore size={18} />
                  Restore one of these
                </Link>
              </>
            ) : (
              <p className="t-secondary">Nothing stored yet.</p>
            )}
          </section>

          {/* --- run history, including failures --- */}
          {jobs.length ? (
            <section className="mb-8">
              <p className="t-label mb-2">Recent runs</p>
              <div className="scroll-x">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="t-label hairline-b py-2 text-left font-semibold">Started</th>
                      <th className="t-label hairline-b py-2 text-left font-semibold">Trigger</th>
                      <th className="t-label hairline-b py-2 text-left font-semibold">Result</th>
                      <th className="t-label hairline-b py-2 text-right font-semibold">Stored</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => (
                      <tr key={job.id}>
                        <td className="t-data hairline-b py-3 pr-4">
                          {job.startedAt ? formatTimestamp(job.startedAt) : "queued"}
                        </td>
                        <td className="t-data hairline-b py-3 pr-4" style={{ color: "var(--color-text-3)" }}>
                          {job.trigger}
                        </td>
                        <td
                          className="t-data hairline-b py-3 pr-4"
                          style={{
                            color:
                              job.status === "failed"
                                ? "var(--color-torch)"
                                : job.status === "succeeded"
                                  ? "var(--color-seal)"
                                  : "var(--color-brass)",
                          }}
                        >
                          {job.status === "failed" ? (job.errorCode ?? "failed") : job.status}
                        </td>
                        <td className="t-data hairline-b py-3 text-right" style={{ color: "var(--color-text-2)" }}>
                          {job.bytesProcessed ? formatBytes(job.bytesProcessed) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>

        {/* --- policy + maintenance --- */}
        <aside className="min-w-0">
          <section className="mb-8">
            <p className="t-label mb-3">Schedule</p>
            {policy ? (
              <>
                <p className="t-data mb-4" style={{ color: "var(--color-text-2)" }}>
                  {describeSchedule(policy.frequency, policy.scheduleCron, policy.timezone)} ·{" "}
                  {policy.enabled ? `next ${timeUntil(policy.nextRunAt)}` : "paused"}
                </p>
                <PolicyEditor
                  policy={policy}
                  connectionId={connection.id}
                  planId={org.plan}
                  targets={targets}
                  hour={fields.hour}
                  minute={fields.minute}
                  action={savePolicyAction}
                />
              </>
            ) : (
              <p className="t-secondary">This database has no policy. Reconnect it to create one.</p>
            )}
          </section>

          <section className="mb-8">
            <p className="t-label mb-3">Maintenance</p>
            <form action={recheckConnectionAction} className="mb-3">
              <input type="hidden" name="connectionId" value={connection.id} />
              <button className="btn btn-secondary btn-full" type="submit">
                Re-check the connection
              </button>
            </form>
            <p className="t-secondary" style={{ color: "var(--color-text-3)" }}>
              Last checked {timeAgo(connection.lastCheckedAt)}
              {connection.lastCheckError ? ` · ${connection.lastCheckError}` : ""}
            </p>
          </section>

          <section className="mb-8">
            <p className="t-label mb-3">Remove</p>
            <p className="t-secondary mb-3">
              Removing {connection.name} deletes its schedule and its snapshot records. Objects
              already in your own bucket are left where they are — they are yours.
            </p>
            <HoldToConfirm
              action={deleteConnectionAction}
              hiddenName="connectionId"
              hiddenValue={connection.id}
              label={`Hold to remove ${connection.name}`}
              confirmLabel="Removing…"
            />
            <p className="t-secondary mt-2" style={{ color: "var(--color-text-3)" }}>
              Signed in as {user.email}
            </p>
          </section>
        </aside>
      </div>

      {!health.runningJob ? (
        <div className="thumb-cta">
          <form action={backupNowAction}>
            <input type="hidden" name="connectionId" value={connection.id} />
            <button className="btn btn-primary btn-full" type="submit">
              Back up now
            </button>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function Advisory({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="panel mb-6 flex items-start gap-3 p-4"
      style={{ borderColor: "color-mix(in srgb, var(--color-brass) 40%, transparent)" }}
    >
      <span style={{ color: "var(--color-brass)", marginTop: 2 }}>
        <IconAlertTriangle size={18} />
      </span>
      <p className="t-secondary">{children}</p>
    </section>
  );
}
