"use client";

/**
 * The hero's working demo: paste one clause, see its type, its flag, the plain-English
 * read, and the replacement wording.
 *
 * This is the product's first thirty seconds, running on the marketing page. It is
 * pre-filled with a real net-60 payment clause so the machine is *visibly running* within
 * five seconds of landing (playbook law 2) — the visitor presses one button rather than
 * finding a contract first.
 */

import { useActionState } from "react";
import { useState } from "react";
import { checkClauseAction, type CheckResult } from "@/app/check/actions";
import { SeverityChip } from "@/components/SeverityChip";
import { IconAlertTriangle } from "@/components/icons";

const PREFILL =
  "Client shall pay each undisputed invoice within sixty (60) days of Client's receipt of that invoice. Client may withhold payment of any amount it disputes in good faith pending resolution of the dispute.";

export function ClauseChecker() {
  const [state, formAction, pending] = useActionState<CheckResult, FormData>(checkClauseAction, {
    error: null,
  });
  const [clause, setClause] = useState(PREFILL);

  return (
    <section>
      <form action={formAction} className="measure">
        <label className="field">
          <span className="field-label">Paste one clause from the contract in your inbox</span>
          <textarea
            className="input"
            name="clause"
            value={clause}
            onChange={(e) => setClause(e.target.value)}
            style={{ minHeight: 140 }}
            spellCheck={false}
          />
          <span className="field-help">
            Free, no account. This clause is a real net-60 payment term — press the button to
            see what the playbook says about it.
          </span>
        </label>
        <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
          {pending ? "Reading the clause…" : "Check this clause"}
        </button>
      </form>

      {state.error && (
        <p
          className="measure mt-4 flex items-start gap-2 text-[13px] leading-[1.45]"
          style={{ color: "var(--color-oxblood)" }}
          role="alert"
        >
          <IconAlertTriangle size={18} />
          <span>{state.error}</span>
        </p>
      )}

      {!state.error && state.clauseLabel && (
        <div className="report-page measure mt-6 p-5">
          <div className="flex items-center gap-3">
            <SeverityChip severity={state.severity ?? "ok"} />
            <p className="t-title">{state.clauseLabel}</p>
          </div>
          <p className="t-data mt-2" style={{ color: "var(--color-text-2)" }}>
            {state.summary}
          </p>

          <blockquote className="quote mt-4">
            <p className="quote-text">{state.quote}</p>
            <p className="quote-cite">Your pasted clause · quoted back verbatim</p>
          </blockquote>

          <p className="t-body mt-4">{state.firedBecause}</p>

          <div className="mt-4">
            <div className="explain-section">
              <p className="t-label">What it says</p>
              <p className="t-body mt-1.5">{state.explanation}</p>
            </div>
            {state.forYou && (
              <div className="explain-section">
                <p className="t-label">What it means for you</p>
                <p className="t-body mt-1.5">{state.forYou}</p>
              </div>
            )}
            {state.market && (
              <div className="explain-section">
                <p className="t-label">Market</p>
                <p className="t-body mt-1.5">{state.market}</p>
              </div>
            )}
          </div>

          {state.suggested && (
            <div className="mt-5">
              <p className="t-label">Suggested wording</p>
              <p className="redline-suggested mt-2">{state.suggested}</p>
            </div>
          )}

          <p className="t-secondary mt-5" style={{ color: "var(--color-text-2)" }}>
            That is one clause. The contract in your inbox has about thirty, and the ones that
            cost money are rarely the ones you would stop to read.
          </p>
        </div>
      )}
    </section>
  );
}
