"use client";

/**
 * The rule editor (Studio). Three things are editable per rule: whether it runs, how severe
 * it is, and its numeric threshold where it has one.
 *
 * That is deliberately the whole surface. "We never accept non-competes" is this list with
 * one rule set to HIGH; a free-text rule builder would be a rule engine nobody can audit,
 * and auditability is the reason the scoring is deterministic in the first place.
 */

import { useState } from "react";
import { updateRuleAction } from "./actions";
import type { Severity } from "@/db/schema";

export interface EditableRule {
  id: string;
  ruleKey: string;
  title: string;
  clauseLabel: string;
  severityOnFail: Severity;
  enabled: boolean;
  threshold: number | null;
  thresholdUnit: string | null;
  /** The rule's condition in words — never a raw template with {{markers}}. */
  condition: string;
}

export function RuleEditor({ rule, editable }: { rule: EditableRule; editable: boolean }) {
  const [enabled, setEnabled] = useState(rule.enabled);
  const [severity, setSeverity] = useState<Severity>(rule.severityOnFail);
  const [threshold, setThreshold] = useState<string>(rule.threshold === null ? "" : String(rule.threshold));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (edit: { threshold?: number | null; enabled?: boolean; severityOnFail?: Severity }) => {
    setSaving(true);
    const result = await updateRuleAction(rule.id, edit);
    setError(result.error);
    setSaving(false);
  };

  return (
    <article className="hairline-b py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="t-title">{rule.title}</p>
          <p className="t-secondary" style={{ color: "var(--color-text-3)" }}>
            {rule.clauseLabel} · <span className="t-data">{rule.ruleKey}</span>
          </p>
        </div>
        {editable ? (
          <label className="flex items-center gap-2" style={{ minHeight: 44, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={enabled}
              disabled={saving}
              onChange={async (e) => {
                setEnabled(e.target.checked);
                await save({ enabled: e.target.checked });
              }}
              style={{ width: 20, height: 20, accentColor: "var(--color-oxblood)" }}
            />
            <span className="t-label">{enabled ? "On" : "Off"}</span>
          </label>
        ) : (
          <span className="chip" data-severity={rule.severityOnFail}>
            <span className="chip-dot" />
            {rule.severityOnFail}
          </span>
        )}
      </div>

      <p className="t-secondary mt-2">{rule.condition}</p>

      {editable && (
        <div className="mt-3 flex flex-wrap items-end gap-4">
          {rule.threshold !== null && (
            <label style={{ maxWidth: 160 }}>
              <span className="field-label">
                Threshold {rule.thresholdUnit ? `(${rule.thresholdUnit})` : ""}
              </span>
              <input
                className="input input-mono"
                type="number"
                inputMode="numeric"
                min={0}
                max={365}
                value={threshold}
                disabled={saving}
                onChange={(e) => setThreshold(e.target.value)}
                onBlur={async () => {
                  const value = threshold === "" ? null : Number(threshold);
                  if (value !== null && (Number.isNaN(value) || value < 0)) {
                    setError("Use a whole number of days.");
                    return;
                  }
                  await save({ threshold: value });
                }}
              />
            </label>
          )}
          <label style={{ maxWidth: 160 }}>
            <span className="field-label">Severity</span>
            <select
              className="input"
              value={severity}
              disabled={saving}
              onChange={async (e) => {
                const next = e.target.value as Severity;
                setSeverity(next);
                await save({ severityOnFail: next });
              }}
            >
              <option value="caution">Caution</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>
      )}

      {error && (
        <p className="t-secondary mt-2" style={{ color: "var(--color-oxblood)" }} role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
