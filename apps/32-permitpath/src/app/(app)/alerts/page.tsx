import type { Metadata } from "next";
import Link from "next/link";
import { IconAlertTriangle, IconBell, IconChevronRight } from "@/components/icons";
import { requireUser } from "@/lib/auth";
import { alertFeed } from "@/lib/alerts";
import { groupByDay } from "@/lib/format";
import { hasRuleChangeAlerts } from "@/lib/plans";
import { countWatches } from "@/lib/jurisdictions";

export const metadata: Metadata = { title: "Alerts" };

/**
 * Everything the org has been told, grouped by day: rule changes on watched
 * jurisdictions and the expiry ladder's notices. Rule changes appear here for
 * every plan — the tier gate is on the email, not on knowing.
 */
export default async function AlertsPage() {
  const { org } = await requireUser();
  const [feed, watchCount] = await Promise.all([alertFeed(org.id), countWatches(org.id)]);
  const days = groupByDay(feed, (entry) => entry.at);

  return (
    <main className="screen pt-6">
      <h1 className="t-h2">Alerts</h1>
      <p className="t-secondary mt-2">
        {watchCount === 0
          ? "You are not watching any jurisdictions yet, so there is nothing to warn you about."
          : `Watching ${watchCount} ${watchCount === 1 ? "jurisdiction" : "jurisdictions"} for rule changes, plus every licence and issued permit on your books.`}
      </p>

      {!hasRuleChangeAlerts(org.plan) && (
        <div className="card mt-5">
          <p className="t-label">Email on rule changes</p>
          <p className="t-body mt-2">
            Rule changes show up on this screen on every plan. Emailing them the moment a curator
            approves one starts at Company.
          </p>
          <Link href="/settings/billing" className="btn-quiet mt-2">
            Compare plans
          </Link>
        </div>
      )}

      {feed.length === 0 ? (
        <section className="mt-6">
          <p className="t-body">
            Nothing yet. That is the intended steady state — the value of this screen is the morning
            it is not empty.
          </p>
          <Link href="/jurisdictions" className="btn-quiet mt-3">
            <IconBell size={16} />
            Watch a jurisdiction
          </Link>
        </section>
      ) : (
        days.map((day) => (
          <section key={day.day} className="mt-6">
            <h2 className="t-label">{day.label}</h2>
            <ul className="mt-1">
              {day.rows.map((entry, index) => (
                <li key={entry.id}>
                  <Link
                    href={entry.href}
                    className="row row-tap row-in"
                    style={{ animationDelay: `${Math.min(index, 8) * 24}ms`, color: "inherit" }}
                  >
                    {entry.kind === "rule_change" ? (
                      <IconAlertTriangle size={18} style={{ color: "var(--color-ochre)" }} />
                    ) : (
                      <IconBell
                        size={18}
                        style={{
                          color:
                            entry.severity === "urgent"
                              ? "var(--color-signal-red)"
                              : "var(--color-ochre)",
                        }}
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="t-title block">{entry.title}</span>
                      <span className="t-secondary block">{entry.detail}</span>
                    </span>
                    <span className="t-data shrink-0" style={{ color: "var(--color-fg-3)" }}>
                      {entry.meta}
                    </span>
                    <IconChevronRight size={18} style={{ color: "var(--color-fg-3)" }} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
