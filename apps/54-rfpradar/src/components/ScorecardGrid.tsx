"use client";

/**
 * ScorecardGrid — the go/no-go worksheet.
 *
 * Criteria as hairline rows: label, a 1-5 segmented control at 44px per segment,
 * a note field. The weighted verdict composes live at the bottom and shows its
 * arithmetic — "380 of 500 points = 76" — because a verdict a partner cannot
 * recompute is a verdict they will overrule.
 *
 * Two deliberate refusals:
 *  - A partially scored card renders UNSCORED, never a confident NO-GO built out
 *    of three unanswered questions.
 *  - Recording the decision is hold-to-confirm (600ms) and permanent. The "no" is
 *    a first-class outcome and the firm's win-rate denominator depends on it not
 *    being quietly reopened later.
 */

import { useState } from "react";
import {
  SCALE_ANCHORS,
  verdictLabel,
  weightedVerdict,
  type ScorecardCriterion,
} from "@/lib/scorecard";
import { HoldToConfirm } from "@/components/HoldToConfirm";

const SCALE = [1, 2, 3, 4, 5] as const;

export function ScorecardGrid({
  pursuitId,
  criteria,
  saveAction,
  decideAction,
  decided,
}: {
  pursuitId: string;
  criteria: ScorecardCriterion[];
  saveAction: (formData: FormData) => Promise<void>;
  decideAction: (formData: FormData) => Promise<void>;
  decided: { verdict: string | null; by: string | null; at: string | null } | null;
}) {
  const [rows, setRows] = useState<ScorecardCriterion[]>(criteria);
  const result = weightedVerdict(rows);

  function setScore(key: string, score: number) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, score1to5: score } : row)),
    );
  }
  function setNote(key: string, note: string) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, note } : row)));
  }

  const tone =
    result.verdict === "go"
      ? "var(--color-green-text)"
      : result.verdict === "conditional"
        ? "var(--color-amber-text)"
        : result.verdict === "no_go"
          ? "var(--color-red)"
          : "var(--color-ink-3)";

  if (decided) {
    return (
      <div className="card p-4">
        <h2 className="t-label">Go/no-go — decided</h2>
        <div className="rows mt-2">
          {rows.map((row) => (
            <div key={row.key} className="py-3">
              <div className="flex items-baseline gap-3">
                <span className="t-body flex-1">{row.label}</span>
                <span className="t-mono" style={{ color: "var(--color-ink)" }}>
                  {row.score1to5 ?? "—"}/5 × {row.weight}
                </span>
              </div>
              {row.note && (
                <p className="t-secondary mt-1">{row.note}</p>
              )}
            </div>
          ))}
        </div>
        <p className="t-mono mt-4" style={{ color: tone }}>
          {verdictLabel(result.verdict)} · {result.explanation}
        </p>
        <p className="t-secondary mt-2">
          Recorded decision: {decided.verdict === "no_go" ? "No-bid" : verdictLabel(result.verdict)}
          {decided.by ? ` · ${decided.by}` : ""}
          {decided.at ? ` · ${decided.at}` : ""}. This record is permanent.
        </p>
      </div>
    );
  }

  return (
    // Two sibling forms inside one card, never nested: a <form> inside a <form>
    // is invalid HTML, the browser drops the inner one, and the hold-to-confirm
    // button then silently submits "save" instead of recording the decision.
    // That exact bug shipped here once and was caught driving the real page.
    <div className="card p-4">
      <h2 className="t-label">Go/no-go — five questions, ten minutes</h2>

      <form action={saveAction} id={`scorecard-${pursuitId}`}>
      <input type="hidden" name="pursuitId" value={pursuitId} />

      <div className="rows mt-2">
        {rows.map((row) => {
          const anchors = SCALE_ANCHORS[row.key];
          return (
            <fieldset key={row.key} className="py-4 border-0 p-0 m-0">
              <legend className="t-body" style={{ padding: 0 }}>
                {row.label}
                <span className="t-label ml-2" style={{ display: "inline" }}>
                  weight {row.weight}
                </span>
              </legend>

              <div className="mt-2 flex gap-2" role="group" aria-label={`${row.label}: 1 to 5`}>
                {SCALE.map((value) => {
                  const active = row.score1to5 === value;
                  return (
                    <label
                      key={value}
                      className="chip"
                      aria-current={active ? "true" : undefined}
                      style={{
                        width: 44,
                        height: 44,
                        justifyContent: "center",
                        fontFamily: "var(--font-mono)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name={`score_${row.key}`}
                        value={value}
                        checked={active}
                        onChange={() => setScore(row.key, value)}
                        className="sr-only"
                      />
                      {value}
                    </label>
                  );
                })}
                <span className="t-mono self-center" style={{ color: "var(--color-ink-3)" }}>
                  {row.score1to5 === null ? "unscored" : `${row.weight * row.score1to5} pts`}
                </span>
              </div>

              {anchors && (
                <p className="t-secondary mt-2">
                  1 = {anchors[0]} · 5 = {anchors[1]}
                </p>
              )}

              <input
                className="input mt-2"
                name={`note_${row.key}`}
                value={row.note}
                onChange={(event) => setNote(row.key, event.target.value)}
                placeholder="Why that score?"
              />
            </fieldset>
          );
        })}
      </div>

      <div className="mt-4 hair-t pt-4">
        <div className="flex items-center gap-3">
          <span className="t-stat" style={{ fontSize: "2rem", color: tone }}>
            {result.score ?? "—"}
          </span>
          <span className="t-mono" style={{ color: tone }}>
            {verdictLabel(result.verdict)}
          </span>
        </div>
        <p className="t-secondary mt-2">{result.explanation}</p>
      </div>

      <button className="btn btn-secondary w-full mt-4" type="submit">
        Save without deciding
      </button>
      </form>

      <div className="mt-3 flex flex-col gap-3">
        <HoldToConfirm
          action={decideAction}
          hiddenFields={{
            pursuitId,
            ...Object.fromEntries(
              rows.flatMap((row) => [
                [`score_${row.key}`, row.score1to5 === null ? "" : String(row.score1to5)],
                [`note_${row.key}`, row.note],
              ]),
            ),
          }}
          disabled={result.verdict === null}
          label={
            result.verdict === null
              ? `Score all ${rows.length} questions to record a decision`
              : result.verdict === "no_go"
                ? "Hold to record the no-bid"
                : `Hold to record ${verdictLabel(result.verdict)}`
          }
          holdingLabel="Recording…"
        />
        {result.verdict === "no_go" && (
          <p className="t-secondary">
            Recording a no-bid closes this pursuit and keeps the reason. That is the point: it is the
            denominator your win rate has been missing.
          </p>
        )}
      </div>
    </div>
  );
}
