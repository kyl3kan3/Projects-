"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { generateAnswersAction, saveAnswer, type AnswersState, type SaveAnswerState } from "./actions";
import { CopyButton } from "@/components/CopyButton";
import { IconThread } from "@/components/icons";

/**
 * The answer bank.
 *
 * An answer row: framework tag, the question, the generated answer on a sheet, the source
 * refs in mono beneath, and Copy as a quiet action. The operator can add a tone note —
 * their own sentence about their own business — which is appended on copy and stored
 * separately, so regenerating never destroys it and editing can never move a figure.
 */

export interface AnswerView {
  id: string;
  tag: string;
  question: string;
  answerText: string;
  toneNote: string;
  status: "draft" | "ready";
  refs: { kind: string; label: string; detail: string }[];
}

export function AnswerList({
  frameworks,
  active,
  answers,
  readyCount,
}: {
  frameworks: { id: "cdp_style" | "ecovadis_style"; label: string; count: number }[];
  active: "cdp_style" | "ecovadis_style";
  answers: AnswerView[];
  readyCount: number;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<AnswersState, FormData>(
    generateAnswersAction,
    {},
  );

  return (
    <>
      <div className="chip-row mt-4">
        {frameworks.map((f) => (
          <button
            key={f.id}
            type="button"
            className="chip"
            data-active={active === f.id}
            onClick={() => router.push(`/answers?framework=${f.id}`)}
          >
            {f.label} <span className="t-mono">{f.count}</span>
          </button>
        ))}
      </div>

      <p className="t-data mt-4" style={{ color: "var(--color-fg-2)" }}>
        READY {readyCount} OF {answers.length}
      </p>

      <form action={action} className="mt-4">
        <input type="hidden" name="framework" value={active} />
        <button type="submit" className="btn btn-secondary btn-full" disabled={pending}>
          {pending
            ? "Writing…"
            : answers.length === 0
              ? "Generate the answers"
              : "Refresh from the current figures"}
        </button>
      </form>

      {state.error && (
        <p className="t-secondary mt-3" role="alert" style={{ color: "var(--color-red)" }}>
          {state.error}
        </p>
      )}
      {state.notice && (
        <p className="t-secondary mt-3" aria-live="polite">
          {state.notice}
        </p>
      )}

      <div className="mt-6">
        {answers.map((a) => (
          <AnswerRow key={a.id} answer={a} />
        ))}
      </div>
    </>
  );
}

function AnswerRow({ answer }: { answer: AnswerView }) {
  const [state, action, pending] = useActionState<SaveAnswerState, FormData>(saveAnswer, {});
  const [tone, setTone] = useState(answer.toneNote);
  const [showRefs, setShowRefs] = useState(false);
  const full = tone.trim() ? `${answer.answerText}\n\n${tone.trim()}` : answer.answerText;

  return (
    <section className="row-plain">
      <div className="flex items-baseline justify-between gap-3">
        <p className="t-label">{answer.tag}</p>
        <p
          className="t-data"
          style={{
            color:
              answer.status === "ready" ? "var(--color-accent-text)" : "var(--color-fg-2)",
          }}
        >
          {answer.status === "ready" ? "READY" : "DRAFT"}
        </p>
      </div>

      <p className="t-title mt-2" style={{ maxWidth: "56ch" }}>
        {answer.question}
      </p>

      <div className="panel mt-3 p-4">
        <p className="t-body" style={{ whiteSpace: "pre-wrap", maxWidth: "62ch" }}>
          {answer.answerText}
        </p>
        {tone.trim() && (
          <p className="t-body mt-3" style={{ whiteSpace: "pre-wrap", maxWidth: "62ch" }}>
            {tone.trim()}
          </p>
        )}
      </div>

      <div className="mt-2 flex items-center gap-5">
        <CopyButton text={full} label="Copy answer" />
        {answer.refs.length > 0 && (
          <button
            type="button"
            className="btn-quiet inline-flex items-center gap-2"
            onClick={() => setShowRefs((s) => !s)}
            aria-expanded={showRefs}
          >
            <IconThread size={16} />
            {showRefs ? "Hide sources" : `Sources (${answer.refs.length})`}
          </button>
        )}
      </div>

      {showRefs && (
        <ul className="mt-2">
          {answer.refs.map((r, i) => (
            <li key={`${r.label}-${i}`} className="t-data mt-1" style={{ color: "var(--color-fg-2)" }}>
              {r.label} — {r.detail}
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="mt-4">
        <input type="hidden" name="answerId" value={answer.id} />
        <label className="field">
          <span className="t-label">Your own sentence (optional)</span>
          <textarea
            name="toneNote"
            className="input"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            placeholder="Our Brooklyn shop runs a second shift from March to October, which is why Q2 and Q3 are higher."
            style={{ minHeight: 88 }}
          />
        </label>
        <p className="t-secondary mt-2" style={{ maxWidth: "52ch" }}>
          Added after the generated answer. The figures above come from your computed
          footprint and cannot be edited here — that is what makes them defensible.
        </p>
        <label className="mt-3 flex items-center gap-3">
          <input
            type="checkbox"
            name="ready"
            defaultChecked={answer.status === "ready"}
            style={{ width: 20, height: 20, accentColor: "var(--color-moss)" }}
          />
          <span className="t-body">Mark as ready to paste</span>
        </label>
        {state.error && (
          <p className="t-secondary mt-2" role="alert" style={{ color: "var(--color-red)" }}>
            {state.error}
          </p>
        )}
        <button type="submit" className="btn btn-secondary mt-3" disabled={pending}>
          {pending ? "Saving…" : state.savedId === answer.id ? "Saved" : "Save"}
        </button>
      </form>
    </section>
  );
}
