"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  previewTemplateAction,
  saveTemplateAction,
  type PreviewState,
  type SaveState,
} from "../actions";
import { COVERAGE_KINDS, COVERAGE_LABELS, formatCents, parseLimitToCents } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/compliance";
import { IconPlus } from "@/components/icons";
import type { CoverageKind, RequirementFlags, RequirementLine } from "@/db/schema";

const PREVIEW_INITIAL: PreviewState = { error: null, affected: null, checked: 0 };
const SAVE_INITIAL: SaveState = { error: null };

interface EditableLine {
  coverage: CoverageKind;
  label: string;
  /** As typed: "1,000,000", "$1M", "500k". Converted to cents on submit. */
  min: string;
}

export function TemplateEditor({
  templateId,
  initialName,
  initialNotes,
  initialLines,
  initialFlags,
  usage,
}: {
  templateId: string;
  initialName: string;
  initialNotes: string;
  initialLines: RequirementLine[];
  initialFlags: RequirementFlags;
  usage: number;
}) {
  const [name, setName] = useState(initialName);
  const [notes, setNotes] = useState(initialNotes);
  const [lines, setLines] = useState<EditableLine[]>(
    initialLines.length
      ? initialLines.map((l) => ({
          coverage: l.coverage,
          label: l.label,
          min: String(Math.round(l.minCents / 100)),
        }))
      : [{ coverage: "gl_each_occurrence", label: COVERAGE_LABELS.gl_each_occurrence, min: "1000000" }],
  );
  const [flags, setFlags] = useState<RequirementFlags>({
    additionalInsured: Boolean(initialFlags.additionalInsured),
    waiverOfSubrogation: Boolean(initialFlags.waiverOfSubrogation),
    primaryNonContributory: Boolean(initialFlags.primaryNonContributory),
  });

  const [preview, previewAction, previewing] = useActionState(
    previewTemplateAction,
    PREVIEW_INITIAL,
  );
  const [save, saveAction, saving] = useActionState(saveTemplateAction, SAVE_INITIAL);

  const parsed = useMemo(
    () =>
      lines.map((line) => ({
        coverage: line.coverage,
        label: line.label.trim() || COVERAGE_LABELS[line.coverage],
        minCents: parseLimitToCents(line.min),
      })),
    [lines],
  );

  const badLine = parsed.findIndex((l) => l.minCents == null || l.minCents <= 0);
  const draft = JSON.stringify({
    name,
    notes: notes.trim() || null,
    lines: parsed.map((l) => ({ ...l, minCents: l.minCents ?? 0 })),
    flags,
  });

  const setLine = (index: number, patch: Partial<EditableLine>) =>
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const unusedKinds = COVERAGE_KINDS.filter(
    (kind) => kind === "other" || !lines.some((l) => l.coverage === kind),
  );

  return (
    <div style={{ marginTop: 20, maxWidth: 640 }}>
      <div className="field">
        <label className="field-label" htmlFor="t-name">
          Template name
        </label>
        <input
          id="t-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Standard vendor"
        />
      </div>

      <fieldset style={{ marginTop: 24 }}>
        <legend className="t-h2">Required lines</legend>
        <p className="t-secondary" style={{ marginTop: 4, marginBottom: 12 }}>
          Each line is a coverage the vendor must evidence and the minimum limit it must carry. Type
          amounts however you like — 1,000,000, $1M and 1000000 all read the same.
        </p>

        {lines.map((line, i) => (
          <div key={i} className="hairline-b" style={{ padding: "12px 0" }}>
            <div className="field" style={{ marginBottom: 12 }}>
              <label className="field-label" htmlFor={`line-${i}-coverage`}>
                Coverage
              </label>
              <select
                id={`line-${i}-coverage`}
                className="input"
                value={line.coverage}
                onChange={(e) => {
                  const coverage = e.target.value as CoverageKind;
                  setLine(i, {
                    coverage,
                    label:
                      line.label === COVERAGE_LABELS[line.coverage]
                        ? COVERAGE_LABELS[coverage]
                        : line.label,
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
              <label className="field-label" htmlFor={`line-${i}-label`}>
                How it reads in the sentence
              </label>
              <input
                id={`line-${i}-label`}
                className="input"
                value={line.label}
                onChange={(e) => setLine(i, { label: e.target.value })}
              />
              <p className="field-help">
                Deficiencies quote this label verbatim: “{line.label.trim() || COVERAGE_LABELS[line.coverage]}{" "}
                $500,000 is below the required{" "}
                {formatCents(parsed[i]?.minCents ?? 0)}.”
              </p>
            </div>

            <div className="field" style={{ marginBottom: 8 }}>
              <label className="field-label" htmlFor={`line-${i}-min`}>
                Minimum limit
              </label>
              <input
                id={`line-${i}-min`}
                className="input input-mono"
                value={line.min}
                inputMode="decimal"
                onChange={(e) => setLine(i, { min: e.target.value })}
              />
              {parsed[i]?.minCents == null || (parsed[i]?.minCents ?? 0) <= 0 ? (
                <p className="field-error">
                  That is not an amount CertShield can read. Try 1,000,000 or $1M.
                </p>
              ) : (
                <p className="field-help">Reads as {formatCents(parsed[i].minCents)}.</p>
              )}
            </div>

            {lines.length > 1 && (
              <button
                type="button"
                className="btn-quiet"
                onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
              >
                Remove this line
              </button>
            )}
          </div>
        ))}

        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: 16 }}
          onClick={() =>
            setLines((prev) => [
              ...prev,
              {
                coverage: unusedKinds[0] ?? "other",
                label: COVERAGE_LABELS[unusedKinds[0] ?? "other"],
                min: "1000000",
              },
            ])
          }
        >
          <IconPlus size={18} />
          Add a line
        </button>
      </fieldset>

      <fieldset style={{ marginTop: 32 }}>
        <legend className="t-h2">Endorsement flags</legend>
        <label className="checkline" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={Boolean(flags.additionalInsured)}
            onChange={(e) => setFlags((f) => ({ ...f, additionalInsured: e.target.checked }))}
          />
          <span>
            <span className="t-body">Additional insured required</span>
            <span className="t-secondary" style={{ display: "block" }}>
              Checked against the ADDL INSD column on the general liability line.
            </span>
          </span>
        </label>
        <label className="checkline">
          <input
            type="checkbox"
            checked={Boolean(flags.waiverOfSubrogation)}
            onChange={(e) => setFlags((f) => ({ ...f, waiverOfSubrogation: e.target.checked }))}
          />
          <span>
            <span className="t-body">Waiver of subrogation required</span>
            <span className="t-secondary" style={{ display: "block" }}>
              Checked on general liability and workers&apos; compensation, the two lines contracts
              name.
            </span>
          </span>
        </label>
        <label className="checkline">
          <input
            type="checkbox"
            checked={Boolean(flags.primaryNonContributory)}
            onChange={(e) => setFlags((f) => ({ ...f, primaryNonContributory: e.target.checked }))}
          />
          <span>
            <span className="t-body">Primary and non-contributory required</span>
            <span className="t-secondary" style={{ display: "block" }}>
              Recorded for the file but <strong>not evaluated</strong>: an ACORD 25 has no box for it,
              and evidencing it needs the endorsement page, which CertShield does not read yet. No
              verdict will change because of this flag.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="field" style={{ marginTop: 32 }}>
        <label className="field-label" htmlFor="t-notes">
          Notes
        </label>
        <textarea
          id="t-notes"
          className="input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Matches section 9 of the 2026 vendor addendum."
        />
      </div>

      {/* The blast-radius preview: what saving would do, before it is saved. */}
      {templateId !== "new" && (
        <section style={{ marginTop: 32 }}>
          <h2 className="t-h2">Before you save</h2>
          <p className="t-secondary" style={{ marginTop: 4 }}>
            {usage} active engagement{usage === 1 ? "" : "s"} {usage === 1 ? "is" : "are"} held to this
            template. Check which verdicts this edit would flip.
          </p>
          <form action={previewAction} style={{ marginTop: 12 }}>
            <input type="hidden" name="templateId" value={templateId} />
            <input type="hidden" name="draft" value={draft} />
            <button
              type="submit"
              className="btn btn-secondary"
              disabled={previewing || badLine >= 0}
            >
              {previewing ? "Working it out…" : "Preview the impact"}
            </button>
          </form>

          {preview.error && (
            <p className="field-error" role="alert" style={{ marginTop: 12 }}>
              {preview.error}
            </p>
          )}

          {preview.affected && (
            <div style={{ marginTop: 16 }}>
              {preview.affected.length === 0 ? (
                <p className="t-secondary">
                  No verdict changes. {preview.checked} engagement
                  {preview.checked === 1 ? "" : "s"} checked.
                </p>
              ) : (
                <>
                  <p className="t-label">
                    {preview.affected.length} of {preview.checked} engagements would change
                  </p>
                  {preview.affected.map((row) => (
                    <div key={row.engagementId} className="hairline-b" style={{ padding: "12px 0" }}>
                      <p className="t-title">{row.vendorName}</p>
                      <p className="t-secondary">
                        {row.propertyName} · {STATUS_LABEL[row.from]} → {STATUS_LABEL[row.to]}
                      </p>
                      {row.newDeficiencies.map((d, i) => (
                        <p key={i} className="deficiency" style={{ marginTop: 4 }}>
                          {d.reason}
                        </p>
                      ))}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </section>
      )}

      <form action={saveAction} style={{ marginTop: 32 }}>
        <input type="hidden" name="templateId" value={templateId} />
        <input type="hidden" name="draft" value={draft} />
        {save.error && (
          <p className="field-error" role="alert" style={{ marginBottom: 12 }}>
            {save.error}
          </p>
        )}
        <div className="flex" style={{ gap: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={saving || badLine >= 0}>
            {saving ? "Saving…" : templateId === "new" ? "Create template" : "Save template"}
          </button>
          <Link href="/requirements" className="btn btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
