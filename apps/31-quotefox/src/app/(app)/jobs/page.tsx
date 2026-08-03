import type { Metadata } from "next";
import Link from "next/link";
import { HeroAmount } from "@/components/Money";
import { JobRow } from "@/components/JobRow";
import { StatusPill } from "@/components/StatusPill";
import { IconAlert, IconGear, IconMic } from "@/components/icons";
import { requireOnboardedUser } from "@/lib/auth";
import { durationLabel, plural } from "@/lib/display";
import { emailReady } from "@/lib/email";
import { listJobs, loadDashboard, type JobFilter } from "@/lib/jobs";
import { formatMoneyShort } from "@/lib/money";
import { isReadOnly, orgAsGatable, quoteCapacity, trialDaysLeft } from "@/lib/plans";

export const metadata: Metadata = { title: "Jobs" };
export const dynamic = "force-dynamic";

const FILTERS: Array<{ id: JobFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "drafts", label: "Drafts" },
  { id: "sent", label: "Sent" },
  { id: "won", label: "Won" },
];

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { org } = await requireOnboardedUser();
  const params = await searchParams;
  const filter = (FILTERS.find((f) => f.id === params.filter)?.id ?? "all") as JobFilter;
  const [rows, dashboard] = await Promise.all([listJobs(org.id, filter), loadDashboard(org.id)]);
  const capacity = quoteCapacity(orgAsGatable(org));
  const trialLeft = trialDaysLeft(orgAsGatable(org));
  const readOnly = isReadOnly(orgAsGatable(org));
  const mail = emailReady();

  return (
    <main>
      <header
        className="gutter"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 20,
          paddingBottom: 12,
        }}
      >
        <p className="t-label" style={{ color: "var(--color-hi-vis)" }}>
          {org.name}
        </p>
        <Link
          href="/settings"
          aria-label="Settings"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            color: "var(--color-text-2)",
          }}
        >
          <IconGear size={22} />
        </Link>
      </header>

      <section className="gutter" style={{ paddingBottom: 24 }}>
        <p className="t-label">Quoted this week</p>
        <HeroAmount cents={dashboard.quotedThisWeekCents} />
        <p className="t-secondary" style={{ marginTop: 8 }}>
          Avg. time to send{" "}
          <span className="t-data" style={{ fontSize: 14, color: "var(--color-text)" }}>
            {durationLabel(dashboard.medianTimeToSendMinutes)}
          </span>
          {dashboard.quotedThisWeekCount > 0
            ? ` · ${plural(dashboard.quotedThisWeekCount, "proposal")} out`
            : " · nothing out yet this week"}
        </p>
        {dashboard.wonThisMonthCents > 0 || dashboard.awaitingCount > 0 ? (
          <p className="t-secondary" style={{ marginTop: 4, color: "var(--color-text-3)" }}>
            {dashboard.awaitingCount > 0
              ? `${plural(dashboard.awaitingCount, "proposal")} awaiting an answer`
              : "Nothing awaiting an answer"}
            {dashboard.wonThisMonthCents > 0
              ? ` · ${formatMoneyShort(dashboard.wonThisMonthCents)} won this month`
              : ""}
          </p>
        ) : null}
      </section>

      {readOnly ? (
        <section className="gutter" style={{ paddingBottom: 20 }}>
          <div className="panel" style={{ padding: 16, display: "flex", gap: 12 }}>
            <IconAlert size={20} style={{ color: "var(--color-red)", flex: "none" }} />
            <div>
              <p className="t-title">Your trial has ended</p>
              <p className="t-secondary" style={{ marginTop: 4 }}>
                Everything you have already sent stays live and deposits still land. Pick a plan to
                draft new quotes.
              </p>
              <Link href="/settings/billing" className="btn-quiet" style={{ paddingLeft: 0 }}>
                See plans
              </Link>
            </div>
          </div>
        </section>
      ) : capacity.atLimit ? (
        <section className="gutter" style={{ paddingBottom: 20 }}>
          <div className="panel" style={{ padding: 16 }}>
            <p className="t-title">You are out of AI quotes this period</p>
            <p className="t-secondary" style={{ marginTop: 4 }}>
              {capacity.used} of {capacity.limit} used. Capture still works — drafting is what waits.
            </p>
            <Link href="/settings/billing" className="btn-quiet" style={{ paddingLeft: 0 }}>
              See plans
            </Link>
          </div>
        </section>
      ) : null}

      <nav
        className="scroll-x gutter"
        style={{ display: "flex", gap: 8, paddingBottom: 20 }}
        aria-label="Filter jobs"
      >
        {FILTERS.map((option) => (
          <Link
            key={option.id}
            href={option.id === "all" ? "/jobs" : `/jobs?filter=${option.id}`}
            className="chip"
            data-active={filter === option.id}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      <section className="gutter">
        <p className="t-label" style={{ paddingBottom: 4 }}>
          Jobs
        </p>
        {rows.length ? (
          <div>
            {rows.map((row, index) => (
              <JobRow key={row.job.id} row={row} index={index} />
            ))}
          </div>
        ) : (
          <div style={{ paddingTop: 12, paddingBottom: 24 }}>
            <p className="t-title">
              {filter === "all" ? "No jobs yet" : `Nothing in ${filter}`}
            </p>
            <p className="t-secondary" style={{ marginTop: 6, maxWidth: "40ch" }}>
              {filter === "all"
                ? "Start a walkthrough at the next job. Narrate what you see, snap the photos you'd have taken anyway, and the estimate drafts itself against your price book."
                : "Nothing here yet. Try All."}
            </p>
          </div>
        )}
      </section>

      <section className="gutter" style={{ paddingTop: 24 }}>
        <p className="t-data" style={{ color: "var(--color-text-3)" }}>
          {capacity.unlimitedish
            ? "Unlimited AI quotes (fair use)"
            : `${capacity.used}/${capacity.limit} AI quotes this period`}
          {trialLeft !== null ? ` · ${plural(trialLeft, "day")} left on the trial` : ""}
        </p>
        {!mail.ready ? (
          <p className="t-secondary" style={{ marginTop: 6, color: "var(--color-amber)" }}>
            Email is not sending yet — {mail.reason}. Proposal links still work; you can copy one and
            text it.
          </p>
        ) : null}
      </section>

      <div className="thumb-bar">
        <Link href="/jobs/new" className="btn btn-primary btn-full">
          <IconMic size={18} />
          New walkthrough
        </Link>
      </div>
    </main>
  );
}
