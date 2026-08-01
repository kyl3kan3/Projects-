import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { dashboardData, recentlySettled } from "@/lib/dashboard";
import { describeAudit } from "@/lib/audit";
import { formatIso, today } from "@/lib/dates";
import { AGING_LABELS, type AgingBucket } from "@/lib/dues";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/plans";
import { OverflowLinks } from "@/components/TabBar";
import {
  CollectedTrack,
  HeroAmount,
  HouseholdRow,
  Notice,
  PaidSeal,
} from "@/components/ledger";
import { IconChevronRight, IconPeople, IconReceipt, IconSealCheck } from "@/components/icons";
import { RemindersButton, ThumbActions } from "./DuesActions";

export const metadata: Metadata = { title: "Dues" };
// The board opens this to see the truth right now, not a cached truth.
export const dynamic = "force-dynamic";

const CHIPS: { key: AgingBucket | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "30", label: "30" },
  { key: "60", label: "60" },
  { key: "90", label: "90+" },
];

export default async function DuesPage({
  searchParams,
}: {
  searchParams: Promise<{ bucket?: string }>;
}) {
  const { user, association } = await requireUser();
  const params = await searchParams;
  const asOf = today();
  const data = await dashboardData(association.id, association.plan, asOf);
  const settled = await recentlySettled(association.id, 3);
  const canMove = can(user.role, "money");

  const activeBucket = (CHIPS.find((c) => c.key === params.bucket)?.key ?? "all") as
    | AgingBucket
    | "all";

  const outstanding = data.aging.rows.filter((r) => r.balanceCents > 0);
  const shown =
    activeBucket === "all" ? outstanding : outstanding.filter((r) => r.bucket === activeBucket);

  // First run: the three cards, replaced by real data as each completes.
  if (!data.hasRoster || !data.hasSchedule) {
    return <FirstRun hasRoster={data.hasRoster} hasSchedule={data.hasSchedule} connected={association.stripeAccountReady} />;
  }

  return (
    <main className="screen">
      <header className="flex items-start justify-between gap-4 pt-8">
        <div className="min-w-0">
          <p className="t-label">{data.progress.label} dues</p>
          <div className="mt-2">
            <HeroAmount cents={data.progress.collectedCents} />
          </div>
          <p className="t-secondary mt-1">
            collected of {formatMoney(data.progress.expectedCents)} expected
          </p>
        </div>
        <OverflowLinks />
      </header>

      <div className="mt-4">
        <CollectedTrack
          collectedCents={data.progress.collectedCents}
          processingCents={data.progress.processingCents}
          expectedCents={data.progress.expectedCents}
        />
        <p className="t-secondary mt-3">
          <span className="roll t-data" style={{ color: "var(--color-ink)" }}>
            {data.checksToChase}
          </span>{" "}
          household{data.checksToChase === 1 ? "" : "s"} to chase ·{" "}
          {formatMoney(data.aging.totalOutstandingCents)} outstanding
          {data.progress.processingCents > 0
            ? ` · ${formatMoney(data.progress.processingCents)} clearing by ACH`
            : ""}
        </p>
      </div>

      {settled.length > 0 ? (
        <section className="mt-6 flex flex-wrap items-center gap-3">
          {settled.map((row) => (
            <span key={row.invoice.id} className="flex items-center gap-2">
              <PaidSeal stamp />
              <span className="t-data ink-2">
                {row.unitLabel} · {row.invoice.periodLabel}
              </span>
            </span>
          ))}
        </section>
      ) : null}

      {data.usage.over > 0 ? (
        <section className="mt-6">
          <Notice tone="warn">
            You are billing {data.usage.used} units on a plan that includes {data.usage.included}.
            Nothing is blocked and no invoice is withheld — but the plan should catch up with the
            association. <Link href="/settings/billing">See plans</Link>.
          </Notice>
        </section>
      ) : null}

      <section className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="t-h2">Outstanding</h2>
          {canMove ? <RemindersButton /> : null}
        </div>

        <div className="chip-row mt-4">
          {CHIPS.map((chip) => {
            const bucket = data.aging.buckets[chip.key as AgingBucket];
            const count = chip.key === "all" ? outstanding.length : (bucket?.count ?? 0);
            return (
              <Link
                key={chip.key}
                href={chip.key === "all" ? "/dues" : `/dues?bucket=${chip.key}`}
                className="chip"
                data-active={activeBucket === chip.key}
                aria-label={
                  chip.key === "all"
                    ? `All outstanding households (${count})`
                    : `${AGING_LABELS[chip.key as AgingBucket]} (${count})`
                }
              >
                {chip.label}
                <span className="t-data">{count}</span>
              </Link>
            );
          })}
        </div>

        {shown.length === 0 ? (
          <div className="panel mt-6 p-5">
            <div className="flex items-center gap-2">
              <IconSealCheck size={20} className="green" />
              <p className="t-title">
                {outstanding.length === 0
                  ? "Nothing outstanding. The whole street is square."
                  : `Nothing in the ${AGING_LABELS[activeBucket as AgingBucket].toLowerCase()} bucket.`}
              </p>
            </div>
            <p className="t-secondary mt-2">
              {outstanding.length === 0
                ? `${data.autopay.enrolled} of ${data.autopay.households} households are on autopay, so this is where the quarter should stay.`
                : "Try another bucket, or clear the filter to see everyone with a balance."}
            </p>
          </div>
        ) : (
          <div className="stagger mt-2">
            {shown.map((row) => (
              <HouseholdRow
                key={row.household.id}
                href={`/dues/${row.household.id}`}
                unitLabel={row.household.unitLabel}
                personLine={row.primary?.name ?? "No contact on file"}
                statusLine={statusLine(row)}
                amountCents={row.balanceCents}
                bucket={row.bucket}
                hasBalance
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10 split">
        <div>
          <h2 className="t-h2">This period</h2>
          <div className="panel mt-4 p-4">
            <p className="t-label">{data.progress.label}</p>
            <div className="mt-3">
              <Detail label="Invoices" value={`${data.progress.invoiceCount}`} />
              <Detail label="Settled" value={`${data.progress.paidCount}`} />
              <Detail label="Expected" value={formatMoney(data.progress.expectedCents)} />
              <Detail label="Collected" value={formatMoney(data.progress.collectedCents)} />
              {data.progress.processingCents > 0 ? (
                <Detail label="Clearing" value={formatMoney(data.progress.processingCents)} />
              ) : null}
            </div>
            <div className="hairline-t mt-3 pt-3">
              <Link href="/dues/schedules" className="btn-quiet">
                Assessment schedules
              </Link>
            </div>
          </div>

          <div className="panel mt-4 p-4">
            <p className="t-label">Autopay</p>
            <p className="t-body mt-2">
              {data.autopay.enrolled} of {data.autopay.households} households enrolled
              {data.autopay.ach > 0 ? ` · ${data.autopay.ach} by bank transfer` : ""}
            </p>
            <p className="t-secondary mt-1">
              {data.autopay.failed > 0
                ? `${data.autopay.failed} enrollment${data.autopay.failed === 1 ? "" : "s"} failed and fell back to the reminder ladder.`
                : "Every enrolled household is charged on the due date, once."}
            </p>
          </div>
        </div>

        <div>
          <h2 className="t-h2">Recent activity</h2>
          <div className="mt-2">
            {data.activity.length === 0 ? (
              <p className="t-secondary py-3">Nothing has happened yet this period.</p>
            ) : (
              data.activity.map((row) => (
                <div key={row.id} className="hairline-b py-3">
                  <p className="t-secondary" style={{ color: "var(--color-ink)" }}>
                    {describeAudit(row)}
                  </p>
                  <p className="t-data ink-3 mt-1">{formatIso(row.createdAt.toISOString().slice(0, 10))}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {canMove ? <ThumbActions households={outstanding.map((r) => ({ id: r.household.id, unitLabel: r.household.unitLabel }))} /> : null}
    </main>
  );
}

function statusLine(row: {
  daysLate: number;
  autopay: { method: "card" | "ach"; status: string } | null;
  pendingCents: number;
  openInvoices: number;
}): string {
  const parts: string[] = [];
  if (row.daysLate > 0) parts.push(`overdue ${row.daysLate} day${row.daysLate === 1 ? "" : "s"}`);
  else if (row.openInvoices > 0) parts.push("due");
  if (row.pendingCents > 0) parts.push(`${formatMoney(row.pendingCents)} clearing`);
  if (row.autopay?.status === "active") {
    parts.push(`autopay · ${row.autopay.method === "ach" ? "ACH" : "card"}`);
  } else if (row.autopay?.status === "failed") {
    parts.push("autopay failed");
  } else if (row.autopay?.status === "paused") {
    parts.push("autopay paused");
  }
  return parts.join(" · ");
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="t-secondary">{label}</span>
      <span className="t-data">{value}</span>
    </div>
  );
}

/**
 * First run: three cards, in the order a treasurer actually does them. Each is
 * replaced by real data as it completes (DESIGN.md "First run"). The copy is the
 * real thing, not placeholder text — a board reading this should know exactly
 * what happens next.
 */
function FirstRun({
  hasRoster,
  hasSchedule,
  connected,
}: {
  hasRoster: boolean;
  hasSchedule: boolean;
  connected: boolean;
}) {
  return (
    <main className="screen">
      <header className="pt-8">
        <p className="t-label">Set up</p>
        <h1 className="t-h2 mt-2">Three things, and the quarter runs itself.</h1>
        <p className="t-secondary mt-2">
          Most treasurers finish this in an evening. Nothing is sent to a member until you say so.
        </p>
      </header>

      <div className="mt-8 flex flex-col gap-4">
        <SetupCard
          done={hasRoster}
          step="1"
          title="Import the roster"
          body="A CSV from your spreadsheet: unit, owner, email, phone. DuesDesk shows you exactly what it read before anything is saved."
          href="/roster/import"
          cta={hasRoster ? "Roster imported" : "Import a CSV"}
          Icon={IconPeople}
        />
        <SetupCard
          done={connected}
          step="2"
          title="Connect Stripe"
          body="Dues land in the association's own Stripe account — never ours. Bank transfer costs about 80 cents a payment; a card costs about 2.9%."
          href="/settings/payments"
          cta={connected ? "Stripe connected" : "Connect the association's account"}
          Icon={IconReceipt}
        />
        <SetupCard
          done={hasSchedule}
          step="3"
          title="Create the first assessment"
          body="Cadence, per-household amount, due day, grace period. You get a plain preview — “63 invoices totalling $11,340 will be created for Apr 1” — before a single invoice exists."
          href="/dues/schedules"
          cta={hasSchedule ? "Schedule created" : "Set up dues"}
          Icon={IconReceipt}
        />
      </div>

      <p className="t-secondary mt-8">
        Everything sends in dry-run mode until <span className="t-data">DRY_RUN=0</span> is set, so
        you can rehearse a whole cycle against your real roster without a single email leaving the
        building.
      </p>
    </main>
  );
}

function SetupCard({
  done,
  step,
  title,
  body,
  href,
  cta,
  Icon,
}: {
  done: boolean;
  step: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  Icon: (props: { size?: number; className?: string }) => React.ReactElement;
}) {
  return (
    <section className="panel p-5">
      <div className="flex items-center gap-3">
        {done ? <IconSealCheck size={20} className="green" /> : <Icon size={20} className="ink-3" />}
        <p className="t-label">Step {step}</p>
      </div>
      <h2 className="t-title mt-3">{title}</h2>
      <p className="t-secondary mt-2">{body}</p>
      <Link href={href} className="mt-4 inline-flex items-center gap-1 btn-quiet">
        {cta}
        <IconChevronRight size={18} />
      </Link>
    </section>
  );
}

