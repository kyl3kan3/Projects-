"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FIRST_AID_LIST,
  INTAKE_QUESTIONS,
  OSHA_PHONE,
  OSHA_PHONE_LABEL,
  OSHA_PORTAL,
  PRIVACY_CASE_REASONS,
  deriveRecordability,
  severeDuty,
  type IntakeQuestion,
  type RecordabilityAnswers,
  type Trilean,
} from "@/lib/incidents";
import type { Treatment } from "@/db/schema";
import { countdownLabel } from "@/lib/dates";
import { logIncidentAction, type IntakeResult } from "../actions";
import { IconAlertTriangle, IconCheck, IconChevronLeft, IconPhone } from "@/components/icons";

/**
 * One question per screen, per DESIGN.md: body-size question, 52px option
 * buttons, the rule text cited underneath, progress as mono "4/20" — never a
 * percent bar.
 *
 * Two things are deliberate. The severe-answer interstitial appears the moment a
 * fatality, hospitalisation, amputation or eye loss is entered, not at the end:
 * the 8-hour clock is already running while someone finishes typing. And the
 * review screen shows the recordability decision *with its citation* before
 * anything is saved, because a classification the user cannot check is a
 * classification they cannot defend.
 */

export interface Employee {
  id: string;
  name: string;
  jobTitle: string | null;
}

type Answers = Record<string, string>;

const INITIAL: IntakeResult = { error: null, message: null, incidentId: null };

export function IntakeWizard({
  employees,
  defaultSite,
  now,
}: {
  employees: Employee[];
  defaultSite: string;
  now: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({
    occurredAt: now,
    learnedAt: now,
    siteLabel: defaultSite,
    illnessCategory: "injury",
    workRelated: "yes",
    daysAway: "0",
    daysRestricted: "0",
    stillCounting: "no",
    lostConsciousness: "no",
    significantDiagnosis: "unsure",
    amputationOrEyeLoss: "no",
    privacyCase: "",
  });
  const [showDuty, setShowDuty] = useState(false);
  // Shown once per intake: the same hospitalisation must not stop the flow again
  // at the next question.
  const [dutyAcknowledged, setDutyAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<IntakeResult>(INITIAL);

  const question = INTAKE_QUESTIONS[step];
  const set = (id: string, value: string) => setAnswers((prev) => ({ ...prev, [id]: value }));

  const decision = useMemo(
    () => deriveRecordability(toAnswers(answers)),
    [answers],
  );
  const duty = useMemo(
    () =>
      severeDuty(
        {
          treatment: (answers.treatment ?? "none") as Treatment,
          amputationOrEyeLoss: answers.amputationOrEyeLoss === "yes",
        },
        new Date(answers.learnedAt || now),
      ),
    [answers.treatment, answers.amputationOrEyeLoss, answers.learnedAt, now],
  );

  /**
   * Advance, taking the answers explicitly.
   *
   * The option buttons answer and advance in one tap, which means the decision
   * about whether to show the reporting-duty screen has to be made from the value
   * just picked — not from `answers` as it was when this render closed over it. A
   * stale read there is a fatality intake that never shows the 8-hour clock.
   */
  const advance = (merged: Answers = answers) => {
    const triggersDuty = question.id === "treatment" || question.id === "amputationOrEyeLoss";
    if (triggersDuty && !showDuty && !dutyAcknowledged) {
      const pending = severeDuty(
        {
          treatment: (merged.treatment ?? "none") as Treatment,
          amputationOrEyeLoss: merged.amputationOrEyeLoss === "yes",
        },
        new Date(merged.learnedAt || now),
      );
      if (pending.required) {
        setShowDuty(true);
        return;
      }
    }
    setStep((s) => Math.min(s + 1, INTAKE_QUESTIONS.length - 1));
  };

  const back = () => {
    if (showDuty) {
      setShowDuty(false);
      return;
    }
    setStep((s) => Math.max(s - 1, 0));
  };

  const canAdvance = (() => {
    if (question.optional) return true;
    switch (question.kind) {
      case "review":
        return true;
      case "privacy":
        return true;
      case "number":
        return answers[question.id] !== undefined && answers[question.id] !== "";
      default:
        return Boolean(answers[question.id]);
    }
  })();

  async function submit() {
    setSaving(true);
    const form = new FormData();
    for (const [key, value] of Object.entries(answers)) form.set(key, value);
    const res = await logIncidentAction(INITIAL, form);
    setResult(res);
    setSaving(false);
    if (res.incidentId) router.push(`/incidents/${res.incidentId}`);
  }

  if (showDuty && duty.required) {
    return (
      <DutyScreen
        duty={duty}
        learnedAt={answers.learnedAt || now}
        onContinue={() => {
          setShowDuty(false);
          setDutyAcknowledged(true);
          setStep((s) => Math.min(s + 1, INTAKE_QUESTIONS.length - 1));
        }}
      />
    );
  }

  return (
    <div className="pb-28">
      <div className="flex items-center justify-between pt-2">
        <button type="button" className="btn-quiet" onClick={back} disabled={step === 0}>
          <IconChevronLeft size={16} />
          Back
        </button>
        <span className="t-data" style={{ color: "var(--color-fg-3)" }}>
          {step + 1}/{INTAKE_QUESTIONS.length}
        </span>
      </div>

      <h2 className="t-body mt-6" style={{ fontSize: 20, lineHeight: 1.35, fontWeight: 600 }}>
        {question.prompt}
      </h2>
      {question.help ? <p className="t-secondary mt-3">{question.help}</p> : null}
      {question.citation ? (
        <p className="t-data mt-2" style={{ color: "var(--color-fg-3)" }}>
          {question.citation}
        </p>
      ) : null}

      <div className="mt-6">
        <Field
          question={question}
          value={answers[question.id] ?? ""}
          employees={employees}
          onChange={(v) => set(question.id, v)}
          onPick={(v) => {
            const merged = { ...answers, [question.id]: v };
            setAnswers(merged);
            // A tap on a big option button is the answer; do not make them then
            // hunt for Next.
            window.setTimeout(() => advance(merged), 90);
          }}
          decision={decision}
          answers={answers}
          employeeName={employees.find((e) => e.id === answers.employeeId)?.name ?? ""}
        />
      </div>

      {question.kind === "review" ? (
        <div className="mt-8">
          {result.error ? (
            <p className="t-secondary msg msg-error mb-3" role="alert">
              {result.error}
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn-primary btn-full"
            onClick={submit}
            disabled={saving}
          >
            {saving ? "Recording…" : "Record this case"}
          </button>
          <p className="t-secondary mt-3">
            SafetyDeck is recordkeeping software, not legal advice. The determination above
            comes from the cited paragraphs; if a case is close, check it against the rule or
            ask your OSHA consultation program.
          </p>
        </div>
      ) : (
        <div className="thumb-cta">
          <button
            type="button"
            className="btn btn-primary btn-full"
            onClick={() => advance()}
            disabled={!canAdvance}
          >
            {question.optional && !answers[question.id] ? "Skip" : "Next"}
          </button>
        </div>
      )}
    </div>
  );
}

function Field({
  question,
  value,
  employees,
  onChange,
  onPick,
  decision,
  answers,
  employeeName,
}: {
  question: IntakeQuestion;
  value: string;
  employees: Employee[];
  onChange: (v: string) => void;
  onPick: (v: string) => void;
  decision: ReturnType<typeof deriveRecordability>;
  answers: Answers;
  employeeName: string;
}) {
  switch (question.kind) {
    case "employee":
      return (
        <div>
          {employees.map((e) => (
            <button
              key={e.id}
              type="button"
              className="row"
              onClick={() => onPick(e.id)}
              style={{ borderLeft: value === e.id ? "2px solid var(--color-hardhat)" : undefined, paddingLeft: value === e.id ? 12 : 0 }}
            >
              <span className="min-w-0 flex-1">
                <span className="t-title block">{e.name}</span>
                <span className="t-secondary block">{e.jobTitle ?? "Job title not set"}</span>
              </span>
              {value === e.id ? <IconCheck size={18} style={{ color: "var(--color-hardhat)" }} /> : null}
            </button>
          ))}
          {employees.length === 0 ? (
            <p className="t-secondary">
              Nobody is on the roster yet. Add the field employees in Settings first — the log
              needs their job title.
            </p>
          ) : null}
        </div>
      );

    case "datetime":
      return (
        <input
          type="datetime-local"
          className="input input-mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "text":
      return (
        <input
          className="input"
          value={value}
          placeholder={question.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "longtext":
      return (
        <textarea
          className="input"
          rows={7}
          value={value}
          placeholder={question.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "number":
      return (
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={0}
            className="input input-mono"
            style={{ maxWidth: 140 }}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="t-secondary">{question.suffix}</span>
        </div>
      );

    case "choice":
      return (
        <div className="flex flex-col gap-3">
          {(question.options ?? []).map((option) => (
            <button
              key={option.value}
              type="button"
              className="btn btn-secondary"
              onClick={() => onPick(option.value)}
              style={{
                height: "auto",
                minHeight: 52,
                padding: "12px 16px",
                textAlign: "left",
                justifyContent: "flex-start",
                borderColor: value === option.value ? "var(--color-hardhat)" : undefined,
              }}
            >
              <span className="flex flex-col items-start gap-1">
                <span className="t-title">{option.label}</span>
                {option.detail ? (
                  <span className="t-secondary" style={{ whiteSpace: "normal" }}>
                    {option.detail}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
          {question.id === "treatment" ? (
            <details className="mt-2 rule-t pt-4">
              <summary className="t-label" style={{ cursor: "pointer" }}>
                The full first-aid list — 1904.7(b)(5)(ii)
              </summary>
              <ul className="mt-3">
                {FIRST_AID_LIST.map((item) => (
                  <li key={item} className="t-secondary flex gap-2 py-1">
                    <span style={{ color: "var(--color-fg-3)" }}>—</span>
                    {item}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      );

    case "trilean":
      return (
        <div className="flex flex-col gap-3">
          {(
            [
              { v: "yes", label: "Yes" },
              { v: "no", label: "No" },
              { v: "unsure", label: "Not sure" },
            ] as { v: Trilean; label: string }[]
          ).map((option) => (
            <button
              key={option.v}
              type="button"
              className="btn btn-secondary"
              onClick={() => onPick(option.v)}
              style={{
                minHeight: 52,
                justifyContent: "flex-start",
                borderColor: value === option.v ? "var(--color-hardhat)" : undefined,
              }}
            >
              {option.label}
              {option.v === "unsure" ? (
                <span className="t-secondary ml-2">— we keep the case on the log until you know</span>
              ) : null}
            </button>
          ))}
        </div>
      );

    case "privacy":
      return (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onPick("")}
            style={{ minHeight: 52, justifyContent: "flex-start", borderColor: value === "" ? "var(--color-hardhat)" : undefined }}
          >
            No — the name goes on the log
          </button>
          {PRIVACY_CASE_REASONS.map((reason) => (
            <button
              key={reason.id}
              type="button"
              className="btn btn-secondary"
              onClick={() => onPick(reason.id)}
              style={{
                height: "auto",
                minHeight: 52,
                padding: "12px 16px",
                textAlign: "left",
                justifyContent: "flex-start",
                borderColor: value === reason.id ? "var(--color-hardhat)" : undefined,
              }}
            >
              <span className="t-title" style={{ whiteSpace: "normal" }}>
                {reason.label}
              </span>
            </button>
          ))}
        </div>
      );

    case "review":
      return (
        <div>
          <div
            className="panel p-5"
            style={{
              borderLeft: `2px solid ${
                decision.recordable
                  ? decision.needsJudgment
                    ? "var(--color-orange)"
                    : "var(--color-red)"
                  : "var(--color-green)"
              }`,
            }}
          >
            <p className="t-label">Recordability</p>
            <p className="t-h2 mt-1">
              {decision.recordable
                ? decision.needsJudgment
                  ? "Recordable — needs review"
                  : "Recordable"
                : "Not recordable"}
            </p>
            <p className="t-data mt-2" style={{ color: "var(--color-fg-3)" }}>
              {decision.criterion.toUpperCase()} · {decision.citation}
            </p>
            <p className="t-secondary mt-3">{decision.explanation}</p>
          </div>

          <dl className="mt-6">
            <Line label="Who" value={employeeName || "—"} />
            <Line label="When" value={answers.occurredAt?.replace("T", " ") ?? "—"} />
            <Line label="Site" value={answers.siteLabel ?? "—"} />
            <Line label="Injury" value={answers.injuryType ?? "—"} />
            <Line label="Treatment" value={answers.treatment ?? "—"} />
            <Line
              label="Days away / restricted"
              value={`${decision.cappedDaysAway} / ${decision.cappedDaysRestricted}`}
            />
            <Line
              label="On the 300 log as"
              value={
                decision.outcome
                  ? {
                      death: "(G) Death",
                      days_away: "(H) Days away from work",
                      restricted: "(I) Job transfer or restriction",
                      other_recordable: "(J) Other recordable case",
                    }[decision.outcome]
                  : "Not on the log"
              }
            />
            <Line
              label="Name on the log"
              value={answers.privacyCase ? "Privacy Case — 1904.29(b)(7)" : employeeName || "—"}
            />
          </dl>
          {Number(answers.daysAway ?? 0) + Number(answers.daysRestricted ?? 0) > 180 ? (
            <p className="t-secondary msg msg-note mt-4">
              Day counts are capped at 180 combined, per 1904.7(b)(3)(vii). That is why the
              numbers above are lower than what you entered.
            </p>
          ) : null}
        </div>
      );
  }
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="rule-b flex items-baseline justify-between gap-4 py-3">
      <dt className="t-label">{label}</dt>
      <dd className="t-data text-right">{value}</dd>
    </div>
  );
}

function DutyScreen({
  duty,
  learnedAt,
  onContinue,
}: {
  duty: Extract<ReturnType<typeof severeDuty>, { required: true }>;
  learnedAt: string;
  onContinue: () => void;
}) {
  const deadline = duty.deadline;
  const remaining = countdownLabel(deadline, new Date());
  return (
    <div className="pb-28">
      <div className="mt-6 flex items-center gap-3">
        <IconAlertTriangle size={24} style={{ color: "var(--color-red)" }} />
        <p className="t-label" style={{ color: "var(--color-fg)" }}>
          {duty.hours}-hour reporting duty
        </p>
      </div>
      <h2 className="t-h2 mt-3">You have to notify OSHA yourself.</h2>
      <p className="t-body mt-3" style={{ color: "var(--color-fg-2)" }}>
        {duty.reason} starts a {duty.hours}-hour duty to report under {duty.citation}. The clock
        runs from when the company found out, which you entered as{" "}
        {learnedAt.replace("T", " ")}.
      </p>

      <div className="panel mt-6 p-5" style={{ borderLeft: "2px solid var(--color-red)" }}>
        <p className="t-label">Deadline</p>
        <p className="t-stat mt-1">{remaining}</p>
        <p className="t-data mt-2" style={{ color: "var(--color-fg-3)" }}>
          {deadline.toISOString().slice(0, 16).replace("T", " ")} UTC
        </p>
      </div>

      <div className="mt-6">
        <a className="row" href={`tel:${OSHA_PHONE}`}>
          <IconPhone size={20} style={{ color: "var(--color-hardhat)" }} />
          <span className="min-w-0 flex-1">
            <span className="t-title block">Call the 24-hour hotline</span>
            <span className="t-data block" style={{ color: "var(--color-fg-3)" }}>
              {OSHA_PHONE_LABEL}
            </span>
          </span>
        </a>
        <a className="row" href={OSHA_PORTAL} target="_blank" rel="noreferrer">
          <span className="min-w-0 flex-1">
            <span className="t-title block">Report online</span>
            <span className="t-secondary block">osha.gov/report</span>
          </span>
        </a>
      </div>

      <p className="t-secondary mt-5">{duty.note}</p>

      <div className="thumb-cta">
        <button type="button" className="btn btn-primary btn-full" onClick={onContinue}>
          Continue the intake
        </button>
      </div>
    </div>
  );
}

function toAnswers(a: Answers): RecordabilityAnswers {
  return {
    workRelated: (a.workRelated ?? "yes") as Trilean,
    treatment: (a.treatment ?? "none") as Treatment,
    daysAway: Number(a.daysAway ?? 0) || 0,
    daysRestricted: Number(a.daysRestricted ?? 0) || 0,
    lostConsciousness: (a.lostConsciousness ?? "no") as Trilean,
    significantDiagnosis: (a.significantDiagnosis ?? "no") as Trilean,
    amputationOrEyeLoss: a.amputationOrEyeLoss === "yes",
  };
}
