"use client";

import { useActionState, useState } from "react";
import { confirmReviewAction, type ReviewState } from "./actions";
import { COVERAGE_KINDS, COVERAGE_LABELS, formatCents, parseLimitToCents } from "@/lib/format";
import { IconPlus } from "@/components/icons";
import type { CoverageKind } from "@/db/schema";

const INITIAL: ReviewState = { error: null };

export interface ReviewLineDraft {
  id: string | null;
  kind: CoverageKind;
  label: string;
  min: string;
  policyNumber: string;
  effectiveOn: string;
  expiresOn: string;
  additionalInsured: "yes" | "no" | "unknown";
  waiverOfSubrogation: "yes" | "no" | "unknown";
  /** Fields the parser was unsure about, so the editor can underline them. */
  lowConfidence: string[];
  confidence: Record<string, number>;
}

/**
 * The right-hand side of the review split view: the parsed fields, editable, with
 * every low-confidence field underlined in `pending` and its actual confidence
 * printed beside it. Confidence is shown as a number, not a vibe — a reviewer
 * deciding whether to trust a date deserves to know it scored 68.
 */
export function ReviewForm({
  certificateId,
  vendorName,
  carrier,
  producer,
  holderName,
  holderOk,
  expectedHolder,
  certificateConfidence,
  certificateLowConfidence,
  initialLines,
  parseError,
}: {
  certificateId: string;
  vendorName: string;
  carrier: string;
  producer: string;
  holderName: string;
  holderOk: boolean;
  expectedHolder: string;
  certificateConfidence: Record<string, number>;
  certificateLowConfidence: string[];
  initialLines: ReviewLineDraft[];
  parseError: string | null;
}) {
  const [state, action, pending] = useActionState(confirmReviewAction, INITIAL);
  const [lines, setLines] = useState<ReviewLineDraft[]>(
    initialLines.length ? initialLines : [blankLine()],
  );

  const setLine = (index: number, patch: Partial<ReviewLineDraft>) =>
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const lowClass = (line: ReviewLineDraft, field: string) =>
    line.lowConfidence.includes(field) ? "input low-confidence" : "input";

  const conf = (values: Record<string, number>, field: string) =>
    values[field] === undefined ? null : `${values[field]}%`;

  return (
    <form action={action}>
      <input type="hidden" name="certificateId" value={certificateId} />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />

      {parseError && (
        <div className="panel" style={{ padding: 16, marginBottom: 20 }}>
          <p className="t-label" style={{ color: "var(--color-claim)" }}>
            The parser could not read this document
          </p>
          <p className="deficiency" style={{ marginTop: 6 }}>
            {parseError}
          </p>
          <p className="t-secondary" style={{ marginTop: 8 }}>
            The PDF is on file and shown beside this form. Enter the coverage by hand, or leave it
            unconfirmed — it stays on file either way, and the vendor stays non-compliant until a
            certificate is confirmed.
          </p>
        </div>
      )}

      <p className="t-label">Certificate for</p>
      <p className="t-title" style={{ marginBottom: 16 }}>
        {vendorName}
      </p>

      <div className="field">
        <label className="field-label" htmlFor="carrier">
          Carrier {conf(certificateConfidence, "carrier") && `· read at ${conf(certificateConfidence, "carrier")}`}
        </label>
        <input
          id="carrier"
          name="carrier"
          defaultValue={carrier}
          className={certificateLowConfidence.includes("carrier") ? "input low-confidence" : "input"}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="producer">
          Producer {conf(certificateConfidence, "producer") && `· read at ${conf(certificateConfidence, "producer")}`}
        </label>
        <input
          id="producer"
          name="producer"
          defaultValue={producer}
          className={certificateLowConfidence.includes("producer") ? "input low-confidence" : "input"}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="holderName">
          Certificate holder {conf(certificateConfidence, "holder") && `· read at ${conf(certificateConfidence, "holder")}`}
        </label>
        <input
          id="holderName"
          name="holderName"
          defaultValue={holderName}
          className={certificateLowConfidence.includes("holder") ? "input low-confidence" : "input"}
        />
        <p className="field-help">Your contracts require it to read {expectedHolder}.</p>
      </div>

      <label className="checkline" style={{ marginBottom: 16 }}>
        <input type="checkbox" name="holderOk" defaultChecked={holderOk} />
        <span className="t-body">The holder named above satisfies our requirement</span>
      </label>

      <h3 className="t-h2" style={{ marginTop: 24 }}>
        Coverage lines
      </h3>
      <p className="t-secondary" style={{ marginTop: 4, marginBottom: 12 }}>
        Underlined fields are the ones the parser was unsure about. Everything you confirm is recorded
        as read by a person.
      </p>

      {lines.map((line, i) => (
        <fieldset key={i} className="hairline-b" style={{ padding: "12px 0" }}>
          <legend className="t-label">
            Line {i + 1}
            {line.confidence.limitCents !== undefined
              ? ` · lowest field ${Math.min(...Object.values(line.confidence))}%`
              : ""}
          </legend>

          <div className="field" style={{ marginBottom: 12 }}>
            <label className="field-label" htmlFor={`r-${i}-kind`}>
              Coverage
            </label>
            <select
              id={`r-${i}-kind`}
              className="input"
              value={line.kind}
              onChange={(e) => {
                const kind = e.target.value as CoverageKind;
                setLine(i, {
                  kind,
                  label: line.label === COVERAGE_LABELS[line.kind] ? COVERAGE_LABELS[kind] : line.label,
                });
              }}
            >
              {COVERAGE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {COVERAGE_LABELS[kind]}
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label className="field-label" htmlFor={`r-${i}-min`}>
              Limit {conf(line.confidence, "limitCents") && `· read at ${conf(line.confidence, "limitCents")}`}
            </label>
            <input
              id={`r-${i}-min`}
              className={`${lowClass(line, "limitCents")} input-mono`}
              value={line.min}
              inputMode="decimal"
              onChange={(e) => setLine(i, { min: e.target.value })}
              placeholder="1,000,000"
            />
            <p className="field-help">
              {line.min.trim()
                ? parseLimitToCents(line.min) == null
                  ? "Not an amount CertShield can read."
                  : `Reads as ${formatCents(parseLimitToCents(line.min))}.`
                : "Blank means the form shows no limit — the engine will say so."}
            </p>
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label className="field-label" htmlFor={`r-${i}-policy`}>
              Policy number {conf(line.confidence, "policyNumber") && `· read at ${conf(line.confidence, "policyNumber")}`}
            </label>
            <input
              id={`r-${i}-policy`}
              className={`${lowClass(line, "policyNumber")} input-mono`}
              value={line.policyNumber}
              onChange={(e) => setLine(i, { policyNumber: e.target.value })}
            />
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label className="field-label" htmlFor={`r-${i}-eff`}>
              Effective {conf(line.confidence, "effectiveOn") && `· read at ${conf(line.confidence, "effectiveOn")}`}
            </label>
            <input
              id={`r-${i}-eff`}
              type="date"
              className={`${lowClass(line, "effectiveOn")} input-mono`}
              value={line.effectiveOn}
              onChange={(e) => setLine(i, { effectiveOn: e.target.value })}
            />
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label className="field-label" htmlFor={`r-${i}-exp`}>
              Expires {conf(line.confidence, "expiresOn") && `· read at ${conf(line.confidence, "expiresOn")}`}
            </label>
            <input
              id={`r-${i}-exp`}
              type="date"
              className={`${lowClass(line, "expiresOn")} input-mono`}
              value={line.expiresOn}
              onChange={(e) => setLine(i, { expiresOn: e.target.value })}
            />
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label className="field-label" htmlFor={`r-${i}-ai`}>
              Additional insured {conf(line.confidence, "additionalInsured") && `· read at ${conf(line.confidence, "additionalInsured")}`}
            </label>
            <select
              id={`r-${i}-ai`}
              className={lowClass(line, "additionalInsured")}
              value={line.additionalInsured}
              onChange={(e) =>
                setLine(i, { additionalInsured: e.target.value as ReviewLineDraft["additionalInsured"] })
              }
            >
              <option value="yes">Yes — the column reads Y</option>
              <option value="no">No — the column reads N</option>
              <option value="unknown">The form does not say</option>
            </select>
          </div>

          <div className="field" style={{ marginBottom: 8 }}>
            <label className="field-label" htmlFor={`r-${i}-wos`}>
              Waiver of subrogation {conf(line.confidence, "waiverOfSubrogation") && `· read at ${conf(line.confidence, "waiverOfSubrogation")}`}
            </label>
            <select
              id={`r-${i}-wos`}
              className={lowClass(line, "waiverOfSubrogation")}
              value={line.waiverOfSubrogation}
              onChange={(e) =>
                setLine(i, {
                  waiverOfSubrogation: e.target.value as ReviewLineDraft["waiverOfSubrogation"],
                })
              }
            >
              <option value="yes">Yes — the column reads Y</option>
              <option value="no">No — the column reads N</option>
              <option value="unknown">The form does not say</option>
            </select>
          </div>

          {lines.length > 1 && (
            <button
              type="button"
              className="btn-quiet"
              onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
            >
              Remove — this line is not on the form
            </button>
          )}
        </fieldset>
      ))}

      <button
        type="button"
        className="btn btn-secondary"
        style={{ marginTop: 16 }}
        onClick={() => setLines((prev) => [...prev, blankLine()])}
      >
        <IconPlus size={18} />
        Add a line the parser missed
      </button>

      {state.error && (
        <p className="field-error" role="alert" style={{ marginTop: 16 }}>
          {state.error}
        </p>
      )}

      <div style={{ marginTop: 24 }}>
        <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
          {pending ? "Confirming…" : "Confirm and evaluate"}
        </button>
        <p className="field-help">
          Confirming puts this certificate into compliance and re-evaluates every engagement for this
          vendor. Your name and the time are recorded against it.
        </p>
      </div>
    </form>
  );
}

function blankLine(): ReviewLineDraft {
  return {
    id: null,
    kind: "gl_each_occurrence",
    label: COVERAGE_LABELS.gl_each_occurrence,
    min: "",
    policyNumber: "",
    effectiveOn: "",
    expiresOn: "",
    additionalInsured: "unknown",
    waiverOfSubrogation: "unknown",
    lowConfidence: [],
    confidence: {},
  };
}
