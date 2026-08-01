import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatIso, today } from "@/lib/dates";
import { associationBalances } from "@/lib/invoicing";
import { roster } from "@/lib/roster";
import { agingBucket } from "@/lib/dues";
import { formatMoney } from "@/lib/money";
import { can, unitUsage } from "@/lib/plans";
import { AgingDot, Money, Notice } from "@/components/ledger";
import { IconChevronRight, IconDownload, IconPeople } from "@/components/icons";
import { OverflowLinks } from "@/components/TabBar";
import { AddHouseholdSheet } from "./RosterForms";

export const metadata: Metadata = { title: "Roster" };
export const dynamic = "force-dynamic";

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; show?: string }>;
}) {
  const { user, association } = await requireUser();
  const params = await searchParams;
  const includeClosed = params.show === "all";
  const query = (params.q ?? "").trim().toLowerCase();

  const entries = await roster(association.id, { includeClosed });
  const balances = await associationBalances(association.id);
  const canEdit = can(user.role, "roster");
  const asOf = today();

  const filtered = query
    ? entries.filter(
        (e) =>
          e.household.unitLabel.toLowerCase().includes(query) ||
          e.members.some((m) => m.name.toLowerCase().includes(query)),
      )
    : entries;

  const active = entries.filter((e) => !e.household.leftOn).length;
  const usage = unitUsage(association.plan, active);
  const withoutEmail = entries.filter((e) => e.members.every((m) => !m.email)).length;

  return (
    <main className="screen">
      <header className="flex items-start justify-between gap-4 pt-8">
        <div>
          <p className="t-label">Roster</p>
          <h1 className="t-h2 mt-1">
            {active} household{active === 1 ? "" : "s"}
          </h1>
          <p className="t-secondary mt-1">
            {entries.reduce((n, e) => n + e.members.length, 0)} people on file ·{" "}
            {usage.used} of {usage.included} units on {association.plan}
          </p>
        </div>
        <OverflowLinks />
      </header>

      {usage.over > 0 ? (
        <section className="mt-6">
          <Notice tone="warn">
            {usage.used} units on a plan that includes {usage.included}. Every one of them is still
            billed and every record is intact. <Link href="/settings/billing">See plans</Link>.
          </Notice>
        </section>
      ) : null}

      {withoutEmail > 0 ? (
        <section className="mt-6">
          <Notice>
            {withoutEmail} household{withoutEmail === 1 ? " has" : "s have"} nobody with an email
            address, so {withoutEmail === 1 ? "it" : "they"} can only be reached by post. Adding one
            address is the single highest-value thing on this screen.
          </Notice>
        </section>
      ) : null}

      <form className="mt-6 flex gap-3" action="/roster">
        <input
          className="input"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search by unit or name"
          aria-label="Search the roster"
        />
        {includeClosed ? <input type="hidden" name="show" value="all" /> : null}
        <button className="btn btn-secondary" type="submit">
          Search
        </button>
      </form>

      <div className="chip-row mt-4">
        <Link href="/roster" className="chip" data-active={!includeClosed}>
          Active
        </Link>
        <Link href="/roster?show=all" className="chip" data-active={includeClosed}>
          Including past owners
        </Link>
        <Link href="/roster/import" className="chip">
          Import CSV
        </Link>
        <a href="/roster/export" className="chip">
          <IconDownload size={16} />
          Export
        </a>
      </div>

      <section className="mt-4">
        {filtered.length === 0 ? (
          <div className="panel mt-4 p-5">
            <div className="flex items-center gap-2">
              <IconPeople size={20} className="ink-3" />
              <p className="t-title">
                {entries.length === 0 ? "The roster is empty." : "Nothing matches that search."}
              </p>
            </div>
            <p className="t-secondary mt-2">
              {entries.length === 0 ? (
                <>
                  Import the spreadsheet you already keep — a column for the unit is the only thing
                  DuesDesk insists on. <Link href="/roster/import">Import a CSV</Link>.
                </>
              ) : (
                "Try a unit number, a street name, or an owner's surname."
              )}
            </p>
          </div>
        ) : (
          <div className="stagger">
            {filtered.map(({ household, members }) => {
              const balance = balances.get(household.id);
              const primary = members.find((m) => m.isPrimary) ?? members[0] ?? null;
              const others = members.length - (primary ? 1 : 0);
              const bucket = balance?.oldestDueOn ? agingBucket(balance.oldestDueOn, asOf) : "current";
              return (
                <Link key={household.id} href={`/roster/${household.id}`} className="row">
                  <AgingDot bucket={bucket} hasBalance={(balance?.balanceCents ?? 0) > 0} />
                  <span className="min-w-0 flex-1">
                    <span className="t-title block truncate">
                      {household.unitLabel}
                      {household.leftOn ? (
                        <span className="t-label ml-2">
                          left {formatIso(household.leftOn)}
                        </span>
                      ) : null}
                    </span>
                    <span className="t-secondary block truncate">
                      {primary?.name ?? "No contact on file"}
                      {others > 0 ? ` +${others}` : ""}
                      {primary?.email ? "" : " · no email"}
                    </span>
                  </span>
                  <span className="flex flex-none items-center gap-2">
                    {(balance?.balanceCents ?? 0) > 0 ? (
                      <Money cents={balance!.balanceCents} />
                    ) : (
                      <span className="t-data ink-3">{formatMoney(0)}</span>
                    )}
                    <IconChevronRight size={18} className="ink-3" />
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {canEdit ? <AddHouseholdSheet todayIso={asOf} /> : null}
      {!canEdit ? (
        <section className="mt-8">
          <Notice>
            Your role is {user.role}, so the roster is read-only for you. The secretary, treasurer,
            and president can change it.
          </Notice>
        </section>
      ) : null}
    </main>
  );
}
