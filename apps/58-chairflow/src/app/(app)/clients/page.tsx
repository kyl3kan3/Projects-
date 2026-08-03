import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { CardOnFile, EmptyState, ScreenHeader } from "@/components/ui";
import { requireStylist } from "@/lib/auth";
import { formatDayShort, intervalPhrase, todayInTimezone } from "@/lib/dates";
import { daysOverdue, parseSettings } from "@/lib/cadence";
import { phoneDisplay, pluralize } from "@/lib/format";
import { clientList } from "@/server/clients";

export const metadata: Metadata = { title: "Clients" };

/**
 * The stylist's book. Rows, not boxes (DESIGN.md): 56px minimum, hairline between, the
 * cadence line in mono figures, the card-on-file mark at the end, and a drifted client
 * marked with the cadence glyph.
 *
 * Search is a plain GET form so the result is a URL — which is what makes the back button
 * behave and lets a stylist keep a search open on a second tab while they work.
 */
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { stylist } = await requireStylist();
  const params = await searchParams;
  const search = params.q?.trim() || null;
  const rows = await clientList(stylist.id, search);
  const today = todayInTimezone(stylist.timezone);
  const settings = parseSettings(stylist.settings);

  return (
    <>
      <ScreenHeader
        label={`${rows.length} ${pluralize(rows.length, "client")}`}
        title="Clients"
        action={
          <Link className="btn-quiet" href="/clients/import">
            Import
          </Link>
        }
      />

      <form method="get" style={{ display: "flex", gap: 8, paddingBottom: 16 }}>
        <input
          className="input"
          name="q"
          defaultValue={search ?? ""}
          placeholder="Search by name or number"
          aria-label="Search clients"
        />
        <button className="btn btn-secondary" type="submit" style={{ flex: "none" }}>
          <Icon name="search" size={18} />
          <span className="sr-only">Search</span>
        </button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon="people-book"
          title={search ? `Nobody matching "${search}"` : "Your book starts here"}
          body={
            search
              ? "Try part of a name, or the last four digits of their number."
              : "Every booking through your page adds a client automatically. Bringing a list over from another app? Import it and their cadences come with them."
          }
          action={search ? undefined : { href: "/clients/import", label: "Import a client list" }}
        />
      ) : (
        <div className="stack">
          {rows.map((row, i) => {
            const overdue = row.cadence ? daysOverdue(row.cadence.nextDueOn, today) : null;
            const drifted = overdue !== null && overdue >= settings.nudgeGraceDays;
            return (
              <Link
                key={row.client.id}
                href={`/clients/${row.client.id}`}
                className="row enter"
                style={{ animationDelay: `${Math.min(i, 8) * 24}ms` }}
              >
                <span style={{ minWidth: 0, display: "grid", gap: 2, flex: 1 }}>
                  <span className="t-title">
                    {row.client.firstName} {row.client.lastName ?? ""}
                  </span>
                  <span className="t-secondary">
                    {row.cadence ? (
                      <>
                        <span className="t-mono">{intervalPhrase(row.cadence.medianIntervalDays)}</span>
                        {" · last in "}
                        <span className="t-mono">{formatDayShort(row.cadence.lastVisitOn)}</span>
                        {row.cadence.sampleCount < 2 ? " (estimated)" : ""}
                      </>
                    ) : row.lastVisitOn ? (
                      <>
                        {"last in "}
                        <span className="t-mono">{formatDayShort(row.lastVisitOn)}</span>
                        {" · no rhythm yet"}
                      </>
                    ) : (
                      <>{phoneDisplay(row.client.phone)} · no visits yet</>
                    )}
                  </span>
                  {(drifted || row.client.noShowCount > 0) && (
                    <span
                      className="t-secondary"
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                    >
                      {drifted && (
                        <span
                          style={{
                            color: "var(--color-amber-text)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Icon name="pulse-return" size={18} />
                          {overdue} {pluralize(overdue ?? 0, "day")} past due
                        </span>
                      )}
                      {row.client.noShowCount > 0 && (
                        <span style={{ color: "var(--color-red)" }}>
                          {row.client.noShowCount} no-{row.client.noShowCount === 1 ? "show" : "shows"}
                        </span>
                      )}
                    </span>
                  )}
                </span>
                {row.client.defaultPaymentMethodId && <CardOnFile last4={row.client.cardLast4} />}
                <Icon name="chevron-right" size={18} style={{ color: "var(--color-ink-3)" }} />
              </Link>
            );
          })}
        </div>
      )}

      <div className="thumb-bar">
        <Link className="btn btn-primary" href="/today/new">
          <Icon name="plus" size={18} />
          Add appointment
        </Link>
      </div>
    </>
  );
}
