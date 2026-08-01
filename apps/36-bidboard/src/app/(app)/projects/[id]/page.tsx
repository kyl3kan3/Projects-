import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, canWrite } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { Pill } from "@/components/StatusPill";
import { IconChevronRight, IconDownload } from "@/components/icons";
import { DIVISIONS, divisionLabel } from "@/lib/csi";
import { coverageLine, coveragePct, dueStamp, fileSize, moneyShort, stampDate } from "@/lib/format";
import { getProject, packageSummaries } from "@/lib/projects";
import { listPlanFiles, storageUsage } from "@/lib/plan-files";
import { PLANS } from "@/lib/plans";
import {
  archiveProjectAction,
  createPackageAction,
  deletePlanAction,
  updateProjectAction,
  uploadPlanAction,
} from "../actions";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { company, user } = await requireUser();
  const project = await getProject(company.id, id);
  if (!project) notFound();

  const [packages, plans, used] = await Promise.all([
    packageSummaries(company.id, project.id),
    listPlanFiles(company.id, project.id),
    storageUsage(company.id),
  ]);
  const now = new Date();
  const writable = canWrite(user.role);
  const taken = new Set(packages.map((p) => p.pkg.csiDivision));

  return (
    <main className="wrap">
      <header className="gutter" style={{ paddingBlock: "var(--s5)" }}>
        <Link href="/projects" className="t-secondary">
          ← Projects
        </Link>
        <h1 className="t-h2" style={{ marginTop: "var(--s3)" }}>
          {project.name}
        </h1>
        <p className="t-data" style={{ color: "var(--fg-2)", marginTop: "var(--s2)" }}>
          {dueStamp(project.bidDueAt, now)}
        </p>
        {project.address ? (
          <p className="t-secondary" style={{ marginTop: 2 }}>
            {project.address}
          </p>
        ) : null}
        {project.notes ? (
          <p className="notice notice-accent" style={{ marginTop: "var(--s4)" }}>
            {project.notes}
          </p>
        ) : null}
      </header>

      {/* ---------------------------------------------------------- packages --- */}
      <section className="hairline-t" style={{ paddingTop: "var(--s5)" }}>
        <div
          className="gutter"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
        >
          <h2 className="t-label">Trade packages</h2>
          <span className="t-data" style={{ color: "var(--fg-3)" }}>
            {packages.length}
          </span>
        </div>

        {packages.length === 0 ? (
          <p className="gutter t-secondary" style={{ marginTop: "var(--s3)" }}>
            No packages yet. Add the trades you are buying out — each one gets its own bid form,
            its own bidders and its own leveling grid.
          </p>
        ) : (
          <div className="rows stagger" style={{ marginTop: "var(--s3)" }}>
            {packages.map((s) => (
              <Link
                key={s.pkg.id}
                href={`/projects/${project.id}/packages/${s.pkg.id}`}
                className="row gutter"
                style={{ alignItems: "flex-start", paddingBlock: "var(--s4)" }}
              >
                <div className="stack" style={{ gap: "var(--s2)", flex: 1, minWidth: 0 }}>
                  <span className="t-label">
                    {s.pkg.csiDivision} · {divisionLabel(s.pkg.csiDivision)}
                  </span>
                  <span className="t-title">{s.pkg.tradeLabel}</span>
                  <span className="t-secondary">
                    {coverageLine(s.submitted, s.invited)}
                    {s.declined > 0 ? ` · ${s.declined} declined` : ""}
                    {s.formLineCount === 0 ? " · no bid form yet" : ""}
                    {s.unanswered > 0
                      ? ` · ${s.unanswered} question${s.unanswered === 1 ? "" : "s"} waiting`
                      : ""}
                  </span>
                  <div className="track" style={{ marginTop: 2, maxWidth: 240 }}>
                    <span style={{ width: `${coveragePct(s.submitted, s.invited)}%` }} />
                  </div>
                </div>
                <div className="stack" style={{ gap: "var(--s2)", alignItems: "flex-end" }}>
                  {s.pkg.status === "awarded" ? (
                    <Pill tone="green">AWARDED</Pill>
                  ) : s.pkg.status === "closed" ? (
                    <Pill tone="neutral">CLOSED</Pill>
                  ) : s.unanswered > 0 ? (
                    <Pill tone="amber">Q&amp;A WAITING</Pill>
                  ) : null}
                  {s.lowestSubmittedCents !== null ? (
                    <span className="t-data" style={{ color: "var(--fg-2)" }}>
                      LOW {moneyShort(s.lowestSubmittedCents)}
                    </span>
                  ) : null}
                  <IconChevronRight size={18} />
                </div>
              </Link>
            ))}
          </div>
        )}

        {writable ? (
          <details className="gutter" style={{ marginTop: "var(--s5)" }}>
            <summary className="btn-quiet">Add a trade package</summary>
            <div style={{ marginTop: "var(--s4)" }}>
              <ActionForm
                action={createPackageAction}
                submitLabel="Add package"
                hiddenFields={{ projectId: project.id }}
              >
                <label className="field">
                  <span className="t-label">Division</span>
                  <select className="select" name="csiDivision" required defaultValue="">
                    <option value="" disabled>
                      Pick a trade…
                    </option>
                    {DIVISIONS.filter((d) => !taken.has(d.code)).map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.code} — {d.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="t-label">Scope notes for bidders</span>
                  <textarea
                    className="textarea"
                    name="scopeNotes"
                    maxLength={4000}
                    placeholder="Base bid excludes owner-furnished fixtures. Include all permits and inspections. Night work weeks 3–4."
                  />
                </label>
                <label
                  className="t-secondary"
                  style={{ display: "flex", gap: "var(--s2)", alignItems: "center" }}
                >
                  <input type="checkbox" name="seedForm" defaultChecked />
                  Seed the bid form with this division&rsquo;s usual line items
                </label>
              </ActionForm>
            </div>
          </details>
        ) : null}
      </section>

      {/* ------------------------------------------------------------- plans --- */}
      <section className="hairline-t" style={{ marginTop: "var(--s6)", paddingTop: "var(--s5)" }}>
        <div
          className="gutter"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
        >
          <h2 className="t-label">Plans &amp; specs</h2>
          <span className="t-data" style={{ color: "var(--fg-3)" }}>
            {fileSize(used)} / {PLANS[company.plan].storageGb} GB
          </span>
        </div>

        {plans.length === 0 ? (
          <p className="gutter t-secondary" style={{ marginTop: "var(--s3)" }}>
            No drawings uploaded. Subs can still bid from scope notes, but a plan set is what turns
            a guess into a number.
          </p>
        ) : (
          <div className="rows" style={{ marginTop: "var(--s3)" }}>
            {plans.map((f) => (
              <div key={f.id} className="row gutter">
                <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                  <span
                    className="t-title"
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      textDecoration: f.supersededAt ? "line-through" : undefined,
                      color: f.supersededAt ? "var(--fg-3)" : undefined,
                    }}
                  >
                    {f.filename}
                  </span>
                  <span className="t-data" style={{ color: "var(--fg-2)" }}>
                    {f.versionLabel.toUpperCase()} · {fileSize(f.bytes)} ·{" "}
                    {stampDate(f.createdAt)}
                    {f.tradePackageId ? " · ONE PACKAGE" : " · WHOLE PROJECT"}
                    {f.supersededAt ? " · SUPERSEDED" : ""}
                  </span>
                </div>
                <a className="btn-quiet" href={`/api/plans/${f.id}`} download>
                  <IconDownload size={18} />
                  <span className="sr-only">Download {f.filename}</span>
                </a>
                {writable ? (
                  <ActionForm
                    action={deletePlanAction}
                    submitLabel="Remove"
                    variant="quiet"
                    compact
                    confirm={`Remove ${f.filename}? Bidders lose access to it.`}
                    hiddenFields={{ fileId: f.id, projectId: project.id }}
                  />
                ) : null}
              </div>
            ))}
          </div>
        )}

        {writable ? (
          <details className="gutter" style={{ marginTop: "var(--s5)" }}>
            <summary className="btn-quiet">Upload a drawing or spec</summary>
            <div style={{ marginTop: "var(--s4)" }}>
              <ActionForm
                action={uploadPlanAction}
                submitLabel="Upload"
                pendingLabel="Uploading…"
                hiddenFields={{ projectId: project.id }}
              >
                <label className="field">
                  <span className="t-label">File</span>
                  <input
                    className="input"
                    type="file"
                    name="file"
                    required
                    accept=".pdf,.dwg,.dxf,.zip,.png,.jpg,.jpeg,.xlsx,.csv,.docx,.rvt,.ifc"
                    style={{ paddingBlock: 12 }}
                  />
                </label>
                <label className="field">
                  <span className="t-label">Version label</span>
                  <input
                    className="input"
                    name="versionLabel"
                    defaultValue="Rev 0"
                    maxLength={60}
                    placeholder="Permit set, Rev 2"
                  />
                </label>
                <label className="field">
                  <span className="t-label">Visible to</span>
                  <select className="select" name="packageId" defaultValue="">
                    <option value="">Every bidder on the project</option>
                    {packages.map((s) => (
                      <option key={s.pkg.id} value={s.pkg.id}>
                        {s.pkg.csiDivision} — {s.pkg.tradeLabel} bidders only
                      </option>
                    ))}
                  </select>
                </label>
                {plans.filter((f) => !f.supersededAt).length > 0 ? (
                  <label className="field">
                    <span className="t-label">Supersedes</span>
                    <select className="select" name="supersedes" defaultValue="">
                      <option value="">Nothing — this is a new document</option>
                      {plans
                        .filter((f) => !f.supersededAt)
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.filename} ({f.versionLabel})
                          </option>
                        ))}
                    </select>
                    <span className="t-secondary">
                      The old version stays downloadable — a sub may have priced against it.
                    </span>
                  </label>
                ) : null}
              </ActionForm>
            </div>
          </details>
        ) : null}
      </section>

      {/* ---------------------------------------------------------- settings --- */}
      {writable ? (
        <section className="hairline-t" style={{ marginTop: "var(--s6)", paddingTop: "var(--s5)" }}>
          <details className="gutter">
            <summary className="btn-quiet">Project details</summary>
            <div style={{ marginTop: "var(--s4)" }} className="stack">
              <ActionForm
                action={updateProjectAction}
                submitLabel="Save changes"
                hiddenFields={{ projectId: project.id }}
              >
                <label className="field">
                  <span className="t-label">Project name</span>
                  <input className="input" name="name" defaultValue={project.name} maxLength={160} />
                </label>
                <label className="field">
                  <span className="t-label">Address</span>
                  <input
                    className="input"
                    name="address"
                    defaultValue={project.address ?? ""}
                    maxLength={240}
                  />
                </label>
                <label className="field">
                  <span className="t-label">Bids due</span>
                  <input
                    className="input"
                    name="bidDueAt"
                    type="date"
                    defaultValue={project.bidDueAt.toISOString().slice(0, 10)}
                  />
                  <span className="t-secondary">
                    Moving the date does not re-send anything. Reminder rungs are recalculated from
                    the new date, and links already sent stay valid to the new date plus a week.
                  </span>
                </label>
                <label className="field">
                  <span className="t-label">Notes for your team</span>
                  <textarea
                    className="textarea"
                    name="notes"
                    defaultValue={project.notes ?? ""}
                    maxLength={2000}
                  />
                </label>
              </ActionForm>

              {project.status !== "archived" ? (
                <div style={{ marginTop: "var(--s5)" }}>
                  <ActionForm
                    action={archiveProjectAction}
                    submitLabel="Archive project"
                    variant="danger"
                    confirm="Archive this project? Nothing is deleted and it stops counting against your plan."
                    hiddenFields={{ projectId: project.id }}
                  />
                </div>
              ) : null}
            </div>
          </details>
        </section>
      ) : null}
    </main>
  );
}
