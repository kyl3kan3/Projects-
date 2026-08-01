"use client";

/**
 * A funder card: the fit arc top-right, the funder's name with its underline sweep,
 * a one-line giving profile, the freshness stamp, and "Add to pipeline".
 *
 * The SAMPLE mark is not decorative. These records are illustrative, and a small
 * nonprofit deciding where to spend its ten hours a month deserves to know that at
 * a glance, on every card, not in a footnote.
 */

import { useActionState, useState } from "react";
import { FitArc, FitArcEmpty, FitPanel } from "@/components/FitArc";
import { Sheet } from "@/components/Sheet";
import { IconExternal, IconPlus, IconRefresh } from "@/components/icons";
import { formatCents } from "@/lib/money";
import type { FitScore } from "@/lib/fit-score";
import {
  addFunderToPipelineAction,
  reportFunderChangeAction,
  type DiscoveryActionState,
} from "./actions";

const INITIAL: DiscoveryActionState = { error: null };

export interface FunderCardProps {
  funderId: string;
  name: string;
  ein: string;
  kindLabel: string;
  isSample: boolean;
  profileLine: string;
  freshnessLine: string;
  deadlinesNote: string | null;
  applicationUrl: string | null;
  score: FitScore | null;
  missing: string[];
  inPipeline: boolean;
  defaultAsk: string;
  recentAwards: {
    recipientName: string;
    recipientState: string | null;
    amountCents: number;
    taxYear: number;
  }[];
}

export function FunderCard(props: FunderCardProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [addState, addAction, addPending] = useActionState(
    addFunderToPipelineAction,
    INITIAL,
  );
  const [reportState, reportAction, reportPending] = useActionState(
    reportFunderChangeAction,
    INITIAL,
  );

  return (
    <article className="card mt-4 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {props.isSample ? (
            <span
              className="t-label mb-2 inline-block"
              style={{ color: "var(--color-brick-text)" }}
            >
              Sample record — not a live opportunity
            </span>
          ) : null}
          <h3 className="t-title relative inline-block name-sweep">{props.name}</h3>
          <p className="t-secondary mt-1">{props.profileLine}</p>
          <p className="t-data mt-2" style={{ color: "var(--color-ink-2)" }}>
            {props.freshnessLine} · EIN {props.ein} · {props.kindLabel.toUpperCase()}
          </p>
        </div>
        <div className="shrink-0">
          {props.score ? <FitArc total={props.score.total} /> : <FitArcEmpty />}
        </div>
      </div>

      <div className="mt-4 rule-t pt-3">
        <FitPanel
          score={props.score}
          subject={props.name}
          missing={props.missing}
        />
      </div>

      {props.deadlinesNote ? (
        <p className="t-secondary mt-3 rule-t pt-3">{props.deadlinesNote}</p>
      ) : null}

      {props.recentAwards.length ? (
        <details className="mt-3 rule-t pt-3">
          <summary className="t-label" style={{ cursor: "pointer", minHeight: 44 }}>
            Recent grants on file ({props.recentAwards.length})
          </summary>
          <div className="mt-2">
            {props.recentAwards.map((award) => (
              <div
                key={`${award.recipientName}-${award.amountCents}-${award.taxYear}`}
                className="flex items-baseline justify-between gap-3 rule-t py-2"
              >
                <span className="t-secondary min-w-0 flex-1 truncate">
                  {award.recipientName}
                  {award.recipientState ? ` · ${award.recipientState}` : ""}
                </span>
                <span className="t-data shrink-0" style={{ color: "var(--color-ink-2)" }}>
                  {formatCents(award.amountCents)} · {award.taxYear}
                </span>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-4 rule-t pt-3">
        {props.inPipeline ? (
          <span className="t-label" style={{ color: "var(--color-leaf-text)" }}>
            Already in your pipeline
          </span>
        ) : (
          <button type="button" className="btn-quiet" onClick={() => setAddOpen(true)}>
            <IconPlus size={18} />
            Add to pipeline
          </button>
        )}
        {props.applicationUrl ? (
          <a
            className="btn-quiet"
            href={props.applicationUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            <IconExternal size={18} />
            Guidelines
          </a>
        ) : null}
        <button type="button" className="btn-quiet" onClick={() => setReportOpen(true)}>
          <IconRefresh size={18} />
          Something changed
        </button>
      </div>

      <Sheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={`Add ${props.name}`}
      >
        <form action={addAction} className="flex flex-col gap-4 pt-2">
          <input type="hidden" name="funderId" value={props.funderId} />
          <label className="flex flex-col gap-2">
            <span className="t-label">What you will ask for</span>
            <input
              className="input"
              name="title"
              placeholder="Summer literacy camp, 2027"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Ask amount</span>
            <input
              className="input t-data-lg"
              name="askAmount"
              defaultValue={props.defaultAsk}
              placeholder="10,000"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Application deadline, if you know it</span>
            <input className="input t-data-lg" type="date" name="dueOn" />
          </label>
          {addState.error ? (
            <p className="t-secondary" role="alert" style={{ color: "var(--color-brick-text)" }}>
              {addState.error}
            </p>
          ) : null}
          <button className="btn btn-primary w-full" type="submit" disabled={addPending}>
            {addPending ? "Adding…" : "Add at Researching"}
          </button>
          <p className="t-secondary" style={{ color: "var(--color-ink-2)" }}>
            The fit score as it reads now is saved with the grant, so a year from now you
            can see what you knew when you decided.
          </p>
        </form>
      </Sheet>

      <Sheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Report a change"
      >
        <form action={reportAction} className="flex flex-col gap-4 pt-2">
          <input type="hidden" name="funderId" value={props.funderId} />
          <label className="flex flex-col gap-2">
            <span className="t-label">What have you found?</span>
            <textarea
              className="textarea"
              name="note"
              rows={5}
              placeholder="Their LOI deadline moved to 1 October, and the giving page now says invitation only."
              required
            />
          </label>
          {reportState.ok ? (
            <p className="t-secondary" style={{ color: "var(--color-leaf-text)" }}>
              Thank you — this goes into the curation queue.
            </p>
          ) : null}
          {reportState.error ? (
            <p className="t-secondary" role="alert" style={{ color: "var(--color-brick-text)" }}>
              {reportState.error}
            </p>
          ) : null}
          <button className="btn btn-primary w-full" type="submit" disabled={reportPending}>
            {reportPending ? "Sending…" : "Send it"}
          </button>
        </form>
      </Sheet>
    </article>
  );
}
