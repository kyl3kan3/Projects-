import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Money, ScreenTitle, SectionHead, StatePill } from "@/components/ui";
import { IconChevronRight, IconDownload } from "@/components/icons";
import { requireUser, can } from "@/lib/auth";
import { divisionAvailability, getCurrentSeason, listRegistrations } from "@/lib/registration";
import type { PaymentState } from "@/lib/ledger";
import { formatIsoShort } from "@/lib/time";

export const metadata: Metadata = { title: "Registrations" };

const FILTERS: { value: PaymentState | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Part paid" },
  { value: "plan", label: "On plan" },
  { value: "paid", label: "Paid" },
  { value: "waitlisted", label: "Waitlist" },
  { value: "canceled", label: "Canceled" },
];

export default async function RegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; division?: string }>;
}) {
  const { club, user } = await requireUser();
  const season = await getCurrentSeason(club.id);
  const params = await searchParams;

  if (!season) {
    return (
      <main className="screen">
        <ScreenTitle eyebrow="Registrations" title="No season yet" />
        <EmptyState
          title="Nothing to show"
          body="Once a season is open and a parent registers, every registration and its payment state lands here."
          action={
            <Link href="/season" className="btn btn-secondary">
              Open a season
            </Link>
          }
        />
      </main>
    );
  }

  if (!can(user.role, "manage_money") && !can(user.role, "manage_rosters")) {
    return (
      <main className="screen">
        <ScreenTitle eyebrow="Registrations" title={season.name} />
        <EmptyState
          title="Coaches do not see registrations"
          body="Fees, contact details and medical notes stay with the registrar and the treasurer. Your team roster is on the Rosters screen."
        />
      </main>
    );
  }

  const state = (params.state ?? "all") as PaymentState | "all";
  const divisions = await divisionAvailability(season.id);
  const rows = await listRegistrations(season.id, {
    divisionId: params.division,
    state,
  });

  const query = (next: Record<string, string | undefined>) => {
    const usp = new URLSearchParams();
    const merged = { state: params.state, division: params.division, ...next };
    for (const [k, v] of Object.entries(merged)) if (v && v !== "all") usp.set(k, v);
    const s = usp.toString();
    return s ? `/registrations?${s}` : "/registrations";
  };

  return (
    <main className="screen">
      <ScreenTitle
        eyebrow={`${club.name} · ${season.name}`}
        title={`${rows.length} registration${rows.length === 1 ? "" : "s"}`}
        action={
          <a
            href={`/registrations/export?season=${season.id}`}
            className="btn btn-secondary btn-small"
          >
            <IconDownload size={16} />
            CSV
          </a>
        }
      />

      <div className="chip-row">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={query({ state: f.value })}
            className="chip"
            data-active={state === f.value}
          >
            {f.label}
          </Link>
        ))}
      </div>
      <div className="chip-row mt-2">
        <Link href={query({ division: undefined })} className="chip" data-active={!params.division}>
          Every division
        </Link>
        {divisions.map((d) => (
          <Link
            key={d.id}
            href={query({ division: d.id })}
            className="chip"
            data-active={params.division === d.id}
          >
            {d.name}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing matches that filter"
          body="Try 'All', or check that registration is open — the link is on the season screen."
        />
      ) : (
        <>
          <SectionHead>
            {state === "all" ? "Everyone" : FILTERS.find((f) => f.value === state)?.label}
          </SectionHead>
          <div className="stagger">
            {rows.map((row) => (
              <Link key={row.id} href={`/registrations/${row.id}`} className="row">
                <span className="min-w-0 flex-1">
                  <span className="t-title block truncate">
                    {row.playerFirstName} {row.playerLastName}
                  </span>
                  <span className="t-secondary block truncate" style={{ color: "var(--fg-3)" }}>
                    {row.divisionName} · {row.contactName}
                    {row.waitlistPosition ? ` · queue #${row.waitlistPosition}` : ""}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <StatePill state={row.state} />
                  <span className="t-data" style={{ color: "var(--fg-2)" }}>
                    {row.balanceCents > 0 ? (
                      <Money cents={row.balanceCents} />
                    ) : (
                      formatIsoShort(row.createdAt.toISOString().slice(0, 10))
                    )}
                  </span>
                </span>
                <IconChevronRight size={18} style={{ color: "var(--fg-3)" }} />
              </Link>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
