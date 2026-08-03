import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  DEFAULT_SCAN_HOUR,
  answerBlocks,
  firmSettings,
  keywordProfiles,
  notifications,
  pursuits,
  sources,
} from "@/db/schema";
import { requireFirm } from "@/lib/auth";
import { countMatches, listMatches } from "@/lib/matching";
import { deadlineSummary } from "@/lib/deadlines";
import { formatCount, formatDay, formatTime, formatWeekday } from "@/lib/format";
import { hasResponseWorkspace } from "@/lib/plans";
import { MatchCard } from "@/components/MatchCard";
import { SourceHealth, summarizeSources } from "@/components/SourceHealth";
import { ChevronRight, Plus, TargetRing } from "@/components/icons";
import {
  dismissMatchAction,
  pursueMatchAction,
  refreshSourcesAction,
  watchMatchAction,
} from "./actions";

export const metadata: Metadata = { title: "Radar" };

type Filter = "new" | "watching" | "due" | "all";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "new", label: "New" },
  { key: "watching", label: "Watching" },
  { key: "due", label: "Due soon" },
  { key: "all", label: "All" },
];

/**
 * /radar — the capture desk's front page.
 *
 * DESIGN.md's mobile layout, in order: the scan stamp, the hero stat with its
 * single accent-filled 4px track, the secondary line, the filter chips, then
 * match cards by score. The top card gets the four-beat 6am find; the rest enter
 * as a plain 24ms staggered list.
 *
 * The empty state is the morning scan's quiet line, word for word, because a firm
 * that sees the same sentence in its inbox and on the screen learns that silence
 * means "nothing matched" rather than "something broke".
 */
export default async function RadarPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { firm, access } = await requireFirm();
  const { filter: rawFilter } = await searchParams;
  const filter: Filter = (FILTERS.find((f) => f.key === rawFilter)?.key ?? "new") as Filter;

  const db = getDb();
  const now = new Date();
  const tz = firm.timezone;
  const settings = firmSettings(firm);

  const [profiles, blocks, allSources, counts, deadlines, lastScan] = await Promise.all([
    db.select().from(keywordProfiles).where(eq(keywordProfiles.firmId, firm.id)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(answerBlocks)
      .where(and(eq(answerBlocks.firmId, firm.id), eq(answerBlocks.archived, false))),
    db.select().from(sources).orderBy(sources.name),
    countMatches(firm.id),
    deadlineSummary(firm.id, tz, now),
    db
      .select({ occurredAt: notifications.occurredAt })
      .from(notifications)
      .where(and(eq(notifications.firmId, firm.id), eq(notifications.kind, "morning_scan")))
      .orderBy(sql`${notifications.occurredAt} desc`)
      .limit(1),
  ]);

  const blockCount = blocks[0]?.count ?? 0;
  const registerCount = await countRegister(now);

  // "Watching" is expressed as the notices behind pursuits parked at that stage.
  let watchedOpportunityIds: string[] | undefined;
  if (filter === "watching") {
    const rows = await db
      .select({ opportunityId: pursuits.opportunityId })
      .from(pursuits)
      .where(
        and(
          eq(pursuits.firmId, firm.id),
          eq(pursuits.stage, "watching"),
          isNotNull(pursuits.opportunityId),
        ),
      );
    watchedOpportunityIds = rows
      .map((row) => row.opportunityId)
      .filter((id): id is string => Boolean(id));
  }

  const rows = await listMatches(firm.id, {
    states:
      filter === "new"
        ? ["new"]
        : filter === "watching"
          ? ["pursued", "seen", "new"]
          : ["new", "seen", "pursued"],
    opportunityIds: watchedOpportunityIds,
    dueWithinDays: filter === "due" ? 7 : undefined,
    now,
  });

  const firstRun =
    profiles.length === 0 ||
    blockCount === 0 ||
    (!firm.slackWebhookUrl && !settings.onboarded?.notify);

  const scanStamp = lastScan[0]
    ? `SCANNED ${formatCount(registerCount)} NOTICES · ${allSources.length} SOURCE${allSources.length === 1 ? "" : "S"} · ${formatTime(lastScan[0].occurredAt, tz)}`
    : `${formatCount(registerCount)} NOTICES IN THE REGISTER · ${allSources.length} SOURCE${allSources.length === 1 ? "" : "S"} · FIRST SCAN AT ${String(settings.scanHour ?? DEFAULT_SCAN_HOUR).padStart(2, "0")}:00`;

  const secondary = [
    deadlines.overdue > 0 ? `${deadlines.overdue} overdue` : null,
    `${deadlines.dueThisWeek} due this week`,
    summarizeSources(allSources),
  ]
    .filter(Boolean)
    .join(" · ");

  // The hero track: new matches as a share of everything surfaced this cycle.
  const surfaced = Math.max(counts.new + counts.dismissed, 1);
  const trackPercent = Math.min(100, Math.round((counts.new / surfaced) * 100));

  return (
    <main className="pt-4">
      <p className="t-label beat-stamp">
        {formatWeekday(now, tz)} {formatDay(now, tz)}
      </p>
      <p className="t-mono beat-stamp mt-1" style={{ color: "var(--color-ink-3)" }}>
        {scanStamp}
      </p>

      <h1 className="t-stat mt-3">
        {counts.new} <span className="t-h2">new</span>
      </h1>
      <div className="track mt-2" role="presentation">
        <span style={{ width: `${trackPercent}%` }} />
      </div>
      <p className="t-secondary mt-2">{secondary}</p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <form action={refreshSourcesAction}>
          <button className="btn-quiet" type="submit">
            Re-poll sources
          </button>
        </form>
        {counts.suppressed > 0 && (
          <Link href="/radar/suppressed" className="btn-quiet">
            {counts.suppressed} suppressed — see what was filtered
          </Link>
        )}
      </div>

      <details className="mt-3">
        <summary className="btn-quiet cursor-pointer list-none">Source health</summary>
        <div className="mt-2 hair-t">
          <SourceHealth sources={allSources} timezone={tz} now={now} />
        </div>
      </details>

      {firstRun && (
        <section className="mt-6">
          <h2 className="t-label">Finish setting up</h2>
          <div className="mt-2 flex flex-col gap-3">
            {profiles.length === 0 ? (
              <FirstRunCard
                title="Build a keyword profile"
                body="NAICS codes plus the phrases you actually win on. The scan runs it against every feed each morning."
                href="/profiles"
                cta="Add a profile"
              />
            ) : (
              <DoneCard
                title="Keyword profile"
                body={`${profiles.length} profile${profiles.length === 1 ? "" : "s"} active — ${profiles[0].keywords.length} keyword${profiles[0].keywords.length === 1 ? "" : "s"}, ${profiles[0].naicsCodes.length} NAICS code${profiles[0].naicsCodes.length === 1 ? "" : "s"}.`}
                href="/profiles"
              />
            )}
            {!firm.slackWebhookUrl && !settings.onboarded?.notify ? (
              <FirstRunCard
                title="Confirm where the 6am scan lands"
                body="Email goes to every seat. Paste a Slack incoming webhook and it posts there too."
                href="/settings"
                cta="Set the destination"
              />
            ) : (
              <DoneCard
                title="Morning scan"
                body={
                  firm.slackWebhookUrl
                    ? "Email to every seat, plus your Slack channel."
                    : "Email to every seat."
                }
                href="/settings"
              />
            )}
            {blockCount === 0 ? (
              <FirstRunCard
                title="Import three library blocks"
                body="Paste your company overview, one past-performance blurb, and a team bio from your last proposal."
                href="/library"
                cta="Add a block"
              />
            ) : (
              <DoneCard
                title="Answer library"
                body={`${blockCount} block${blockCount === 1 ? "" : "s"} ready to link into a pursuit.`}
                href="/library"
              />
            )}
          </div>
        </section>
      )}

      <nav className="mt-6 flex gap-2 scroll-x" aria-label="Filter matches">
        {FILTERS.map(({ key, label }) => (
          <Link
            key={key}
            href={key === "new" ? "/radar" : `/radar?filter=${key}`}
            className="chip"
            aria-current={filter === key ? "true" : undefined}
          >
            {label}
            {key === "new" && counts.new > 0 && <span className="t-mono">{counts.new}</span>}
          </Link>
        ))}
      </nav>

      <section className="mt-4 flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-4">
        {rows.map((row, index) => (
          <MatchCard
            key={row.match.id}
            matchId={row.match.id}
            title={row.opportunity.title}
            agency={row.opportunity.agency}
            state={row.opportunity.state}
            noticeId={row.opportunity.externalId}
            score={row.match.score}
            factors={row.match.factors as never}
            responsesDueAt={row.opportunity.responsesDueAt}
            valueBand={row.opportunity.estValueBand}
            timezone={tz}
            now={now}
            sourceName={row.sourceName}
            sourceStatus={row.sourceStatus}
            ceremony={filter === "new" && index === 0}
            index={index}
            pursueAction={pursueMatchAction}
            watchAction={watchMatchAction}
            dismissAction={dismissMatchAction}
          />
        ))}
      </section>

      {rows.length === 0 && (
        <section className="card p-4 mt-4">
          {profiles.length === 0 ? (
            <>
              <p className="t-body">
                Nothing to score yet — this firm has no keyword profile. Add NAICS codes and a
                handful of phrases and the next scan has something to look for.
              </p>
              <Link href="/profiles" className="btn btn-primary w-full mt-4">
                <TargetRing size={20} /> Build a keyword profile
              </Link>
            </>
          ) : filter === "new" ? (
            <>
              {/* The morning scan's quiet line, verbatim. */}
              <p className="t-body">
                No new matches. {formatCount(registerCount)} notices scanned across{" "}
                {allSources.length} source{allSources.length === 1 ? "" : "s"}.
              </p>
              <p className="t-secondary mt-2">
                {counts.suppressed > 0
                  ? `${counts.suppressed} were below your threshold. They are kept, not deleted — open the audit view to see each one and why.`
                  : "Every notice in the register has been scored against your profiles."}
              </p>
            </>
          ) : filter === "watching" ? (
            <p className="t-body">
              Nothing is being watched. Tap <strong>Watch</strong> on a match to park it here without
              starting a go/no-go.
            </p>
          ) : filter === "due" ? (
            <p className="t-body">Nothing you are tracking closes in the next seven days.</p>
          ) : (
            <p className="t-body">No matches yet. The next scan will fill this in.</p>
          )}
        </section>
      )}

      {rows.length > 0 && (
        <div className="mt-6">
          <Link href={`/radar/${rows[0].match.id}`} className="btn btn-primary w-full">
            Review matches <ChevronRight size={20} />
          </Link>
          {!hasResponseWorkspace(access.planId) && (
            <p className="t-secondary mt-3">
              Pursuits, scorecards, and the answer library are on Pursuit and above.{" "}
              <Link href="/settings/billing" className="btn-quiet">
                See plans
              </Link>
            </p>
          )}
        </div>
      )}
    </main>
  );
}

async function countRegister(now: Date): Promise<number> {
  const { opportunities } = await import("@/db/schema");
  const { gte, ne, or, isNull } = await import("drizzle-orm");
  const since = new Date(now.getTime() - 120 * 86_400_000);
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(opportunities)
    .where(
      and(
        gte(opportunities.postedAt, since),
        ne(opportunities.oppStatus, "cancelled"),
        or(isNull(opportunities.responsesDueAt), gte(opportunities.responsesDueAt, now)),
      ),
    );
  return row?.count ?? 0;
}

function FirstRunCard({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <article className="card p-4">
      <h3 className="t-title">{title}</h3>
      <p className="t-secondary mt-1">{body}</p>
      <Link href={href} className="btn btn-secondary btn-compact mt-3">
        <Plus size={18} /> {cta}
      </Link>
    </article>
  );
}

function DoneCard({ title, body, href }: { title: string; body: string; href: string }) {
  return (
    <article className="card p-4">
      <div className="flex items-center gap-2">
        <h3 className="t-title flex-1">{title}</h3>
        <span className="t-label" style={{ color: "var(--color-green-text)" }}>
          done
        </span>
      </div>
      <p className="t-secondary mt-1">{body}</p>
      <Link href={href} className="btn-quiet mt-2">
        Review
      </Link>
    </article>
  );
}
