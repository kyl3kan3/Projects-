/**
 * MatchCard — one scored opportunity in the radar queue.
 *
 * Construction is DESIGN.md's, exactly: `card` ground, radius 12, padding 16, the
 * fit score in mono `federal` top-right at 24px, the notice title clamped to two
 * lines, agency and state as Secondary, a mono meta row
 * ("SOL-26-0412 · due Mar 21 · $250k–$1M"), then the top two factor reasons with
 * a "+3 more" quiet action, then the actions row: Pursue (primary, compact 40px)
 * / Watch / Dismiss.
 *
 * A server component. The only client JavaScript on this card is the score
 * counter on the one card that gets the 6am ceremony — the actions are plain
 * forms bound to server actions, and the reasons expand with `<details>`.
 */

import Link from "next/link";
import type { MatchFactor } from "@/db/schema";
import { deadlineTone, formatCountdown, formatDay, formatValueBand } from "@/lib/format";
import { DISMISS_REASONS, stateName } from "@/lib/scoring";
import { FactorList } from "@/components/FactorList";
import { ScoreCounter } from "@/components/ScoreCounter";
import { StatusPill } from "@/components/StatusPill";
import { ChevronRight } from "@/components/icons";

export interface MatchCardProps {
  matchId: string;
  title: string;
  agency: string;
  state: string | null;
  noticeId: string;
  score: number;
  factors: MatchFactor[];
  responsesDueAt: Date | null;
  valueBand: unknown;
  timezone: string;
  now: Date;
  sourceName: string;
  sourceStatus: string;
  /** Set on the single top card: plays the four-beat 6am find once. */
  ceremony?: boolean;
  /** Row index, for the plain 24ms staggered entry of the rest of the list. */
  index?: number;
  pursueAction: (formData: FormData) => Promise<void>;
  watchAction: (formData: FormData) => Promise<void>;
  dismissAction: (formData: FormData) => Promise<void>;
}

export function MatchCard(props: MatchCardProps) {
  const {
    matchId,
    title,
    agency,
    state,
    noticeId,
    score,
    factors,
    responsesDueAt,
    valueBand,
    timezone,
    now,
    ceremony = false,
    index = 0,
  } = props;

  const band = formatValueBand(valueBand as never);
  const tone = responsesDueAt ? deadlineTone(responsesDueAt, timezone, null, now) : null;
  const countdown = responsesDueAt ? formatCountdown(responsesDueAt, timezone, now) : null;

  const meta = [
    noticeId,
    responsesDueAt ? `due ${formatDay(responsesDueAt, timezone)}` : "no closing date published",
    band,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className={`card p-4 ${ceremony ? "beat-card" : "beat-row"}`}
      style={ceremony ? undefined : { animationDelay: `${Math.min(index, 8) * 24}ms` }}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="t-title line-clamp-2">
            <Link href={`/radar/${matchId}`} style={{ color: "inherit", textDecoration: "none" }}>
              {title}
            </Link>
          </h3>
          <p className="t-secondary mt-1">
            {agency} · {stateName(state)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {ceremony ? (
            <ScoreCounter score={score} />
          ) : (
            <span className="t-score" aria-label={`Fit score ${score} out of 100`}>
              {score}
            </span>
          )}
          <span className="t-label block mt-1">fit</span>
        </div>
      </div>

      <p className="t-mono mt-3" style={{ color: "var(--color-ink-3)" }}>
        {meta}
      </p>

      {countdown && tone && (
        <div className={`mt-3 ${ceremony ? "beat-chip" : ""}`}>
          <StatusPill
            label={tone === "over" ? `closed ${countdown}` : `due in ${countdown}`}
            tone={tone === "over" ? "bad" : tone === "soon" ? "warn" : "quiet"}
          />
        </div>
      )}

      <div className="mt-3">
        <FactorList score={score} factors={factors} animate={ceremony} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <form action={props.pursueAction}>
          <input type="hidden" name="matchId" value={matchId} />
          <button className="btn btn-primary btn-compact" type="submit">
            Pursue
          </button>
        </form>
        <form action={props.watchAction}>
          <input type="hidden" name="matchId" value={matchId} />
          <button className="btn btn-secondary btn-compact" type="submit">
            Watch
          </button>
        </form>
        <details className="ml-auto">
          <summary className="btn-quiet cursor-pointer list-none">Dismiss</summary>
          <div className="mt-2">
            <p className="t-label mb-2">Why? The reason tunes this profile.</p>
            <div className="flex flex-wrap gap-2">
              {DISMISS_REASONS.map((reason) => (
                <form action={props.dismissAction} key={reason}>
                  <input type="hidden" name="matchId" value={matchId} />
                  <input type="hidden" name="reason" value={reason} />
                  <button className="chip" type="submit">
                    {reason}
                  </button>
                </form>
              ))}
            </div>
          </div>
        </details>
      </div>

      <Link
        href={`/radar/${matchId}`}
        className="btn-quiet mt-2"
        aria-label={`Read the full notice for ${title}`}
      >
        Read the notice <ChevronRight size={18} />
      </Link>
    </article>
  );
}
