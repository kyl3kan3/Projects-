"use client";

/**
 * The weekly review. Three questions, a discipline ring that fills one segment
 * per answered question, and a blue REVIEWED stamp when all three are in.
 *
 * The ring is blue and sober — DESIGN.md is explicit that it is not a flame.
 * Nothing about it is a reward; it is a record of a habit.
 */

import { useActionState, useState } from "react";
import { REVIEW_PROMPTS } from "@/lib/review-prompts";
import { saveReviewAction, type ReviewFormState } from "./actions";
import { IconAlert, IconCheck } from "@/components/icons";

export function ReviewForm({
  weekStart,
  initial,
  findingKind,
  completed,
}: {
  weekStart: string;
  initial: { wentWell: string; wentWrong: string; oneChange: string };
  findingKind: string | null;
  completed: boolean;
}) {
  const [state, formAction, pending] = useActionState<ReviewFormState, FormData>(
    saveReviewAction,
    {},
  );
  const [answers, setAnswers] = useState(initial);
  const answered = Object.values(answers).filter((value) => value.trim().length > 0).length;
  const isComplete = state.completed ?? completed;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="weekStart" value={weekStart} />
      {findingKind ? <input type="hidden" name="findingKind" value={findingKind} /> : null}

      <div className="flex items-center gap-4">
        <DisciplineRing answered={answered} total={REVIEW_PROMPTS.length} />
        <div>
          <p className="t-label">Discipline</p>
          <p className="t-secondary mt-1">
            {answered} of {REVIEW_PROMPTS.length} answered
            {isComplete ? " · this week is on the record" : ""}
          </p>
        </div>
        {isComplete ? (
          <span
            className="stamp chip chip-static ml-auto"
            data-active="true"
            aria-label="This week has been reviewed"
          >
            <IconCheck size={14} />
            Reviewed
          </span>
        ) : null}
      </div>

      {REVIEW_PROMPTS.map((prompt) => (
        <label key={prompt.field} className="flex flex-col gap-2">
          <span className="t-label">{prompt.label}</span>
          <textarea
            className="input ruled"
            name={prompt.field}
            value={answers[prompt.field]}
            onChange={(event) =>
              setAnswers((prev) => ({ ...prev, [prompt.field]: event.target.value }))
            }
            placeholder={prompt.hint}
          />
          <span className="t-secondary">{prompt.hint}</span>
        </label>
      ))}

      {state.error ? (
        <p className="t-secondary flex items-start gap-2" role="alert">
          <IconAlert size={14} className="mt-1 shrink-0" />
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p className="t-secondary" style={{ color: "var(--color-blue)" }} role="status">
          {state.completed ? "Week reviewed." : "Draft saved."}
        </p>
      ) : null}

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Saving…" : answered === REVIEW_PROMPTS.length ? "Complete the review" : "Save draft"}
      </button>
    </form>
  );
}

function DisciplineRing({ answered, total }: { answered: number; total: number }) {
  const size = 56;
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const filled = (answered / total) * circumference;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle
        className="ring-track"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={2}
      />
      <circle
        className="ring-fill"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={2}
        strokeLinecap="butt"
        strokeDasharray={circumference}
        strokeDashoffset={circumference - filled}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
