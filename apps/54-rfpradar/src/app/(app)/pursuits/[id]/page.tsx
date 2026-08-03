import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, users } from "@/db/schema";
import { requireFirm } from "@/lib/auth";
import { hasResponseWorkspace } from "@/lib/plans";
import {
  getPursuit,
  getScorecard,
  isClosed,
  nextStages,
} from "@/lib/pursuits";
import { listBlockUses, listBlocks, listRequirements, isStale } from "@/lib/library";
import { listDeadlines } from "@/lib/deadlines";
import { readCriteria } from "@/lib/scorecard";
import {
  blockKindLabel,
  deadlineKindLabel,
  deadlineTitle,
  deadlineTone,
  formatCents,
  formatCountdown,
  formatDayTime,
  formatDayYear,
  stageLabel,
} from "@/lib/format";
import { StatusPill, stageTone } from "@/components/StatusPill";
import { ScorecardGrid } from "@/components/ScorecardGrid";
import { ChevronLeft, FlagSmall, LinkOut, Plus } from "@/components/icons";
import {
  addPursuitDeadlineAction,
  addRequirementAction,
  closePursuitAction,
  completeDeadlineAction,
  deleteRequirementAction,
  linkBlockAction,
  recordDecisionAction,
  saveScorecardAction,
  setOwnerAction,
  setRequirementStatusAction,
  setStageAction,
  unlinkBlockAction,
} from "../actions";

export const metadata: Metadata = { title: "Pursuit" };

/**
 * The pursuit: stage header and owner, the scorecard at go/no-go, the requirement
 * checklist, the linked library blocks with their snapshot notices, the deadline
 * rows, and the activity trail.
 *
 * The link-and-snapshot semantics are visible rather than implied: each linked
 * block says which version it froze, and says so again when the library has moved
 * on since. That is the difference between a promise in a README and a promise a
 * user can check.
 */
export default async function PursuitPage({ params }: { params: Promise<{ id: string }> }) {
  const { firm, access } = await requireFirm();
  if (!hasResponseWorkspace(access.planId)) notFound();

  const { id } = await params;
  const row = await getPursuit(firm.id, id);
  if (!row) notFound();

  const db = getDb();
  const tz = firm.timezone;
  const now = new Date();
  const closed = isClosed(row.pursuit.stage);

  const [scorecard, requirements, blockUses, blocks, allDeadlines, seats, trail] = await Promise.all(
    [
      getScorecard(row.pursuit.id),
      listRequirements(row.pursuit.id),
      listBlockUses(row.pursuit.id),
      listBlocks(firm.id, {}),
      listDeadlines(firm.id, { includeCompleted: true }),
      db.select().from(users).where(eq(users.firmId, firm.id)),
      db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.firmId, firm.id)))
        .orderBy(desc(auditLog.createdAt))
        .limit(60),
    ],
  );

  const deadlines = allDeadlines.filter((d) => d.pursuitId === row.pursuit.id);
  const seatName = new Map(seats.map((seat) => [seat.id, seat.name]));
  const decidedBy = scorecard?.decidedByUserId ? seatName.get(scorecard.decidedByUserId) : null;
  const activity = trail.filter((entry) => entry.target === row.pursuit.id || isRelated(entry, row.pursuit.id));

  return (
    <main className="pt-4">
      <Link href="/pursuits" className="btn-quiet">
        <ChevronLeft size={18} /> Pursuits
      </Link>

      <header className="mt-3">
        <div className="flex items-start gap-3">
          <h1 className="t-h2 flex-1">{row.pursuit.title}</h1>
          <StatusPill label={stageLabel(row.pursuit.stage)} tone={stageTone(row.pursuit.stage)} />
        </div>
        <p className="t-secondary mt-2">
          {[
            row.ownerName ? `owner ${row.ownerName}` : "unassigned",
            row.pursuit.valueCents ? formatCents(row.pursuit.valueCents) : "value not set",
            row.pursuit.closedAt ? `closed ${formatDayYear(row.pursuit.closedAt, tz)}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {row.opportunity && (
          <p className="t-mono mt-2" style={{ color: "var(--color-ink-3)" }}>
            {row.opportunity.externalId} · {row.opportunity.agency}
          </p>
        )}
        {row.opportunity && (
          <a
            href={row.opportunity.url}
            className="btn-quiet mt-1"
            target="_blank"
            rel="noreferrer noopener"
          >
            Open the original notice <LinkOut size={18} />
          </a>
        )}
      </header>

      {!closed && (
        <section className="mt-5 flex flex-wrap items-center gap-3">
          {nextStages(row.pursuit.stage).map((stage) => (
            <form action={setStageAction} key={stage}>
              <input type="hidden" name="pursuitId" value={row.pursuit.id} />
              <input type="hidden" name="stage" value={stage} />
              <button
                className={`btn btn-compact ${stage === "no_bid" ? "btn-secondary" : "btn-primary"}`}
                type="submit"
              >
                Move to {stageLabel(stage)}
              </button>
            </form>
          ))}
          <form action={setOwnerAction} className="flex items-center gap-2">
            <input type="hidden" name="pursuitId" value={row.pursuit.id} />
            <label className="t-label" htmlFor="ownerUserId">
              Owner
            </label>
            <select
              className="select"
              id="ownerUserId"
              name="ownerUserId"
              defaultValue={row.pursuit.ownerUserId ?? ""}
              style={{ width: "auto", minWidth: 160 }}
            >
              <option value="">Unassigned</option>
              {seats.map((seat) => (
                <option key={seat.id} value={seat.id}>
                  {seat.name}
                </option>
              ))}
            </select>
            <button className="btn-quiet" type="submit">
              Set
            </button>
          </form>
        </section>
      )}

      {/* ---- Scorecard ---- */}
      {(row.pursuit.stage === "go_no_go" || scorecard?.decidedAt) && (
        <section className="mt-6">
          <ScorecardGrid
            pursuitId={row.pursuit.id}
            criteria={readCriteria(scorecard?.criteria ?? null)}
            saveAction={saveScorecardAction}
            decideAction={recordDecisionAction}
            decided={
              scorecard?.decidedAt
                ? {
                    verdict: scorecard.verdict,
                    by: decidedBy ?? null,
                    at: formatDayYear(scorecard.decidedAt, tz),
                  }
                : null
            }
          />
        </section>
      )}

      {/* ---- Requirement checklist ---- */}
      <section className="mt-8">
        <h2 className="t-label">Requirement checklist</h2>
        <div className="rows mt-1">
          {requirements.map((requirement) => (
            <div key={requirement.id} className="py-3 flex items-start gap-3" style={{ minHeight: 56 }}>
              <div className="min-w-0 flex-1">
                <p className="t-body">{requirement.label}</p>
                <p className="t-mono mt-1" style={{ color: "var(--color-ink-3)" }}>
                  {[
                    requirement.ownerUserId
                      ? (seatName.get(requirement.ownerUserId) ?? "unknown")
                      : "unassigned",
                    requirement.dueAt ? formatDayTime(requirement.dueAt, tz) : "no date",
                  ].join(" · ")}
                </p>
              </div>
              {!closed && (
                <div className="shrink-0 flex items-center gap-2">
                  <form action={setRequirementStatusAction}>
                    <input type="hidden" name="pursuitId" value={row.pursuit.id} />
                    <input type="hidden" name="requirementId" value={requirement.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={
                        requirement.status === "todo"
                          ? "drafting"
                          : requirement.status === "drafting"
                            ? "done"
                            : "todo"
                      }
                    />
                    <button className="chip" type="submit">
                      {requirement.status === "todo"
                        ? "To do"
                        : requirement.status === "drafting"
                          ? "Drafting"
                          : "Done"}
                    </button>
                  </form>
                  <form action={deleteRequirementAction}>
                    <input type="hidden" name="pursuitId" value={row.pursuit.id} />
                    <input type="hidden" name="requirementId" value={requirement.id} />
                    <button className="btn-quiet" type="submit">
                      Remove
                    </button>
                  </form>
                </div>
              )}
              {closed && (
                <StatusPill
                  label={requirement.status}
                  tone={requirement.status === "done" ? "ok" : "quiet"}
                />
              )}
            </div>
          ))}
          {requirements.length === 0 && (
            <p className="t-secondary py-3">
              Nothing on the checklist yet. Add the submission requirements from the RFP — one row per
              volume, form, or certificate.
            </p>
          )}
        </div>

        {!closed && (
          <form action={addRequirementAction} className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="pursuitId" value={row.pursuit.id} />
            <label className="flex flex-col gap-2">
              <span className="t-label">New checklist item</span>
              <input
                className="input"
                name="label"
                required
                placeholder="Volume II — Past performance, three references"
              />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="t-label">Owner</span>
                <select className="select" name="ownerUserId" defaultValue="">
                  <option value="">Unassigned</option>
                  {seats.map((seat) => (
                    <option key={seat.id} value={seat.id}>
                      {seat.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2">
                <span className="t-label">Due</span>
                <input className="input" name="dueAt" placeholder="2026-04-10" />
              </label>
            </div>
            <button className="btn btn-secondary" type="submit">
              <Plus size={18} /> Add item
            </button>
          </form>
        )}
      </section>

      {/* ---- Linked library blocks ---- */}
      <section className="mt-8">
        <h2 className="t-label">Linked from the library</h2>
        <div className="mt-1 flex flex-col gap-3">
          {blockUses.map((use) => (
            <article key={use.use.id} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="t-label">{use.use.requirementLabel}</p>
                  <h3 className="t-title mt-1">{use.block?.title ?? "Block deleted from library"}</h3>
                </div>
                <span className="t-mono shrink-0" style={{ color: "var(--color-ink-3)" }}>
                  v{use.use.snapshotVersion}
                </span>
              </div>
              <p className="t-body mt-2" style={{ whiteSpace: "pre-wrap" }}>
                {use.use.snapshotBody}
              </p>
              <p className="t-secondary mt-2">
                Frozen into this pursuit at v{use.use.snapshotVersion} on{" "}
                {formatDayYear(use.use.createdAt, tz)}.
                {use.drifted
                  ? ` The library is now at v${use.block?.version} — this copy is unchanged, on purpose.`
                  : " The library has not changed since."}
              </p>
              {!closed && (
                <form action={unlinkBlockAction} className="mt-2">
                  <input type="hidden" name="pursuitId" value={row.pursuit.id} />
                  <input type="hidden" name="blockUseId" value={use.use.id} />
                  <button className="btn-quiet" type="submit">
                    Unlink
                  </button>
                </form>
              )}
            </article>
          ))}
          {blockUses.length === 0 && (
            <p className="t-secondary">
              Nothing linked yet. Linking copies a block&apos;s text in and freezes it here — editing
              the library afterwards never rewrites this pursuit.
            </p>
          )}
        </div>

        {!closed && blocks.length > 0 && (
          <form action={linkBlockAction} className="mt-4 flex flex-col gap-3">
            <input type="hidden" name="pursuitId" value={row.pursuit.id} />
            <label className="flex flex-col gap-2">
              <span className="t-label">Link a block</span>
              <select className="select" name="answerBlockId" required defaultValue="">
                <option value="" disabled>
                  Choose a block…
                </option>
                {blocks.map((block) => (
                  <option key={block.id} value={block.id}>
                    {blockKindLabel(block.kind)} — {block.title} (v{block.version})
                    {isStale(block.lastReviewedAt, now) ? " — review before use" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="t-label">Against which requirement?</span>
              <input
                className="input"
                name="requirementLabel"
                placeholder="Past performance §4.2"
              />
            </label>
            <button className="btn btn-secondary" type="submit">
              Link and snapshot
            </button>
            <p className="t-secondary">
              Blocks marked “review before use” have not been reviewed in over a year. They still
              link — the warning travels with them.
            </p>
          </form>
        )}
        {blocks.length === 0 && (
          <p className="t-secondary mt-3">
            The library is empty.{" "}
            <Link href="/library" className="btn-quiet">
              Add a block
            </Link>
          </p>
        )}
      </section>

      {/* ---- Deadlines ---- */}
      <section className="mt-8">
        <h2 className="t-label">Dates on this pursuit</h2>
        <div className="rows mt-1">
          {deadlines.map((entry) => {
            const tone = deadlineTone(entry.deadline.dueAt, tz, entry.deadline.completedAt, now);
            return (
              <div
                key={entry.deadline.id}
                className="py-3 flex items-center gap-3"
                style={{ minHeight: 56 }}
              >
                <span
                  className="pill-dot"
                  style={{
                    background:
                      tone === "over"
                        ? "var(--color-red)"
                        : tone === "soon"
                          ? "var(--color-amber)"
                          : tone === "done"
                            ? "var(--color-green)"
                            : "var(--color-ink-3)",
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="t-label">{deadlineKindLabel(entry.deadline.kind)}</p>
                  {/* Two lines, not an ellipsis: at 390px the label is the only
                      thing that tells two dates on one pursuit apart. */}
                  <p className="t-title mt-1 line-clamp-2">
                    {deadlineTitle(entry.deadline.label, entry.deadline.kind)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="t-mono">{formatDayTime(entry.deadline.dueAt, tz)}</p>
                  <p
                    className="t-mono mt-1"
                    style={{
                      color:
                        tone === "over"
                          ? "var(--color-red)"
                          : tone === "soon"
                            ? "var(--color-amber-text)"
                            : "var(--color-ink-3)",
                    }}
                  >
                    {entry.deadline.completedAt
                      ? "done"
                      : formatCountdown(entry.deadline.dueAt, tz, now)}
                  </p>
                </div>
                {!closed && (
                  <form action={completeDeadlineAction}>
                    <input type="hidden" name="pursuitId" value={row.pursuit.id} />
                    <input type="hidden" name="deadlineId" value={entry.deadline.id} />
                    <input
                      type="hidden"
                      name="complete"
                      value={entry.deadline.completedAt ? "0" : "1"}
                    />
                    <button className="btn-quiet" type="submit">
                      {entry.deadline.completedAt ? "Reopen" : "Mark done"}
                    </button>
                  </form>
                )}
              </div>
            );
          })}
          {deadlines.length === 0 && (
            <p className="t-secondary py-3">
              No dates yet. Whatever you add here appears in the calendar, the ICS feed, and the
              T-7/3/1 reminder ladder.
            </p>
          )}
        </div>

        {!closed && (
          <form action={addPursuitDeadlineAction} className="mt-3 grid gap-3 md:grid-cols-3">
            <input type="hidden" name="pursuitId" value={row.pursuit.id} />
            <label className="flex flex-col gap-2">
              <span className="t-label">Kind</span>
              <select className="select" name="kind" defaultValue="custom">
                <option value="questions">Questions due</option>
                <option value="proposal">Proposal due</option>
                <option value="orals">Oral presentations</option>
                <option value="custom">Milestone</option>
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="t-label">Label</span>
              <input className="input" name="label" required placeholder="Orals — panel of three" />
            </label>
            <label className="flex flex-col gap-2">
              <span className="t-label">Due</span>
              <input className="input" name="dueAt" required placeholder="2026-04-22 10:00" />
            </label>
            <button className="btn btn-secondary md:col-span-3" type="submit">
              <Plus size={18} /> Add date
            </button>
          </form>
        )}
      </section>

      {/* ---- Close ---- */}
      {row.pursuit.stage === "submitted" && (
        <section className="mt-8">
          <h2 className="t-label">Record the outcome</h2>
          <p className="t-secondary mt-1">
            A win flags every library block this pursuit used, so the library learns which answers
            win. Both outcomes count in the denominator.
          </p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {(["won", "lost"] as const).map((outcome) => (
              <form action={closePursuitAction} key={outcome} className="card p-4 flex flex-col gap-3">
                <input type="hidden" name="pursuitId" value={row.pursuit.id} />
                <input type="hidden" name="outcome" value={outcome} />
                <h3 className="t-title">{outcome === "won" ? "Won" : "Lost"}</h3>
                <label className="flex flex-col gap-2">
                  <span className="t-label">Value ($)</span>
                  <input
                    className="input"
                    name="valueCents"
                    inputMode="decimal"
                    defaultValue={
                      row.pursuit.valueCents ? String(row.pursuit.valueCents / 100) : ""
                    }
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="t-label">Debrief note</span>
                  <textarea
                    className="textarea"
                    name="note"
                    rows={3}
                    placeholder={
                      outcome === "won"
                        ? "Won on technical score; the incumbent priced high."
                        : "Lost on price by 8%. Panel liked the SOC section."
                    }
                  />
                </label>
                <button
                  className={`btn ${outcome === "won" ? "btn-primary" : "btn-secondary"}`}
                  type="submit"
                >
                  Record {outcome}
                </button>
              </form>
            ))}
          </div>
        </section>
      )}

      {row.pursuit.outcomeNote && (
        <section className="mt-8">
          <h2 className="t-label">
            {row.pursuit.stage === "no_bid" ? "Why we did not bid" : "Debrief"}
          </h2>
          <p className="t-body mt-1" style={{ whiteSpace: "pre-wrap" }}>
            {row.pursuit.outcomeNote}
          </p>
          {row.pursuit.stage === "won" && (
            <p className="t-secondary mt-2" style={{ color: "var(--color-green-text)" }}>
              <FlagSmall size={18} /> Blocks used here are flagged as winning answers in the library.
            </p>
          )}
        </section>
      )}

      {/* ---- Activity trail ---- */}
      <section className="mt-8">
        <h2 className="t-label">Activity</h2>
        <div className="rows mt-1">
          {activity.map((entry) => (
            <div key={entry.id} className="py-3 flex items-start gap-3">
              <span className="t-mono" style={{ color: "var(--color-ink-3)", flex: "0 0 40%" }}>
                {formatDayTime(entry.createdAt, tz)}
              </span>
              <span className="t-secondary flex-1" style={{ color: "var(--color-ink)" }}>
                {entry.action.replace(/[._]/g, " ")}
                {entry.actor && seatName.get(entry.actor) ? ` · ${seatName.get(entry.actor)}` : ""}
              </span>
            </div>
          ))}
          {activity.length === 0 && (
            <p className="t-secondary py-3">Nothing recorded on this pursuit yet.</p>
          )}
        </div>
      </section>
    </main>
  );
}

/** Audit entries whose metadata names this pursuit (scorecards, links, seats). */
function isRelated(entry: { metadata: unknown }, pursuitId: string): boolean {
  const metadata = entry.metadata as { pursuitId?: string } | null;
  return metadata?.pursuitId === pursuitId;
}
