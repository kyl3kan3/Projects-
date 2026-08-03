"use client";

import { useActionState, useState } from "react";
import { Icon } from "@/components/icons";
import { count } from "@/lib/format";
import { CHASE_BUCKETS, bucketLabel } from "@/lib/recall";
import { lintCopy } from "@/lib/merge";
import type { CampaignState } from "../actions";

export interface TemplateOption {
  id: string;
  name: string;
  channel: "email" | "sms" | "call";
  subject: string | null;
  body: string;
}

/**
 * The segment-and-sequence builder. Two decisions on one screen because they are
 * one decision: who, and what they receive.
 *
 * The plan gate is enforced server-side, but shown here — an SMS step on Chairside
 * is disabled with the reason on it rather than accepted and then refused, which is
 * how a practice ends up believing a text went out.
 */
export function CampaignBuilder({
  templates,
  smsAllowed,
  smsReason,
  maxSteps,
  bucketCounts,
  defaultBuckets,
  action,
}: {
  templates: TemplateOption[];
  smsAllowed: boolean;
  smsReason: string;
  maxSteps: number;
  bucketCounts: Record<string, number>;
  defaultBuckets: string[];
  action: (state: CampaignState, formData: FormData) => Promise<CampaignState>;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [buckets, setBuckets] = useState<string[]>(
    defaultBuckets.length ? defaultBuckets : ["m6_12"],
  );
  const emailTemplates = templates.filter((t) => t.channel === "email");
  const smsTemplates = templates.filter((t) => t.channel === "sms");

  const [steps, setSteps] = useState<{ channel: "email" | "sms"; templateId: string; offset: number }[]>([
    { channel: "email", templateId: emailTemplates[0]?.id ?? "", offset: 0 },
    { channel: "email", templateId: emailTemplates[1]?.id ?? emailTemplates[0]?.id ?? "", offset: 7 },
  ]);

  const selectedCount = buckets.reduce((n, b) => n + (bucketCounts[b] ?? 0), 0);

  const toggleBucket = (bucket: string) => {
    setBuckets((current) =>
      current.includes(bucket)
        ? current.filter((b) => b !== bucket).length
          ? current.filter((b) => b !== bucket)
          : current
        : [...current, bucket],
    );
  };

  const setStep = (index: number, patch: Partial<{ channel: "email" | "sms"; templateId: string; offset: number }>) => {
    setSteps((current) =>
      current.map((step, i) => {
        if (i !== index) return step;
        const next = { ...step, ...patch };
        if (patch.channel) {
          const pool = patch.channel === "sms" ? smsTemplates : emailTemplates;
          next.templateId = pool[0]?.id ?? "";
        }
        return next;
      }),
    );
  };

  return (
    <form action={formAction} style={{ display: "grid", gap: 24 }}>
      <input type="hidden" name="buckets" value={buckets.join(",")} />

      <label style={{ display: "grid", gap: 6 }}>
        <span className="t-label">Campaign name</span>
        <input className="input" name="name" required defaultValue="6–12 month winback" />
      </label>

      <section>
        <p className="t-label" style={{ margin: "0 0 8px" }}>
          Segment
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {CHASE_BUCKETS.map((bucket) => (
            <button
              key={bucket}
              type="button"
              className="chip chip-lg"
              data-active={buckets.includes(bucket)}
              aria-pressed={buckets.includes(bucket)}
              onClick={() => toggleBucket(bucket)}
            >
              {bucketLabel(bucket)}
              <span className="t-mono" style={{ color: "var(--color-ink-2)" }}>
                {count(bucketCounts[bucket] ?? 0)}
              </span>
            </button>
          ))}
        </div>
        <p className="t-secondary" style={{ margin: "8px 0 0" }}>
          {count(selectedCount)} patients in these buckets. Anyone already mid-sequence in another
          running campaign is left out at launch.
        </p>

        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <input type="checkbox" name="requiresEmail" defaultChecked style={{ marginTop: 4 }} />
            <span className="t-secondary" style={{ color: "var(--color-ink)" }}>
              Only patients with email consent and a working address
            </span>
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <input type="checkbox" name="requiresSms" style={{ marginTop: 4 }} />
            <span className="t-secondary" style={{ color: "var(--color-ink)" }}>
              Only patients with text consent on file
            </span>
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <input type="checkbox" name="autoEnroll" style={{ marginTop: 4 }} />
            <span className="t-secondary" style={{ color: "var(--color-ink)" }}>
              Enrol new matches daily as patients cross into these buckets
            </span>
          </label>
        </div>
      </section>

      <section>
        <p className="t-label" style={{ margin: "0 0 8px" }}>
          Sequence
        </p>
        <div style={{ display: "grid", gap: 16 }}>
          {steps.map((step, index) => {
            const pool = step.channel === "sms" ? smsTemplates : emailTemplates;
            const template = pool.find((t) => t.id === step.templateId) ?? pool[0];
            const warnings = template
              ? lintCopy({ subject: template.subject, body: template.body, channel: step.channel })
              : [];
            return (
              <div key={index} className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
                <input type="hidden" name={`step${index}Channel`} value={step.channel} />
                <input type="hidden" name={`step${index}Template`} value={step.templateId} />

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="t-label" style={{ margin: 0 }}>
                    Step {index + 1}
                  </span>
                  <button
                    type="button"
                    className="chip"
                    data-active={step.channel === "email"}
                    onClick={() => setStep(index, { channel: "email" })}
                  >
                    <Icon name="mail" size={16} />
                    Email
                  </button>
                  <button
                    type="button"
                    className="chip"
                    data-active={step.channel === "sms"}
                    disabled={!smsAllowed || smsTemplates.length === 0}
                    title={smsAllowed ? undefined : smsReason}
                    onClick={() => smsAllowed && setStep(index, { channel: "sms" })}
                    style={!smsAllowed ? { color: "var(--color-ink-3)" } : undefined}
                  >
                    <Icon name="message" size={16} />
                    Text
                  </button>
                </div>

                <label style={{ display: "grid", gap: 4 }}>
                  <span className="t-secondary">Template</span>
                  <select
                    className="input"
                    value={step.templateId}
                    onChange={(event) => setStep(index, { templateId: event.target.value })}
                  >
                    {pool.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: "grid", gap: 4 }}>
                  <span className="t-secondary">Days after enrolment</span>
                  <input
                    className="input"
                    type="number"
                    name={`step${index}Offset`}
                    min={0}
                    max={120}
                    value={step.offset}
                    onChange={(event) => setStep(index, { offset: Number(event.target.value) })}
                  />
                </label>

                {template && (
                  <div className="hairline-t" style={{ paddingTop: 12 }}>
                    {template.subject && (
                      <p className="t-secondary" style={{ margin: "0 0 4px", color: "var(--color-ink)" }}>
                        <strong style={{ fontWeight: 500 }}>Subject:</strong> {template.subject}
                      </p>
                    )}
                    <p
                      className="t-secondary"
                      style={{ margin: 0, whiteSpace: "pre-wrap", maxHeight: 120, overflow: "hidden" }}
                    >
                      {template.body}
                    </p>
                  </div>
                )}

                {warnings.length > 0 && (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
                    {warnings.map((warning) => (
                      <li
                        key={warning.code}
                        className="t-secondary"
                        style={{ color: "var(--color-amber-text)", display: "flex", gap: 6 }}
                      >
                        <Icon name="alert" size={16} style={{ flex: "none", marginTop: 1 }} />
                        {warning.message}
                      </li>
                    ))}
                  </ul>
                )}

                {steps.length > 1 && (
                  <button
                    type="button"
                    className="btn-quiet"
                    onClick={() => setSteps((s) => s.filter((_, i) => i !== index))}
                  >
                    Remove step
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {steps.length < maxSteps && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: 12 }}
            onClick={() =>
              setSteps((s) => [
                ...s,
                {
                  channel: "email",
                  templateId: emailTemplates[0]?.id ?? "",
                  offset: (s[s.length - 1]?.offset ?? 0) + 7,
                },
              ])
            }
          >
            <Icon name="plus" size={18} />
            Add step
          </button>
        )}
        {steps.length >= maxSteps && (
          <p className="t-secondary" style={{ marginTop: 12 }}>
            Your plan runs sequences up to {maxSteps} steps.
          </p>
        )}
      </section>

      <label style={{ display: "grid", gap: 6 }}>
        <span className="t-label">Maximum touches per patient</span>
        <input className="input" type="number" name="maxTouches" min={1} max={10} defaultValue={3} />
        <span className="t-secondary">
          A hard cap, checked at send time. Nobody receives more than this from this campaign, whatever
          the sequence says.
        </span>
      </label>

      {state.error && (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-red)", margin: 0 }}>
          {state.error}
        </p>
      )}

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save as draft"}
      </button>
      <p className="t-label" style={{ margin: 0 }}>
        Nothing sends until you launch it
      </p>
    </form>
  );
}
