import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { answers, deadlines } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import {
  describeDue,
  formatCivilLong,
  formatCivilShort,
  isOverdue,
} from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { deadlineKindLabel } from "@/lib/ics";
import { excerpt } from "@/lib/answers";
import { getGrant, grantActivity, orgToday, reminderLedger } from "@/lib/grants";
import { ladderState, normalizeOffsets } from "@/lib/reminders";
import { previewLadder } from "@/lib/sweep";
import { NEXT_STEP_PROMPT, STAGES, stageLabel } from "@/lib/stages";
import { effectivePlan } from "@/lib/billing";
import { hasWorkspace, plan } from "@/lib/plans";
import { ensureChecklist, listWorkspace, progress, snapshotIsStale } from "@/lib/workspace";
import { IconChevronLeft, IconFlag } from "@/components/icons";
import {
  AddDeadline,
  AddRequirement,
  AwardEntry,
  ChecklistItem,
  GrantEditor,
  HoldToDelete,
  StageMover,
} from "./GrantPanels";
import { deleteGrantAction, toggleDeadlineAction } from "../actions";

export const metadata: Metadata = { title: "Grant" };
export const dynamic = "force-dynamic";

export default async function GrantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org } = await requireUser();
  const grant = await getGrant(org.id, id);
  if (!grant) notFound();

  const today = orgToday(org);
  const db = getDb();
  const dates = await db
    .select()
    .from(deadlines)
    .where(and(eq(deadlines.grantId, grant.id), eq(deadlines.organizationId, org.id)))
    .orderBy(asc(deadlines.dueOn));

  const ledger = await reminderLedger(dates.map((d) => d.id));
  const offsets = normalizeOffsets(org.reminderOffsets);
  const activity = await grantActivity(org.id, grant.id);
  const activePlan = effectivePlan(org);
  const workspaceAllowed = hasWorkspace(activePlan);

  if (workspaceAllowed) await ensureChecklist(org.id, grant.id);
  const workspace = workspaceAllowed ? await listWorkspace(org.id, grant.id) : [];
  const checklist = progress(workspace);

  const library = await db
    .select()
    .from(answers)
    .where(eq(answers.organizationId, org.id))
    .orderBy(asc(answers.kind));

  const awarded = grant.stage === "awarded" || grant.stage === "reporting";

  return (
    <div className="screen">
      <div className="pt-6">
        <Link href="/pipeline" className="btn-quiet" style={{ minHeight: 44 }}>
          <IconChevronLeft size={18} />
          Pipeline
        </Link>
      </div>

      <header className="rule-b pb-4 pt-2">
        <h1 className="t-display" style={{ fontSize: 28, lineHeight: 1.15 }}>
          {grant.funderName}
        </h1>
        <p className="t-body mt-2" style={{ color: "var(--color-ink-2)" }}>
          {grant.title}
        </p>
        <p className="t-data mt-3" style={{ color: "var(--color-ink-2)" }}>
          {[
            stageLabel(grant.stage).toUpperCase(),
            awarded && grant.awardedAmountCents
              ? `${formatCents(grant.awardedAmountCents)} AWARDED`
              : grant.askAmountCents
                ? `${formatCents(grant.askAmountCents)} ASK`
                : null,
            grant.fitScoreAtAdd !== null ? `FIT ${grant.fitScoreAtAdd} AT ADD` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="mt-2">
          <GrantEditor
            grantId={grant.id}
            title={grant.title}
            funderName={grant.funderName}
            askAmount={
              grant.askAmountCents ? String(Math.round(grant.askAmountCents / 100)) : ""
            }
            notes={grant.notes ?? ""}
          />
        </div>
      </header>

      <section className="pt-6">
        <StageMover
          grantId={grant.id}
          stage={grant.stage}
          stages={STAGES.map((s) => ({ id: s.id, label: s.label, hint: s.hint }))}
          prompt={NEXT_STEP_PROMPT[grant.stage] ?? null}
        />
      </section>

      {/* ------------------------------------------------------------ dates --- */}
      <section className="pt-8">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="t-label">Dates</h2>
          <AddDeadline grantId={grant.id} />
        </div>

        {dates.length === 0 ? (
          <p className="t-secondary mt-2">
            No dates yet, so nothing can remind you. Add the LOI or application deadline —
            that is the whole reason this beats a spreadsheet.
          </p>
        ) : (
          <div className="mt-2">
            {dates.map((deadline) => {
              const late = isOverdue(deadline, today);
              const sent = ledger
                .filter((l) => l.deadlineId === deadline.id)
                .filter((l) => l.status === "sent" || l.status === "suppressed")
                .map((l) => l.offsetDays);
              const state = ladderState(deadline, offsets, sent, today);
              const remaining = previewLadder(deadline, offsets, today, sent);
              const isReport = deadline.kind === "report" || deadline.kind === "renewal";

              return (
                <div key={deadline.id} className="rule-b py-3">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-[2px] shrink-0"
                      style={{
                        color: late
                          ? "var(--color-brick-text)"
                          : deadline.completedAt
                            ? "var(--color-leaf-text)"
                            : "var(--color-gold-text)",
                      }}
                    >
                      {isReport ? <IconFlag size={18} /> : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="t-title">{deadline.label}</p>
                      <p
                        className="t-data mt-1"
                        style={{
                          color: late ? "var(--color-brick-text)" : "var(--color-ink-2)",
                          textDecoration: deadline.completedAt ? "line-through" : "none",
                        }}
                      >
                        {deadlineKindLabel(deadline.kind).toUpperCase()} ·{" "}
                        {formatCivilShort(deadline.dueOn).toUpperCase()} ·{" "}
                        {deadline.completedAt
                          ? "DONE"
                          : describeDue(deadline.dueOn, today).toUpperCase()}
                      </p>
                      <p className="t-secondary mt-1" style={{ color: "var(--color-ink-2)" }}>
                        {state.label}
                        {sent.length
                          ? ` · ${sent.length} already sent`
                          : ""}
                      </p>
                      {remaining.length ? (
                        <p className="t-data mt-1" style={{ color: "var(--color-ink-2)" }}>
                          {remaining.length} TO COME ·{" "}
                          {remaining
                            .map((rung) => formatCivilShort(rung.on).toUpperCase())
                            .join(" · ")}
                        </p>
                      ) : null}
                    </div>
                    <form action={toggleDeadlineAction} className="shrink-0">
                      <input type="hidden" name="deadlineId" value={deadline.id} />
                      <input type="hidden" name="grantId" value={grant.id} />
                      <input
                        type="hidden"
                        name="done"
                        value={deadline.completedAt ? "0" : "1"}
                      />
                      <button className="btn-quiet" type="submit">
                        {deadline.completedAt ? "Reopen" : "Done"}
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------ award --- */}
      <section className="pt-8">
        <h2 className="t-label">Award</h2>
        {awarded && grant.awardedAmountCents ? (
          <div className="mt-2">
            <p className="t-data-lg" style={{ color: "var(--color-leaf-text)" }}>
              {formatCents(grant.awardedAmountCents)} awarded
            </p>
            {grant.awardRestrictions ? (
              <p className="t-body mt-2" style={{ color: "var(--color-ink-2)" }}>
                {grant.awardRestrictions}
              </p>
            ) : (
              <p className="t-secondary mt-2" style={{ color: "var(--color-ink-2)" }}>
                No restrictions recorded.
              </p>
            )}
          </div>
        ) : (
          <p className="t-secondary mt-2">
            When the decision arrives, enter the award here and its report dates go
            straight onto the calendar and the ICS feed.
          </p>
        )}
        <div className="mt-4">
          <AwardEntry
            grantId={grant.id}
            today={today}
            defaultAmount={
              grant.awardedAmountCents
                ? String(Math.round(grant.awardedAmountCents / 100))
                : grant.askAmountCents
                  ? String(Math.round(grant.askAmountCents / 100))
                  : ""
            }
            existing={Boolean(grant.awardedAmountCents)}
          />
        </div>
      </section>

      {/* -------------------------------------------------------- workspace --- */}
      <section className="pt-8">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="t-label">Application workspace</h2>
          {workspaceAllowed ? (
            <span className="t-data" style={{ color: "var(--color-ink-2)" }}>
              {checklist.final}/{checklist.total} FINAL
            </span>
          ) : null}
        </div>

        {!workspaceAllowed ? (
          <p className="t-secondary mt-2">
            The application workspace is part of Grow. Your pipeline, calendar,
            reminders and answer library all keep working on {plan(activePlan).name}.{" "}
            <Link href="/settings/billing" className="btn-quiet" style={{ minHeight: 0 }}>
              See plans
            </Link>
          </p>
        ) : (
          <>
            <div className="mt-2">
              {workspace.map((row) => (
                <ChecklistItem
                  key={row.item.id}
                  grantId={grant.id}
                  itemId={row.item.id}
                  requirement={row.item.requirement}
                  status={row.item.status}
                  draftBody={row.item.draftBody}
                  answerSource={row.item.answerSource}
                  snapshotStale={snapshotIsStale(row)}
                  library={library.map((a) => ({
                    id: a.id,
                    kind: a.kind,
                    title: a.title,
                    version: a.version,
                    excerptText: excerpt(a.body, 60),
                  }))}
                />
              ))}
            </div>
            <AddRequirement grantId={grant.id} />
            {checklist.readyToSubmit ? (
              <p className="t-secondary mt-4" style={{ color: "var(--color-leaf-text)" }}>
                Every item is final. Move the stage to Submitted and add the date they
                expect to notify you.
              </p>
            ) : null}
          </>
        )}
      </section>

      {/* --------------------------------------------------------- history --- */}
      <section className="pt-8">
        <h2 className="t-label">History</h2>
        {activity.length === 0 ? (
          <p className="t-secondary mt-2">Nothing recorded yet.</p>
        ) : (
          <div className="mt-2">
            {activity.map((entry) => (
              <div key={entry.id} className="rule-b py-3">
                <p className="t-secondary" style={{ color: "var(--color-ink)" }}>
                  {entry.summary}
                </p>
                <p className="t-data mt-1" style={{ color: "var(--color-ink-2)" }}>
                  {formatCivilLong(entry.createdAt.toISOString().slice(0, 10)).toUpperCase()}{" "}
                  · {entry.actor}
                </p>
              </div>
            ))}
          </div>
        )}
        <p className="t-secondary mt-4" style={{ color: "var(--color-ink-2)" }}>
          This history is the part that stays when the person who wrote the grant leaves.
        </p>
      </section>

      {grant.notes ? (
        <section className="pt-8">
          <h2 className="t-label">Notes</h2>
          <p className="t-body mt-2" style={{ whiteSpace: "pre-wrap" }}>
            {grant.notes}
          </p>
        </section>
      ) : null}

      <HoldToDelete
        action={deleteGrantAction}
        hiddenFields={{ grantId: grant.id }}
        label="Hold to remove this grant"
        confirmLabel="Remove it — history included"
      />
    </div>
  );
}
