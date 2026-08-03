import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { keywordProfiles, opportunityEvents } from "@/db/schema";
import { requireFirm } from "@/lib/auth";
import { getMatch, markMatchSeen } from "@/lib/matching";
import { DISMISS_REASONS, stateName } from "@/lib/scoring";
import {
  deadlineTone,
  formatCountdown,
  formatDayTime,
  formatDayYear,
  formatValueBand,
} from "@/lib/format";
import { FactorRows } from "@/components/FactorList";
import { NoticeBody } from "@/components/Highlight";
import { StatusPill, sourceTone } from "@/components/StatusPill";
import { ChevronLeft, LinkOut } from "@/components/icons";
import { dismissMatchAction, pursueMatchAction, watchMatchAction } from "../actions";

export const metadata: Metadata = { title: "Notice" };

/**
 * The notice reader: the full opportunity in a 20-radius sheet.
 *
 * Order per DESIGN.md: the mono meta block (id, agency, dates, value band), the
 * description with the profile's keyword hits underlined in `federal`, the
 * amendment trail as hairline rows, then the actions row.
 *
 * The full factor list is rendered open here rather than behind a disclosure —
 * this is the screen where someone decides whether to spend a proposal week, and
 * the reasons are the argument.
 */
export default async function NoticeReaderPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { firm } = await requireFirm();
  const { matchId } = await params;
  const row = await getMatch(firm.id, matchId);
  if (!row) notFound();

  const db = getDb();
  const tz = firm.timezone;
  const now = new Date();

  // Opening the reader is what marks a match seen. Nothing else does, so "new"
  // means "no human has looked at this yet".
  if (row.match.state === "new") await markMatchSeen(firm.id, row.match.id);

  const [profile] = await db
    .select()
    .from(keywordProfiles)
    .where(eq(keywordProfiles.id, row.match.keywordProfileId));

  const events = await db
    .select()
    .from(opportunityEvents)
    .where(eq(opportunityEvents.opportunityId, row.opportunity.id))
    .orderBy(desc(opportunityEvents.occurredAt))
    .limit(12);

  const band = formatValueBand(row.opportunity.estValueBand as never);
  const factors = row.match.factors as never as Array<{
    key: string;
    weight: number;
    matched: boolean;
    reason: string;
  }>;

  const meta: Array<[string, string]> = [
    ["Notice id", row.opportunity.externalId],
    ["Agency", row.opportunity.agency],
    ["Scope", stateName(row.opportunity.state)],
    ["Posted", formatDayYear(row.opportunity.postedAt, tz)],
    [
      "Questions due",
      row.opportunity.questionsDueAt
        ? `${formatDayTime(row.opportunity.questionsDueAt, tz)} · ${formatCountdown(row.opportunity.questionsDueAt, tz, now)}`
        : "not published",
    ],
    [
      "Proposal due",
      row.opportunity.responsesDueAt
        ? `${formatDayTime(row.opportunity.responsesDueAt, tz)} · ${formatCountdown(row.opportunity.responsesDueAt, tz, now)}`
        : "not published",
    ],
    ["Value band", band ?? "not published"],
    ["NAICS", row.opportunity.naicsCodes.join(", ") || "none published"],
    ["PSC", row.opportunity.pscCodes.join(", ") || "none published"],
  ];

  const dueTone = row.opportunity.responsesDueAt
    ? deadlineTone(row.opportunity.responsesDueAt, tz, null, now)
    : null;

  return (
    <main className="pt-4">
      <Link href="/radar" className="btn-quiet">
        <ChevronLeft size={18} /> Radar
      </Link>

      <article className="sheet p-5 mt-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="t-label">{row.sourceName}</p>
            <h1 className="t-h2 mt-1">{row.opportunity.title}</h1>
          </div>
          <div className="shrink-0 text-right">
            <span className="t-score" aria-label={`Fit score ${row.match.score} out of 100`}>
              {row.match.score}
            </span>
            <span className="t-label block mt-1">fit</span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <StatusPill
            label={row.opportunity.oppStatus}
            tone={row.opportunity.oppStatus === "cancelled" ? "bad" : "quiet"}
          />
          {dueTone && (
            <StatusPill
              label={
                dueTone === "over"
                  ? "closed"
                  : dueTone === "soon"
                    ? "due soon"
                    : `due in ${formatCountdown(row.opportunity.responsesDueAt!, tz, now)}`
              }
              tone={dueTone === "over" ? "bad" : dueTone === "soon" ? "warn" : "quiet"}
            />
          )}
          <StatusPill label={row.sourceStatus} tone={sourceTone(row.sourceStatus)} />
        </div>

        {row.sourceNote && (
          <p className="t-secondary mt-3" style={{ color: "var(--color-amber-text)" }}>
            {row.sourceNote}
          </p>
        )}

        <section className="mt-5">
          <h2 className="t-label">The register entry</h2>
          <dl className="rows mt-1">
            {meta.map(([label, value]) => (
              <div key={label} className="py-3 flex gap-3">
                <dt className="t-secondary" style={{ flex: "0 0 40%" }}>
                  {label}
                </dt>
                <dd className="t-mono m-0 flex-1" style={{ color: "var(--color-ink)" }}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <a
            href={row.opportunity.url}
            className="btn-quiet mt-3"
            target="_blank"
            rel="noreferrer noopener"
          >
            Open on {new URL(row.opportunity.url).host} <LinkOut size={18} />
          </a>
        </section>

        <section className="mt-6">
          <h2 className="t-label">
            Why it scored {row.match.score} — profile “{profile?.name ?? "unknown"}”
          </h2>
          <div className="mt-1">
            <FactorRows factors={factors} />
          </div>
        </section>

        <section className="mt-6">
          <h2 className="t-label">Scope, as published</h2>
          <div className="mt-2">
            <NoticeBody text={row.opportunity.description} phrases={profile?.keywords ?? []} />
          </div>
        </section>

        <section className="mt-6">
          <h2 className="t-label">Amendment trail</h2>
          <div className="rows mt-1">
            {events.map((event) => (
              <div key={event.id} className="py-3 flex items-start gap-3">
                <span className="t-mono" style={{ color: "var(--color-ink-3)", flex: "0 0 40%" }}>
                  {formatDayTime(event.occurredAt, tz)}
                </span>
                <span className="t-secondary flex-1" style={{ color: "var(--color-ink)" }}>
                  {describeEvent(event.kind, event.detail, tz)}
                </span>
              </div>
            ))}
            {events.length === 0 && (
              <p className="t-secondary py-3">
                No changes recorded since this notice was first ingested.
              </p>
            )}
          </div>
        </section>
      </article>

      <section className="mt-5">
        <form action={pursueMatchAction}>
          <input type="hidden" name="matchId" value={row.match.id} />
          <button className="btn btn-primary w-full" type="submit">
            Pursue — start the go/no-go
          </button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <form action={watchMatchAction}>
            <input type="hidden" name="matchId" value={row.match.id} />
            <button className="btn btn-secondary btn-compact" type="submit">
              Watch
            </button>
          </form>
          <details className="ml-auto">
            <summary className="btn-quiet cursor-pointer list-none">Dismiss with a reason</summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {DISMISS_REASONS.map((reason) => (
                <form action={dismissMatchAction} key={reason}>
                  <input type="hidden" name="matchId" value={row.match.id} />
                  <input type="hidden" name="reason" value={reason} />
                  <button className="chip" type="submit">
                    {reason}
                  </button>
                </form>
              ))}
            </div>
          </details>
        </div>
      </section>
    </main>
  );
}

function describeEvent(kind: string, detail: unknown, tz: string): string {
  if (kind === "posted") return "Notice first ingested from the source.";
  if (kind === "cancelled") return "Notice cancelled by the issuing agency.";
  const changes = (detail as { changes?: Array<{ field: string; old: string | null; new: string | null }> })
    ?.changes;
  if (Array.isArray(changes) && changes.length > 0) {
    return changes
      .map((change) => {
        const label = change.field === "questionsDueAt" ? "Questions due" : "Proposal due";
        const before = change.old ? formatDayYear(new Date(change.old), tz) : "not set";
        const after = change.new ? formatDayYear(new Date(change.new), tz) : "removed";
        return `${label} moved: ${before} → ${after}`;
      })
      .join(" · ");
  }
  return "Notice amended — scope text or attachments changed.";
}
