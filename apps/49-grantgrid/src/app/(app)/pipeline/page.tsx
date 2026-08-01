import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ScreenHeader } from "@/components/ScreenHeader";
import { IconChevronRight, IconFlag } from "@/components/icons";
import { describeDue, formatCivilShort } from "@/lib/dates";
import { formatCents, formatCentsCompact } from "@/lib/money";
import { deadlineKindLabel } from "@/lib/ics";
import { grantCount, listPipeline, orgToday, summarize, type PipelineRow } from "@/lib/grants";
import { STAGES, stageLabel } from "@/lib/stages";
import { checkGrantCap, isUnlimited, plan } from "@/lib/plans";
import { effectivePlan, entitlement } from "@/lib/billing";
import { AddGrantSheet } from "./AddGrantSheet";
import type { GrantStage } from "@/db/schema";

export const metadata: Metadata = { title: "Pipeline" };
export const dynamic = "force-dynamic";

/** Three example rows for the empty state — labelled, never mistakable for data. */
const EXAMPLES = [
  { funder: "A community foundation in your county", meta: "LOI · $10,000 ask" },
  { funder: "A corporate giving program near a store", meta: "Rolling · $2,500 ask" },
  { funder: "The funder who gave you $7,500 last year", meta: "Renewal · report due first" },
];

function DeadlineMeta({ row }: { row: PipelineRow }) {
  const next = row.next;
  if (!next) {
    return (
      <span className="t-data" style={{ color: "var(--color-ink-2)" }}>
        NO DATE
      </span>
    );
  }
  const overdue = next.overdue;
  const isReport = next.kind === "report" || next.kind === "renewal";
  return (
    <span
      className="t-data inline-flex items-center gap-1"
      style={{ color: overdue ? "var(--color-brick-text)" : "var(--color-ink-2)" }}
    >
      {isReport ? <IconFlag size={14} /> : null}
      {deadlineKindLabel(next.kind).toUpperCase()} {formatCivilShort(next.dueOn)}
    </span>
  );
}

function Row({ row }: { row: PipelineRow }) {
  const awarded = row.grant.stage === "awarded" || row.grant.stage === "reporting";
  const amountCents = awarded ? row.grant.awardedAmountCents : row.grant.askAmountCents;

  return (
    <Link href={`/pipeline/${row.grant.id}`} className="row">
      <span className="min-w-0 flex-1">
        <span className="t-title block truncate">{row.grant.funderName}</span>
        <span className="t-secondary block truncate">
          {row.grant.title}
          {row.ownerName ? ` · ${row.ownerName}` : ""}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="t-data inline-flex items-center gap-1">
          {awarded && amountCents ? (
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                background: "var(--color-leaf-text)",
                display: "inline-block",
              }}
            />
          ) : null}
          {formatCents(amountCents)}
        </span>
        <DeadlineMeta row={row} />
      </span>
      <IconChevronRight size={18} style={{ color: "var(--color-ink-2)" }} />
    </Link>
  );
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { org, user } = await requireUser();
  const params = await searchParams;
  const today = orgToday(org);
  const rows = await listPipeline(org.id, today);
  const totals = summarize(rows);

  const ent = entitlement(org);
  const activePlan = effectivePlan(org);
  const count = await grantCount(org.id);
  const cap = checkGrantCap(activePlan, count);

  const stageFilter = STAGES.some((s) => s.id === params.stage)
    ? (params.stage as GrantStage)
    : null;
  const visible = stageFilter ? rows.filter((r) => r.grant.stage === stageFilter) : rows;

  const grouped = STAGES.map((stage) => ({
    stage,
    rows: visible.filter((r) => r.grant.stage === stage.id),
  })).filter((g) => g.rows.length > 0);

  const summary = rows.length
    ? [
        `${totals.activeCount} ACTIVE`,
        `${formatCentsCompact(totals.pendingCents)} PENDING`,
        totals.awardedCents ? `${formatCentsCompact(totals.awardedCents)} AWARDED` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  return (
    <div className="screen">
      <ScreenHeader title={org.name} summary={summary} />

      {/* Next deadline, pinned under the header as a hairline row. */}
      {totals.next ? (
        <Link href={`/pipeline/${totals.next.row.grant.id}`} className="row rule-b">
          <span
            className="inline-flex shrink-0 items-center"
            style={{
              color: totals.next.deadline.overdue
                ? "var(--color-brick-text)"
                : "var(--color-gold-text)",
            }}
          >
            <IconFlag size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="t-label">Next</span>
            <span className="t-title block truncate">
              {deadlineKindLabel(totals.next.deadline.kind)} to{" "}
              {totals.next.row.grant.funderName}
            </span>
          </span>
          <span
            className="t-data shrink-0 text-right"
            style={{
              color: totals.next.deadline.overdue
                ? "var(--color-brick-text)"
                : "var(--color-ink-2)",
            }}
          >
            {describeDue(totals.next.deadline.dueOn, today).toUpperCase()}
          </span>
        </Link>
      ) : null}

      {ent.state === "trialing" && ent.trialDaysLeft !== null ? (
        <p className="t-secondary rule-b py-3" style={{ color: "var(--color-ink-2)" }}>
          Trial: {ent.trialDaysLeft} {ent.trialDaysLeft === 1 ? "day" : "days"} left on{" "}
          {plan(activePlan).name}.{" "}
          <Link href="/settings/billing" className="btn-quiet" style={{ minHeight: 0 }}>
            Choose a plan
          </Link>
        </p>
      ) : null}

      {ent.state === "trial_expired" ? (
        <p className="t-secondary rule-b py-3">
          Your trial has ended, so GrantGrid is on <strong>Seed</strong>. Everything in
          your pipeline and calendar is untouched and reminders keep sending.{" "}
          <Link href="/settings/billing" className="btn-quiet" style={{ minHeight: 0 }}>
            See plans
          </Link>
        </p>
      ) : null}

      {!cap.allowed ? (
        <p className="t-secondary rule-b py-3" style={{ color: "var(--color-brick-text)" }}>
          {cap.message}
        </p>
      ) : null}

      {/* Stage filter chips */}
      {rows.length > 0 ? (
        <div className="-mx-5 overflow-x-auto px-5 py-4">
          <div className="flex gap-2">
            <Link href="/pipeline" className="chip" data-active={!stageFilter}>
              All {rows.length}
            </Link>
            {STAGES.filter((s) => rows.some((r) => r.grant.stage === s.id)).map((s) => (
              <Link
                key={s.id}
                href={`/pipeline?stage=${s.id}`}
                className="chip"
                data-active={stageFilter === s.id}
              >
                {s.label} {rows.filter((r) => r.grant.stage === s.id).length}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <section className="pt-8">
          <h2 className="t-h2">Nothing in the pipeline yet.</h2>
          <p className="t-body mt-3" style={{ color: "var(--color-ink-2)" }}>
            Start with the grants you already know about — including the ones you were
            awarded, because their report dates are the cheapest money in fundraising and
            the easiest to miss. Then{" "}
            <Link href="/settings/profile" className="btn-quiet" style={{ minHeight: 0 }}>
              fill in your profile
            </Link>{" "}
            so discovery can score funders against what you actually do.
          </p>

          <p className="t-label mt-8">Three that usually belong here</p>
          <div className="mt-2">
            {EXAMPLES.map((example) => (
              <div key={example.funder} className="row" style={{ cursor: "default" }}>
                <span className="min-w-0 flex-1">
                  <span className="t-title block" style={{ color: "var(--color-ink-2)" }}>
                    {example.funder}
                  </span>
                  <span className="t-secondary block">{example.meta}</span>
                </span>
                <span className="t-label">Example</span>
              </div>
            ))}
          </div>
          <p className="t-secondary mt-4" style={{ color: "var(--color-ink-2)" }}>
            Those three are prompts, not records — nothing is in your pipeline until you
            add it.
          </p>
        </section>
      ) : (
        <div
          /* Columns-by-stage from tablet up (DESIGN.md responsive rules), but
             auto-fit rather than a fixed count: one stage group should take the
             full width instead of being squeezed into a third of it and
             truncating every funder name. */
          className="md:grid md:gap-8"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}
        >
          {grouped.map((group) => (
            <section key={group.stage.id} className="pt-6 md:pt-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="t-label">{group.stage.label}</h2>
                <span className="t-data" style={{ color: "var(--color-ink-2)" }}>
                  {group.rows.length}
                </span>
              </div>
              <div className="mt-2">
                {group.rows.map((row) => (
                  <Row key={row.grant.id} row={row} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {stageFilter && visible.length === 0 ? (
        <p className="t-secondary pt-6">
          Nothing at {stageLabel(stageFilter)} right now. {" "}
          <Link href="/pipeline" className="btn-quiet" style={{ minHeight: 0 }}>
            Show everything
          </Link>
        </p>
      ) : null}

      {totals.overdueCount > 0 ? (
        <p className="t-secondary rule-t mt-6 pt-4" style={{ color: "var(--color-brick-text)" }}>
          {totals.overdueCount} {totals.overdueCount === 1 ? "date has" : "dates have"}{" "}
          passed without being marked done. Each one got a single overdue notice — GrantGrid
          will not keep mailing you about it.
        </p>
      ) : null}

      <p className="t-secondary rule-t mt-6 pt-4" style={{ color: "var(--color-ink-2)" }}>
        Dates are shown in {org.timezone}. Signed in as {user.email}.
        {isUnlimited(cap.cap)
          ? ""
          : ` ${count} of ${cap.cap} tracked grants used on ${plan(activePlan).name}.`}
      </p>

      <AddGrantSheet
        capMessage={cap.allowed ? null : cap.message}
        discoveryAvailable={plan(activePlan).discovery}
      />
    </div>
  );
}
